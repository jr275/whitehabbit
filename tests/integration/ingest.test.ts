import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { closePool, createTenant, hasDatabase, migrate, resetPocket2, testPool, type Tenant } from "../support/db"
import { getItem, saveItem } from "../support/scoped-repo"
import { backoffMs, claimJobs, enqueueJob } from "../support/scoped-repo"
import { runIngestTick } from "@/lib/pocket2/ingest/worker"
import { fetchForIngest, type FetchResult } from "@/lib/pocket2/ingest/fetch"
import type { PageFetcher, RobotsChecker } from "@/lib/pocket2/ingest/pipeline"

const describeDb = hasDatabase ? describe : describe.skip

/* ---- fixtures ------------------------------------------------------ */

const PROSE = "<p>" + "This is a genuine sentence of article prose that goes on for a while. ".repeat(30) + "</p>"

function htmlPage(opts: { title?: string; description?: string; body?: string; head?: string } = {}) {
  return `<!doctype html><html lang="en"><head>
    <title>${opts.title ?? "Fixture"}</title>
    <meta property="og:title" content="${opts.title ?? "Fixture"}">
    ${opts.description ? `<meta property="og:description" content="${opts.description}">` : ""}
    <meta property="og:image" content="https://cdn.example.com/cover.png">
    ${opts.head ?? ""}
  </head><body><article><h1>${opts.title ?? "Fixture"}</h1>${opts.body ?? PROSE}</article></body></html>`
}

const serving = (html: string, extra: Partial<FetchResult> = {}): PageFetcher =>
  async (url) => ({ ok: true, finalUrl: url, status: 200, contentType: "text/html",
                    html, noArchive: false, bytes: html.length, ...extra } as FetchResult)

const failing = (result: FetchResult): PageFetcher => async () => result
const robotsAllow: RobotsChecker = async () => ({ allowed: true, unknown: false })

async function processOne(fetcher: PageFetcher, robotsChecker: RobotsChecker = robotsAllow) {
  return runIngestTick(5, { fetcher, robotsChecker })
}

/* ---- the fetch guard ------------------------------------------------ */

describe("fetchForIngest — the SSRF boundary", () => {
  // No database and no network needed: these must be refused before
  // any request leaves the process.
  it.each([
    ["loopback by name", "http://localhost:8080/admin"],
    ["loopback by address", "http://127.0.0.1/"],
    ["IPv6 loopback", "http://[::1]/"],
    ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
    ["private 10/8", "http://10.0.0.5/"],
    ["private 192.168/16", "http://192.168.1.1/"],
    ["private 172.16/12", "http://172.16.0.1/"],
    ["unspecified address", "http://0.0.0.0/"],
    ["file scheme", "file:///etc/passwd"],
    ["ftp scheme", "ftp://example.com/x"],
  ])("refuses %s without fetching", async (_label, url) => {
    const result = await fetchForIngest(url)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("blocked_unsafe_url")
  })

  it("never reveals the internal address it refused", async () => {
    const result = await fetchForIngest("http://169.254.169.254/latest/meta-data/")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).not.toContain("169.254")
      expect(result.message).not.toContain("meta-data")
    }
  })
})

describe("backoffMs", () => {
  it("grows exponentially and then stops", () => {
    expect(backoffMs(1)).toBe(30_000)
    expect(backoffMs(2)).toBe(60_000)
    expect(backoffMs(3)).toBe(120_000)
    expect(backoffMs(50)).toBe(30 * 60_000) // capped
  })
})

/* ---- the pipeline, end to end into the database --------------------- */

describeDb("ingestion pipeline", () => {
  let t: Tenant

  beforeAll(async () => { await migrate() })
  afterAll(async () => { await resetPocket2(); await closePool() })
  beforeEach(async () => {
    await resetPocket2()
    // Jobs cascade from organizations, so this clears the queue too.
    t = await createTenant("ingest")
  })

  it("turns a pending save into a complete item with a reader document", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://example.com/an-article")
    expect(item.ingestStatus).toBe("pending")

    const tick = await processOne(serving(htmlPage({
      title: "Attention and machine learning", description: "A survey.",
    })))
    expect(tick).toMatchObject({ claimed: 1, succeeded: 1, failed: 0 })

    const after = await getItem(t.orgId, t.userId, item.id)
    expect(after).toMatchObject({
      ingestStatus: "ready",
      readerStatus: "available",
      title: "Attention and machine learning",
      description: "A survey.",
      imageUrl: "https://cdn.example.com/cover.png",
      contentType: "article",
    })
    expect(after!.wordCount).toBeGreaterThan(150)
    expect(after!.readingTimeSeconds).toBeGreaterThan(0)

    // the reader document and its segments really landed
    const doc = await testPool().query(
      "SELECT extraction_status, html, text, word_count FROM reader_documents WHERE item_id = $1", [item.id])
    expect(doc.rows[0].extraction_status).toBe("ok")
    expect(doc.rows[0].html).toContain("<p>")
    expect(doc.rows[0].html).not.toMatch(/<script/i)

    const segs = await testPool().query(
      "SELECT ordinal, kind, text, char_start, char_end FROM reader_segments WHERE document_id = (SELECT id FROM reader_documents WHERE item_id = $1) ORDER BY ordinal", [item.id])
    expect(segs.rows.length).toBeGreaterThan(0)
    for (const row of segs.rows) {
      expect(row.char_end - row.char_start).toBe(row.text.length)
    }

    // the auto-suggested tag is marked as a machine suggestion
    const tags = await testPool().query(
      `SELECT t.slug, sit.source FROM saved_item_tags sit
         JOIN tags t ON t.id = sit.tag_id WHERE sit.item_id = $1`, [item.id])
    expect(tags.rows.map((r) => r.slug)).toContain("ai")
    expect(tags.rows.every((r) => r.source === "auto")).toBe(true)
  })

  it("saves the link and reports the reason when a page is paywalled", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://paper.test/story")
    await processOne(serving(htmlPage({
      title: "Behind the wall",
      body: `<p>Subscribe to continue reading this article.</p>${PROSE}`,
    })))

    const after = await getItem(t.orgId, t.userId, item.id)
    // The save is NOT lost — metadata is real, only the body is absent.
    expect(after).toMatchObject({ ingestStatus: "ready", readerStatus: "not_available", title: "Behind the wall" })

    const doc = await testPool().query("SELECT extraction_status, failure_reason, html FROM reader_documents WHERE item_id = $1", [item.id])
    expect(doc.rows[0]).toMatchObject({ extraction_status: "failed", failure_reason: "paywalled", html: null })
  })

  it("does not store a copy when the publisher asks not to be archived", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://noarchive.test/a")
    await processOne(serving(htmlPage({ head: `<meta name="robots" content="noarchive">` })))

    const after = await getItem(t.orgId, t.userId, item.id)
    expect(after!.readerStatus).toBe("not_available")
    expect(after!.title).toBeTruthy() // metadata is still fine

    const doc = await testPool().query("SELECT failure_reason, html, text FROM reader_documents WHERE item_id = $1", [item.id])
    expect(doc.rows[0]).toMatchObject({ failure_reason: "robots_disallowed", html: null, text: null })
  })

  it("does not fetch at all when robots.txt disallows the path", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://strict.test/private")
    let fetched = false
    const spy: PageFetcher = async (url) => { fetched = true; return serving(htmlPage())(url) }

    await runIngestTick(5, { fetcher: spy, robotsChecker: async () => ({ allowed: false, unknown: false }) })

    expect(fetched, "robots must be asked BEFORE the page is fetched").toBe(false)
    const after = await getItem(t.orgId, t.userId, item.id)
    expect(after!.ingestStatus).toBe("failed")
    expect(after!.ingestError).toMatch(/asks automated tools not to fetch/i)
  })

  it("reports an SSRF-refused address as our refusal, not as the publisher's", async () => {
    // REGRESSION: checkRobots() fetches robots.txt from the same
    // origin, so the SSRF guard fired there first and the pipeline
    // reported "this site asks automated tools not to fetch this page"
    // about an address the publisher has never heard of.
    const { checkRobots } = await import("@/lib/pocket2/ingest/robots")
    const verdict = await checkRobots("http://169.254.169.254/latest/meta-data/")
    expect(verdict.allowed).toBe(false)
    expect(verdict.unsafe).toBe(true)

    const { item } = await saveItem(t.orgId, t.userId, "http://169.254.169.254/latest/meta-data/")
    let fetched = false
    await runIngestTick(5, {
      fetcher: async (url) => { fetched = true; return serving(htmlPage())(url) },
      robotsChecker: checkRobots,
    })
    expect(fetched, "the internal address must never be requested").toBe(false)

    const after = await getItem(t.orgId, t.userId, item.id)
    expect(after!.ingestStatus).toBe("failed")
    expect(after!.ingestError).toMatch(/can't be fetched safely/i)
    expect(after!.ingestError).not.toMatch(/asks automated tools/i)
  })

  it("classifies a video host as a video even with no article body", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://www.youtube.com/watch?v=abc123")
    await processOne(serving(htmlPage({ title: "A talk", body: "<p>short</p>" })))
    const after = await getItem(t.orgId, t.userId, item.id)
    expect(after).toMatchObject({ contentType: "video", readerStatus: "not_available", ingestStatus: "ready" })
  })

  it("retries a transient failure and gives up on a permanent one", async () => {
    const transient = await saveItem(t.orgId, t.userId, "https://flaky.test/a")
    await processOne(failing({ ok: false, reason: "timeout", message: "timed out" }))
    let job = await testPool().query("SELECT status, attempts, next_attempt_at FROM ingest_jobs WHERE item_id = $1", [transient.item.id])
    expect(job.rows[0].status).toBe("queued")            // will try again
    expect(Number(job.rows[0].next_attempt_at)).toBeGreaterThan(Date.now())  // …but not immediately
    // the item stays pending rather than being marked failed prematurely
    expect((await getItem(t.orgId, t.userId, transient.item.id))!.ingestStatus).toBe("pending")

    const permanent = await saveItem(t.orgId, t.userId, "https://binary.test/file")
    await testPool().query("DELETE FROM ingest_jobs WHERE item_id = $1", [transient.item.id])
    await processOne(failing({ ok: false, reason: "unsupported_content_type", message: "not a readable page" }))
    job = await testPool().query("SELECT status FROM ingest_jobs WHERE item_id = $1", [permanent.item.id])
    expect(job.rows[0].status).toBe("failed")            // never retried
    expect((await getItem(t.orgId, t.userId, permanent.item.id))!.ingestStatus).toBe("failed")
  })

  it("is idempotent — re-ingesting replaces the document rather than duplicating it", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://example.com/twice")
    await processOne(serving(htmlPage({ title: "First pass" })))
    await enqueueJob(t.orgId, "metadata", item.id, {})
    await processOne(serving(htmlPage({ title: "Second pass" })))

    const docs = await testPool().query("SELECT count(*)::int AS n FROM reader_documents WHERE item_id = $1", [item.id])
    expect(docs.rows[0].n).toBe(1)
    const segDocs = await testPool().query(
      `SELECT count(DISTINCT document_id)::int AS n FROM reader_segments
        WHERE document_id IN (SELECT id FROM reader_documents WHERE item_id = $1)`, [item.id])
    expect(segDocs.rows[0].n).toBe(1)
    expect((await getItem(t.orgId, t.userId, item.id))!.title).toBe("Second pass")
  })

  it("never blanks a field a later run merely failed to find", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://example.com/keep")
    await processOne(serving(htmlPage({ title: "Good title", description: "Good description." })))
    await enqueueJob(t.orgId, "metadata", item.id, {})
    // second pass: a page with no description at all
    await processOne(serving(`<!doctype html><html><head><title>Good title</title></head><body><article>${PROSE}</article></body></html>`))

    expect((await getItem(t.orgId, t.userId, item.id))!.description).toBe("Good description.")
  })

  it("makes an item searchable by its ingested content", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://example.com/searchable")
    await processOne(serving(htmlPage({ title: "Photosynthesis explained", description: "How leaves work." })))
    const { listItems } = await import("../support/scoped-repo")
    const found = await listItems(t.orgId, t.userId, { search: "photosynthesis" })
    expect(found.items.map((i) => i.id)).toEqual([item.id])
  })
})

/* ---- the queue itself ----------------------------------------------- */

describeDb("ingest job queue", () => {
  let a: Tenant
  let b: Tenant

  beforeAll(async () => { await migrate() })
  afterAll(async () => { await resetPocket2(); await closePool() })
  beforeEach(async () => {
    await resetPocket2()
    a = await createTenant("qa")
    b = await createTenant("qb")
  })

  it("never hands the same job to two concurrent workers", async () => {
    for (let n = 0; n < 12; n++) await saveItem(a.orgId, a.userId, `https://example.com/q-${n}`)

    // Four ticks racing, exactly as four warm serverless instances
    // would. SKIP LOCKED must make every claim disjoint.
    const batches = await Promise.all([1, 2, 3, 4].map(() => claimJobs(5, `w${Math.random()}`)))
    const ids = batches.flat().map((j) => j.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeLessThanOrEqual(12)
  })

  it("reclaims a job whose worker died mid-flight", async () => {
    const { item } = await saveItem(a.orgId, a.userId, "https://example.com/stranded")
    const [claimed] = await claimJobs(1, "worker-that-dies")
    expect(claimed.itemId).toBe(item.id)

    // Not reclaimable while the lease is live…
    expect(await claimJobs(1, "worker-2")).toHaveLength(0)
    // …but reclaimable once it has expired.
    await testPool().query("UPDATE ingest_jobs SET locked_until = $1 WHERE id = $2", [Date.now() - 1000, claimed.id])
    const [reclaimed] = await claimJobs(1, "worker-2")
    expect(reclaimed.id).toBe(claimed.id)
    expect(reclaimed.attempts).toBe(2)
  })

  it("keeps each tenant's ingestion inside its own organization", async () => {
    const mine = await saveItem(a.orgId, a.userId, "https://example.com/mine")
    await saveItem(b.orgId, b.userId, "https://example.com/theirs")

    await runIngestTick(10, { fetcher: serving(htmlPage({ title: "Ingested" })), robotsChecker: robotsAllow })

    // Both were processed, and each document is filed under its own org.
    const docs = await testPool().query(
      "SELECT org_id, item_id FROM reader_documents WHERE org_id = ANY($1::text[]) ORDER BY org_id",
      [[a.orgId, b.orgId]])
    expect(docs.rows).toHaveLength(2)
    const mineDoc = docs.rows.find((r) => r.item_id === mine.item.id)
    expect(mineDoc.org_id).toBe(a.orgId)

    // And tenant B still cannot see tenant A's item.
    expect(await getItem(b.orgId, b.userId, mine.item.id)).toBeNull()
  })

  it("does nothing, harmlessly, when the queue is empty", async () => {
    const tick = await runIngestTick(5, { fetcher: serving(htmlPage()), robotsChecker: robotsAllow })
    expect(tick).toMatchObject({ claimed: 0, succeeded: 0, failed: 0, retrying: 0 })
  })
})


/* ================================================================== *
 * ADDED BY THE PHASE 2 SECURITY CHECKPOINT - FOCUS 3.
 *
 * The question these answer is: can a failure part-way through
 * ingestion leave the database describing something that never
 * happened?
 * ================================================================== */

describeDb("ingestion is all-or-nothing", () => {
  let t: Tenant
  beforeAll(async () => { await migrate() })
  afterAll(async () => { await resetPocket2(); await closePool() })
  beforeEach(async () => { await resetPocket2(); t = await createTenant("atomic") })

  it("writes nothing at all when persistence fails part-way", async () => {
    const { applyIngestResult } = await import("../support/scoped-repo")
    const { item } = await saveItem(t.orgId, t.userId, "https://example.com/atomic")

    await expect(applyIngestResult(
      t.orgId, item.id,
      { title: "Should not persist", description: null, author: null, contentType: "article",
        imageUrl: null, faviconUrl: null, publishedAt: null, wordCount: 100,
        readingTimeSeconds: 60, readerStatus: "available", metadata: {} },
      { extractionStatus: "ok", extractorVersion: "v", failureReason: null, heroImageUrl: null,
        html: "<p>x</p>", text: "x", language: "en", wordCount: 1,
        // An invalid segment kind violates the CHECK constraint, so the
        // segment INSERT fails after the item UPDATE has already run.
        segments: [{ ordinal: 0, kind: "not_a_valid_kind" as never, text: "x", charStart: 0, charEnd: 1 }] },
      ["ai"],
    )).rejects.toThrow()

    // The item must be untouched: no title, still pending, no reader
    // document, no tag. A half-applied ingestion would claim we had
    // extracted an article we do not hold.
    const after = await getItem(t.orgId, t.userId, item.id)
    expect(after!.title).not.toBe("Should not persist")
    expect(after!.ingestStatus).toBe("pending")
    expect(after!.readerStatus).toBe("not_available")
    for (const table of ["reader_documents", "reader_segments", "saved_item_tags"]) {
      const { rows } = await testPool().query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE org_id = $1`, [t.orgId])
      expect(rows[0].n, table).toBe(0)
    }
  })

  it("handles empty, tiny and structurally broken pages without corrupting anything", async () => {
    const pages = ["", "<html>", "<!doctype html>", "not html at all",
                   "<html><head><title></title></head><body></body></html>",
                   "<p>" + "\uFFFD ".repeat(500) + "</p>"]
    for (const [index, html] of pages.entries()) {
      const { item } = await saveItem(t.orgId, t.userId, `https://example.com/edge-${index}`)
      await processOne(serving(html))
      const after = await getItem(t.orgId, t.userId, item.id)
      // Always resolves to a definite state, never left pending.
      expect(["ready", "failed"], `page ${index}`).toContain(after!.ingestStatus)
      // And never claims a reader copy it does not have.
      if (after!.readerStatus === "available") {
        const { rows } = await testPool().query<{ n: number }>(
          "SELECT count(*)::int AS n FROM reader_documents WHERE item_id = $1 AND html IS NOT NULL", [item.id])
        expect(rows[0].n, `page ${index}`).toBe(1)
      }
    }
  })

  it("prefers OpenGraph when a page declares the same field three ways", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://example.com/dupe-meta")
    await processOne(serving(`<!doctype html><html><head>
      <title>Title tag</title>
      <meta name="twitter:title" content="Twitter title">
      <meta property="og:title" content="OpenGraph title">
      <script type="application/ld+json">{"headline":"JSON-LD title"}</script>
    </head><body><article>${PROSE}</article></body></html>`))
    expect((await getItem(t.orgId, t.userId, item.id))!.title).toBe("OpenGraph title")
  })

  it("does not let a declared charset corrupt the stored text", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://example.com/charset")
    // A page claiming an encoding it is not actually in must not throw
    // or produce a row that fails to store.
    await processOne(async (url) => ({
      ok: true, finalUrl: url, status: 200, contentType: "text/html; charset=iso-8859-15",
      html: htmlPage({ title: "Caf\u00e9 na\u00efve", description: "\u00dcn\u00efcode" }),
      noArchive: false, bytes: 100,
    }))
    const after = await getItem(t.orgId, t.userId, item.id)
    expect(after!.ingestStatus).toBe("ready")
    expect(after!.title).toContain("Caf")
  })
})
