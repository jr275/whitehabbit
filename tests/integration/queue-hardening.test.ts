import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { closePool, createTenant, hasDatabase, migrate, resetPocket2, testPool, type Tenant } from "../support/db"
import { getItem, saveItem } from "@/lib/pocket2/repo/items"
import { claimJobs, completeJob, failJob, reapAbandonedJobs } from "@/lib/pocket2/repo/jobs"
import { runIngestTick } from "@/lib/pocket2/ingest/worker"
import { MAX_SEGMENTS, segmentArticle } from "@/lib/pocket2/ingest/extract"
import type { PageFetcher, RobotsChecker } from "@/lib/pocket2/ingest/pipeline"

/* Added by the Phase 2 security checkpoint: the queue and
 * resource-consumption properties an attacker would probe. */

const describeDb = hasDatabase ? describe : describe.skip
const robotsAllow: RobotsChecker = async () => ({ allowed: true, unknown: false })

describeDb("queue: a crashing job cannot loop forever (QUEUE-01)", () => {
  let t: Tenant
  beforeAll(async () => { await migrate() })
  afterAll(async () => { await resetPocket2(); await closePool() })
  beforeEach(async () => { await resetPocket2(); t = await createTenant("qh") })

  it("stops handing out a job once its attempts reach the limit", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://example.com/poison")

    // Simulate a worker that dies before it can report anything: the
    // lease expires and no status is ever written.
    let claims = 0
    for (let round = 0; round < 15; round++) {
      const [job] = await claimJobs(1, `w${round}`)
      if (!job) break
      claims++
      await testPool().query("UPDATE ingest_jobs SET locked_until = $1 WHERE id = $2", [Date.now() - 1, job.id])
    }

    const { rows } = await testPool().query<{ status: string; attempts: number; max_attempts: number }>(
      "SELECT status, attempts, max_attempts FROM ingest_jobs WHERE item_id = $1", [item.id])
    // REGRESSION: this ran 12+ times before the claim guard existed.
    expect(claims).toBeLessThanOrEqual(rows[0].max_attempts)
    expect(await claimJobs(1, "one-more")).toHaveLength(0)
  })

  it("gives an abandoned job a terminal state instead of leaving it invisible", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://example.com/abandoned")
    for (let round = 0; round < 6; round++) {
      const [job] = await claimJobs(1, `w${round}`)
      if (!job) break
      await testPool().query("UPDATE ingest_jobs SET locked_until = $1 WHERE id = $2", [Date.now() - 1, job.id])
    }
    expect(await reapAbandonedJobs()).toBeGreaterThan(0)

    const { rows } = await testPool().query<{ status: string; last_error: string }>(
      "SELECT status, last_error FROM ingest_jobs WHERE item_id = $1", [item.id])
    expect(rows[0].status).toBe("failed")
    expect(rows[0].last_error).toBeTruthy()
  })

  it("still completes a healthy job normally", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://example.com/healthy")
    const [job] = await claimJobs(1, "w")
    await completeJob(job.id)
    const { rows } = await testPool().query("SELECT status FROM ingest_jobs WHERE item_id = $1", [item.id])
    expect(rows[0].status).toBe("done")
    expect(await claimJobs(1, "w2")).toHaveLength(0)
  })

  it("retries a genuine transient failure the full number of times, then stops", async () => {
    await saveItem(t.orgId, t.userId, "https://example.com/flaky")
    let runs = 0
    for (let round = 0; round < 15; round++) {
      const [job] = await claimJobs(1, `w${round}`)
      if (!job) break
      runs++
      await failJob(job.id, "timeout", { retryable: true, attempts: job.attempts, maxAttempts: job.maxAttempts })
      // fast-forward past the backoff so the loop is not just waiting
      await testPool().query("UPDATE ingest_jobs SET next_attempt_at = $1 WHERE id = $2", [Date.now() - 1, job.id])
    }
    expect(runs).toBe(4) // exactly max_attempts, then terminal
    const { rows } = await testPool().query("SELECT status FROM ingest_jobs")
    expect(rows[0].status).toBe("failed")
  })

  it("keeps two concurrent workers deterministic on the same queue", async () => {
    for (let n = 0; n < 8; n++) await saveItem(t.orgId, t.userId, `https://example.com/c-${n}`)

    const fetcher: PageFetcher = async (url) => ({
      ok: true, finalUrl: url, status: 200, contentType: "text/html",
      html: `<html><head><title>T</title></head><body><article>${"<p>Real prose here for the extractor. ".repeat(30)}</article></body></html>`,
      noArchive: false, bytes: 100,
    })

    const [one, two] = await Promise.all([
      runIngestTick(8, { fetcher, robotsChecker: robotsAllow }),
      runIngestTick(8, { fetcher, robotsChecker: robotsAllow }),
    ])
    // Disjoint claims: between them they process each job exactly once.
    expect(one.claimed + two.claimed).toBe(8)

    const { rows } = await testPool().query<{ n: number }>("SELECT count(*)::int AS n FROM ingest_jobs WHERE status <> 'done'")
    expect(rows[0].n).toBe(0)
    // and exactly one reader document per item — no double-processing
    const docs = await testPool().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM reader_documents WHERE org_id = $1", [t.orgId])
    expect(docs.rows[0].n).toBe(8)
  })

  it("survives a malformed job payload without wedging the queue", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://example.com/badpayload")
    await testPool().query("UPDATE ingest_jobs SET payload = $1::jsonb WHERE item_id = $2",
      [JSON.stringify({ url: { nested: [1, 2] }, unexpected: null }), item.id])

    const fetcher: PageFetcher = async (url) => ({
      ok: true, finalUrl: url, status: 200, contentType: "text/html",
      html: `<html><head><title>T</title></head><body><article>${"<p>Prose for the extractor here. ".repeat(30)}</article></body></html>`,
      noArchive: false, bytes: 10,
    })
    // The worker reads the URL from saved_items, never from the
    // payload, so a poisoned payload cannot redirect the fetch.
    const tick = await runIngestTick(5, { fetcher, robotsChecker: robotsAllow })
    expect(tick.succeeded).toBe(1)
    expect((await getItem(t.orgId, t.userId, item.id))!.ingestStatus).toBe("ready")
  })

  it("drops a job whose item was deleted, rather than retrying it", async () => {
    const { item } = await saveItem(t.orgId, t.userId, "https://example.com/gone")
    await testPool().query("DELETE FROM saved_items WHERE id = $1", [item.id])
    // The job cascades with the item, so there is nothing left to run.
    const { rows } = await testPool().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM ingest_jobs WHERE item_id = $1", [item.id])
    expect(rows[0].n).toBe(0)
  })
})

describe("resource limits: one URL cannot become unbounded work (RES-01)", () => {
  it("caps the number of segments an article can produce", () => {
    const { segments, truncated } = segmentArticle("<p>sentence</p>".repeat(60_000))
    // REGRESSION: this produced 60,000 rows before the cap.
    expect(segments.length).toBeLessThanOrEqual(MAX_SEGMENTS)
    expect(truncated).toBe(true)
  })

  it("does not truncate a normal article, and says so", () => {
    const { segments, truncated } = segmentArticle("<p>paragraph</p>".repeat(300))
    expect(segments).toHaveLength(300)
    expect(truncated).toBe(false)
  })

  it("marks a truncated extraction 'partial' rather than 'ok'", async () => {
    const { extractArticle } = await import("@/lib/pocket2/ingest/extract")
    const body = "<p>This is a real sentence of prose in the article body.</p>".repeat(20_000)
    const result = extractArticle(
      `<!doctype html><html><head><title>T</title></head><body><article><h1>T</h1>${body}</article></body></html>`,
      "https://example.com/huge",
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.segments.length).toBeLessThanOrEqual(MAX_SEGMENTS)
      expect(result.status).toBe("partial") // honest, not silently clipped
    }
  })
})
