/* ================================================================== *
 * INGESTION — end to end against a REAL PostgreSQL.
 *
 * Only the network hop is stubbed (this sandbox has no direct outbound
 * HTTP). Everything else is real: extraction, sanitization,
 * persistence, state transitions, compare-and-swap claiming, retry
 * classification and the reaper. The SSRF boundary itself is tested
 * against real sockets in ssrf.test.ts.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { createObjectWithJob, getObject, getObjectWithContent, listObjects, retryObject } from "@/lib/knowledge/content/repo"
import { reapStaleJobs, STALE_LOCK_MS } from "@/lib/knowledge/ingestion/jobs"
import { runIngestJob, type Fetcher } from "@/lib/knowledge/ingestion/pipeline"
import { SafeFetchError, type FetchFailureCode } from "@/lib/knowledge/ingestion/safe-fetch"
import { canonicalizeUrl } from "@/lib/knowledge/ingestion/url"
import { closeTestPool, createTenant, getTestPool, prepareDatabase } from "../helpers/db.ts"
import type { AccessScope } from "@/lib/knowledge/access/scope"

const ARTICLE_HTML = `<!doctype html><html lang="en">
<head><title>Test Article</title>
<meta property="og:site_name" content="Test Site">
<meta property="og:description" content="A test description.">
<meta name="author" content="Ada Lovelace"></head>
<body><nav><a href="/">Home</a></nav>
<article>
<p>This is a sufficiently long first paragraph of real article prose so that the density heuristic recognises it as a body rather than as navigation chrome.</p>
<p>This is a second paragraph, also long enough to count, which pushes the word total comfortably past the minimum threshold for a readable article.</p>
<script>window.evil = 1</script>
</article></body></html>`

function stubFetch(html: string, url = "https://example.com/test-article"): Fetcher {
  return async () => ({
    resolvedUrl: url,
    originUrl: null,
    status: 200,
    contentType: "text/html",
    html,
    bytes: html.length,
  })
}

const failingFetch =
  (code: FetchFailureCode): Fetcher =>
  async () => {
    throw new SafeFetchError(code, code === "timeout" ? "That site took too long." : "That page couldn't be loaded.")
  }

async function saveUrl(scope: AccessScope, url: string) {
  const c = canonicalizeUrl(url)
  return createObjectWithJob(scope, {
    submittedUrl: c.submittedUrl,
    canonicalUrl: c.canonicalUrl,
    urlHash: c.urlHash,
    domain: c.domain,
  })
}

describe("ingestion", () => {
  let alice: AccessScope
  let bob: AccessScope

  before(async () => {
    await prepareDatabase()
    const a = await createTenant("alice")
    const b = await createTenant("bob")
    alice = { userId: a.userId, workspaceId: a.orgId }
    bob = { userId: b.userId, workspaceId: b.orgId }
  })
  after(async () => {
    await closeTestPool()
  })

  it("creates the object and its job in one transaction", async () => {
    const { object, created } = await saveUrl(alice, "https://example.com/one")
    assert.equal(created, true)
    assert.equal(object.status, "pending")

    const jobs = await getTestPool().query("SELECT * FROM knowledge_jobs WHERE object_id = $1", [object.id])
    assert.equal(jobs.rows.length, 1, "an object must never exist without its job")
    assert.equal(jobs.rows[0].status, "pending")
  })

  it("deduplicates: saving the same URL twice yields one object and one job", async () => {
    const first = await saveUrl(alice, "https://example.com/dupe?utm_source=a")
    const second = await saveUrl(alice, "https://example.com/dupe")

    assert.equal(second.created, false, "the second save must not create work")
    assert.equal(second.object.id, first.object.id)

    const jobs = await getTestPool().query("SELECT * FROM knowledge_jobs WHERE object_id = $1", [first.object.id])
    assert.equal(jobs.rows.length, 1)
  })

  it("persists extracted content on success", async () => {
    const { object } = await saveUrl(alice, "https://example.com/success")
    const job = await claimNextJobFor(object.id)

    const outcome = await runIngestJob(job, { fetch: stubFetch(ARTICLE_HTML) })
    assert.equal(outcome.status, "completed")

    const result = await getObjectWithContent(alice, object.id)
    assert.ok(result)
    assert.equal(result.object.status, "completed")
    assert.equal(result.object.title, "Test Article")
    assert.deepEqual(result.object.authors, ["Ada Lovelace"])
    assert.equal(result.object.siteName, "Test Site")
    assert.equal(result.object.extractor, "readability@1")
    assert.ok((result.object.wordCount ?? 0) > 30)
    assert.ok(result.content?.contentText?.includes("density heuristic"))
    // Sanitized on write: the script never reaches storage.
    assert.doesNotMatch(result.content?.contentHtml ?? "", /<script|window\.evil/i)
    assert.doesNotMatch(result.content?.contentText ?? "", /window\.evil/i)
  })

  it("persists an explicit failure state, with a user-facing reason", async () => {
    const { object } = await saveUrl(alice, "https://example.com/gone")
    const job = await claimNextJobFor(object.id)

    // http_4xx is a determinate answer: terminal, no retry.
    const outcome = await runIngestJob(job, { fetch: failingFetch("http_4xx") })
    assert.equal(outcome.status, "failed")

    const stored = await getObject(alice, object.id)
    assert.equal(stored?.status, "failed")
    assert.equal(stored?.failureCode, "http_4xx")
    assert.ok(stored?.failureMessage && stored.failureMessage.length > 0, "a failure must be explainable to the user")
  })

  it("retries a transient failure with backoff, then gives up", async () => {
    const { object } = await saveUrl(alice, "https://example.com/flaky")
    const db = getTestPool()

    // attempt 1 and 2 -> retryable, back to pending with a future run_after
    for (const expected of [1, 2]) {
      const job = await claimNextJobFor(object.id)
      assert.equal(job.attempt, expected)
      const outcome = await runIngestJob(job, { fetch: failingFetch("timeout") })
      assert.equal(outcome.status, "retrying")

      const row = await db.query("SELECT status, run_after FROM knowledge_jobs WHERE object_id = $1", [object.id])
      assert.equal(row.rows[0].status, "pending")
      assert.ok(Number(row.rows[0].run_after) > Date.now(), "backoff must push the next attempt into the future")

      // Skip the backoff so the test does not sleep.
      await db.query("UPDATE knowledge_jobs SET run_after = $1 WHERE object_id = $2", [Date.now(), object.id])
    }

    // attempt 3 exhausts the ceiling -> terminal
    const last = await claimNextJobFor(object.id)
    assert.equal(last.attempt, 3)
    const outcome = await runIngestJob(last, { fetch: failingFetch("timeout") })
    assert.equal(outcome.status, "failed", "retries must be bounded")

    const stored = await getObject(alice, object.id)
    assert.equal(stored?.status, "failed")
  })

  it("re-arms a failed item on explicit retry", async () => {
    const { object } = await saveUrl(alice, "https://example.com/retry-me")
    const job = await claimNextJobFor(object.id)
    await runIngestJob(job, { fetch: failingFetch("http_4xx") })

    assert.equal(await retryObject(alice, object.id), true)
    const stored = await getObject(alice, object.id)
    assert.equal(stored?.status, "pending")
    assert.equal(stored?.failureCode, null)

    const next = await claimNextJobFor(object.id)
    assert.equal(next.attempt, 1, "retry resets the attempt counter")
    const outcome = await runIngestJob(next, { fetch: stubFetch(ARTICLE_HTML) })
    assert.equal(outcome.status, "completed")
  })

  it("claims each job exactly once under concurrency", async () => {
    const { object } = await saveUrl(alice, "https://example.com/race")

    // Two runners race for the same single pending job.
    const [a, b] = await Promise.all([claimJobFor(object.id), claimJobFor(object.id)])
    const claims = [a, b].filter((j) => j !== null)
    assert.equal(claims.length, 1, "compare-and-swap must let exactly one runner win")

    // The loser must not have done the work either.
    const jobs = await getTestPool().query("SELECT attempt FROM knowledge_jobs WHERE object_id = $1", [object.id])
    assert.equal(jobs.rows[0].attempt, 1, "the attempt counter must increment once, not twice")
  })

  it("reaper recovers a job whose runner died mid-flight", async () => {
    const { object } = await saveUrl(alice, "https://example.com/stranded")
    const job = await claimNextJobFor(object.id)
    const db = getTestPool()

    // Simulate the runner dying after claiming: job stays 'active',
    // object stays 'fetching', lock goes stale.
    await db.query("UPDATE knowledge_objects SET status = 'fetching' WHERE id = $1", [object.id])
    await db.query("UPDATE knowledge_jobs SET locked_at = $1 WHERE id = $2", [Date.now() - STALE_LOCK_MS - 1000, job.id])

    const reaped = await reapStaleJobs()
    assert.ok(reaped.requeued >= 1, "a stranded job must be reclaimed")

    const jobRow = await db.query("SELECT status FROM knowledge_jobs WHERE id = $1", [job.id])
    assert.equal(jobRow.rows[0].status, "pending")
    const objectRow = await getObject(alice, object.id)
    assert.equal(objectRow?.status, "pending", "the object must not be left stuck in 'fetching'")
  })

  it("does not process an object twice (compare-and-swap on status)", async () => {
    const { object } = await saveUrl(alice, "https://example.com/once")
    const job = await claimNextJobFor(object.id)
    await runIngestJob(job, { fetch: stubFetch(ARTICLE_HTML) })

    // Re-running the same claimed job must be a no-op, not a re-fetch.
    let called = false
    const outcome = await runIngestJob(job, {
      fetch: async () => {
        called = true
        throw new SafeFetchError("timeout", "should never be called")
      },
    })
    assert.equal(outcome.status, "skipped")
    assert.equal(called, false, "a completed object must never be fetched again")
  })

  it("isolates tenants: user B cannot see or touch user A's item", async () => {
    const { object } = await saveUrl(alice, "https://example.com/private-to-alice")

    assert.equal(await getObject(bob, object.id), null, "cross-tenant read must return nothing")
    assert.equal(await getObjectWithContent(bob, object.id), null)
    assert.equal(await retryObject(bob, object.id), false, "cross-tenant write must be a no-op")

    const bobList = await listObjects(bob)
    assert.equal(
      bobList.items.some((i) => i.id === object.id),
      false,
      "another tenant's item must never appear in a list",
    )

    // And Alice still can.
    assert.ok(await getObject(alice, object.id))
  })

  it("paginates with a stable cursor", async () => {
    const solo = await createTenant("paginate")
    const scope: AccessScope = { userId: solo.userId, workspaceId: solo.orgId }
    for (let i = 0; i < 5; i++) await saveUrl(scope, `https://example.com/page-${i}`)

    const first = await listObjects(scope, { limit: 2 })
    assert.equal(first.items.length, 2)
    assert.ok(first.nextCursor)

    const second = await listObjects(scope, { limit: 2, cursor: parse(first.nextCursor) })
    assert.equal(second.items.length, 2)
    const overlap = first.items.filter((a) => second.items.some((b) => b.id === a.id))
    assert.equal(overlap.length, 0, "pages must not overlap")
  })
})

/* ---- helpers ---- */

function parse(raw: string | null) {
  if (!raw) return null
  const i = raw.indexOf("_")
  return { createdAt: Number(raw.slice(0, i)), id: raw.slice(i + 1) }
}

/**
 * Claim the job for a specific object, using the SAME compare-and-swap
 * the real claimNextJob uses (FOR UPDATE SKIP LOCKED + a status
 * predicate) but scoped to one object, so tests are deterministic
 * while the queue is shared between them.
 */
async function claimJobFor(objectId: string) {
  const { rows } = await getTestPool().query(
    `UPDATE knowledge_jobs
     SET status = 'active', locked_at = $1, locked_by = 'test-runner', attempt = attempt + 1, updated_at = $1
     WHERE id = (
       SELECT id FROM knowledge_jobs
       WHERE object_id = $2 AND status = 'pending'
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, org_id, object_id, attempt, max_attempts`,
    [Date.now(), objectId],
  )
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    id: r.id as string,
    workspaceId: r.org_id as string,
    objectId: r.object_id as string,
    attempt: r.attempt as number,
    maxAttempts: r.max_attempts as number,
  }
}

async function claimNextJobFor(objectId: string) {
  const job = await claimJobFor(objectId)
  if (!job) throw new Error(`no claimable job for ${objectId}`)
  return job
}
