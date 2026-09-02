/* ================================================================== *
 * DURABLE INGESTION JOBS (Commit 12A) — against a REAL PostgreSQL,
 * same reasoning as tests/knowledge/dedup.test.ts and summarize.test.
 * ts: what this suite actually characterizes is real SQL behavior —
 * the partial unique index, FOR UPDATE SKIP LOCKED under genuine
 * concurrency, ON DELETE CASCADE — none of which a mocked repo would
 * assert anything real about.
 *
 * The one real network call the ingestion pipeline makes (guardedFetch
 * -> safeFetch) is injected via the SAME `deps: FetchDeps` seam
 * fetchPageMetadata already exposed — runIngestJob/claimAndRunJob now
 * expose it too, purely for this suite (see service.ts's own doc
 * comment on runIngestJob). The SSRF guard itself still runs for
 * real; test URLs use a literal public IP so assertSafeUrl's check is
 * pure CIDR math with zero network I/O (see lib/security/ssrf-guard.
 * ts — a literal IP never triggers a DNS lookup), and only the socket
 * layer is faked.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import type { Transport } from "@/lib/security/safe-fetch"
import * as repo from "@/lib/knowledge/repo"
import {
  claimAndRunJob,
  computeBackoffMs,
  RETRY_BASE_DELAY_MS,
  RETRY_JITTER,
  RETRY_MAX_DELAY_MS,
  runIngestJob,
  saveUrl,
} from "@/lib/knowledge/service"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"

let alice: TestTenant
let bob: TestTenant

before(async () => {
  await prepareDatabase()
  alice = await createTenant("alice")
  bob = await createTenant("bob")
})
after(async () => {
  await closeTestPool()
})

/** A fresh, unextracted item — what saveUrl's insert produces before
 *  any job runs. Bypasses saveUrl itself so most tests don't need a
 *  real (even fake-transported) URL at all. */
async function freshItem(tenant: TestTenant) {
  return repo.insertSavedItem({
    orgId: tenant.orgId,
    userId: tenant.userId,
    url: `https://example.test/${randomUUID()}`,
    normalizedUrl: null,
    domain: "example.test",
  })
}

/** A literal public IP — assertSafeUrl checks it with pure CIDR math,
 *  no DNS, no network. Only the transport below is ever "called". */
const FAKE_PUBLIC_URL = "http://93.184.216.34/article"

function fakeHtmlTransport(html: string, contentType = "text/html; charset=utf-8"): Transport {
  return async () => ({
    status: 200,
    headers: { "content-type": contentType },
    body: Buffer.from(html, "utf8"),
  })
}

// extractBody() (lib/knowledge/extract.ts) requires >= 200 real
// characters before it treats something as a genuine article body
// rather than a stub — these paragraphs are written long enough to
// clear that real quality bar, not arbitrarily padded.
const REAL_ARTICLE_HTML = `<html><head><title>A Real Test Article</title></head>
<body><article><h1>A Real Test Article</h1>
<p>This is the first real paragraph of genuinely extracted content, written long enough to clear the extractor's real two-hundred character minimum threshold for what counts as a genuine article body rather than a stub or navigation fragment.</p>
<p>This is a second real paragraph, with more genuine text to extract, also written with enough real substance that the whole sample comfortably exceeds the same quality bar the extractor applies to every real page it processes.</p>
</article></body></html>`

function failingTransport(message = "ECONNREFUSED"): Transport {
  return async () => {
    throw new Error(message)
  }
}

/* ------------------------------------------------------------------ *
 * 1-3 — enqueue + idempotency + the database constraint itself
 * ------------------------------------------------------------------ */

describe("enqueueIngestJob", () => {
  it("creates a queued job with the right item/org/user, zero attempts, and the approved max_attempts default", async () => {
    const item = await freshItem(alice)
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)

    assert.equal(job.item_id, item.id)
    assert.equal(job.org_id, alice.orgId)
    assert.equal(job.created_by, alice.userId)
    assert.equal(job.job_type, "ingest")
    assert.equal(job.status, "queued")
    assert.equal(job.attempts, 0)
    assert.equal(job.max_attempts, repo.DEFAULT_MAX_ATTEMPTS)
    assert.equal(job.max_attempts, 5, "approved policy constant")
    assert.equal(job.locked_at, null)
    assert.equal(job.locked_by, null)
    assert.ok(job.available_at <= Date.now())
  })

  it("a second enqueue while one is already open returns the SAME job — idempotent (#2)", async () => {
    const item = await freshItem(alice)
    const first = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)
    const second = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)
    assert.equal(second.id, first.id)

    const pool = getTestPool()
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM knowledge_jobs WHERE item_id = $1", [item.id])
    assert.equal(rows[0].n, 1, "exactly one job row exists for this item")
  })

  it("the unique open-job index is the database's own final guard — a raw duplicate INSERT is rejected (#3)", async () => {
    const item = await freshItem(alice)
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)
    assert.equal(job.status, "queued")

    const pool = getTestPool()
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO knowledge_jobs (id, item_id, org_id, created_by, job_type, status, attempts, max_attempts, available_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'ingest', 'queued', 0, 5, $5, $5, $5)`,
          [`knj_${randomUUID()}`, item.id, alice.orgId, alice.userId, Date.now()],
        ),
      /unique|duplicate/i,
      "uq_knowledge_jobs_item_open must reject a second open job for the same item, independent of any application logic",
    )
  })
})

/* ------------------------------------------------------------------ *
 * 4-7 — atomic claim, concurrency, lease expiry
 * ------------------------------------------------------------------ */

describe("claimJobs / claimJobById — atomic claim under concurrency", () => {
  it("two concurrent batched claimers receive disjoint jobs, never the same one twice (#4)", async () => {
    const items = await Promise.all([freshItem(alice), freshItem(alice), freshItem(alice), freshItem(alice)])
    await Promise.all(items.map((i) => repo.enqueueIngestJob(i.id, alice.orgId, alice.userId)))

    const [batchA, batchB] = await Promise.all([
      repo.claimJobs(2, "worker-A"),
      repo.claimJobs(2, "worker-B"),
    ])

    const idsA = batchA.map((j) => j.id)
    const idsB = batchB.map((j) => j.id)
    const overlap = idsA.filter((id) => idsB.includes(id))
    assert.deepEqual(overlap, [], "no job id appears in both concurrent claims")
    assert.equal(idsA.length + idsB.length, 4, "together they claimed exactly the 4 available jobs, none lost")
  })

  it("the same job cannot be simultaneously claimed by two concurrent targeted claimers (#5)", async () => {
    const item = await freshItem(alice)
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)

    const [claimA, claimB] = await Promise.all([
      repo.claimJobById(job.id, "worker-A"),
      repo.claimJobById(job.id, "worker-B"),
    ])

    const winners = [claimA, claimB].filter((c) => c !== null)
    assert.equal(winners.length, 1, "exactly one of the two concurrent claims won")
  })

  it("an expired lease becomes claimable again (#6)", async () => {
    const item = await freshItem(alice)
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)

    const t0 = Date.now()
    const firstClaim = await repo.claimJobById(job.id, "worker-A", t0)
    assert.ok(firstClaim, "first claim succeeds")

    // Still well within the lease — must NOT be reclaimable yet.
    const tooSoon = await repo.claimJobById(job.id, "worker-B", t0 + 1_000)
    assert.equal(tooSoon, null)

    // Past LEASE_MS — the stale lease is now claimable again, no
    // separate reaper process involved, just the claim query itself.
    const afterLease = await repo.claimJobById(job.id, "worker-B", t0 + repo.LEASE_MS + 1)
    assert.ok(afterLease, "a job whose lease expired is reclaimable")
    assert.equal(afterLease.locked_by, "worker-B")
  })

  it("an active, non-expired lease cannot be claimed by anyone else (#7)", async () => {
    const item = await freshItem(alice)
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)

    const t0 = Date.now()
    await repo.claimJobById(job.id, "worker-A", t0)
    const stolen = await repo.claimJobById(job.id, "worker-B", t0 + 500)
    assert.equal(stolen, null, "an active lease refuses a second claimant")

    // A batched claim must not pick it up either.
    const batch = await repo.claimJobs(10, "worker-C", t0 + 500)
    assert.ok(!batch.some((j) => j.id === job.id))
  })
})

/* ------------------------------------------------------------------ *
 * 8, 16, 17 — success path, and after() sharing the same primitive
 * ------------------------------------------------------------------ */

describe("claimAndRunJob — success", () => {
  it("a successful run marks the job done, and the item ends up ready with real extracted content (#8, #17)", async () => {
    const item = await repo.insertSavedItem({
      orgId: alice.orgId,
      userId: alice.userId,
      url: FAKE_PUBLIC_URL,
      normalizedUrl: null,
      domain: "example.test",
    })
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)

    const summary = await claimAndRunJob({ jobId: job.id, fetchDeps: { transport: fakeHtmlTransport(REAL_ARTICLE_HTML) } })
    assert.deepEqual(summary, { claimed: 1, succeeded: 1, retried: 0, failed: 0, stale: 0 })

    const doneJob = await repo.getJob(job.id)
    assert.equal(doneJob?.status, "done")
    assert.equal(doneJob?.locked_at, null)
    assert.equal(doneJob?.locked_by, null)

    const readyItem = await repo.getItem(item.id, alice.orgId, alice.userId)
    assert.equal(readyItem?.status, "ready")
    assert.equal(readyItem?.title, "A Real Test Article")
    assert.ok(readyItem?.content_text?.includes("genuinely extracted content"))
    assert.ok((readyItem?.word_count ?? 0) > 0)
  })

  it("after()'s targeted fast path and a batched claim are the SAME primitive — a batch claim right after a targeted claim never re-claims the same job (#16)", async () => {
    const item = await freshItem(alice)
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)

    const targeted = await repo.claimJobById(job.id, "after-fastpath")
    assert.ok(targeted)

    // If claimJobById and claimJobs used two different claim
    // mechanisms, a batched claim right after could double-claim the
    // same still-queued-looking row. They don't: it's the identical
    // SQL underneath (claimJobsInternal), so the lease already held
    // by the targeted claim is respected here too.
    const batch = await repo.claimJobs(10, "tick-worker")
    assert.ok(!batch.some((j) => j.id === job.id), "the batched claim must not re-claim a job the fast path already holds")
  })
})

/* ------------------------------------------------------------------ *
 * 9-12 — failure, retry, backoff, terminal failure
 * ------------------------------------------------------------------ */

describe("claimAndRunJob — failure / retry / backoff", () => {
  it("a failed run increments the job's attempts and persists last_error, returning it to queued (#9)", async () => {
    const item = await repo.insertSavedItem({
      orgId: alice.orgId,
      userId: alice.userId,
      url: FAKE_PUBLIC_URL,
      normalizedUrl: null,
      domain: "example.test",
    })
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)

    const summary = await claimAndRunJob({ jobId: job.id, fetchDeps: { transport: failingTransport() } })
    assert.deepEqual(summary, { claimed: 1, succeeded: 0, retried: 1, failed: 0, stale: 0 })

    const retried = await repo.getJob(job.id)
    assert.equal(retried?.status, "queued", "back to queued — not yet terminal")
    assert.equal(retried?.attempts, 1)
    assert.ok(retried?.last_error)
    assert.equal(retried?.locked_at, null, "lease released immediately, not left to expire")
    assert.ok((retried?.available_at ?? 0) > Date.now(), "backoff pushed available_at into the future")

    // The item itself must NOT be marked failed on a mid-retry hiccup
    // — only a terminal failure does that (see the next describe block).
    const stillInFlight = await repo.getItem(item.id, alice.orgId, alice.userId)
    assert.notEqual(stillInFlight?.status, "failed")
  })

  it("backoff progresses roughly 30s -> 60s -> 120s -> 240s, each within the approved ±20% jitter (#10)", () => {
    const expected = [
      RETRY_BASE_DELAY_MS, // attempt 1: 30s
      RETRY_BASE_DELAY_MS * 2, // attempt 2: 60s
      RETRY_BASE_DELAY_MS * 4, // attempt 3: 120s
      RETRY_BASE_DELAY_MS * 8, // attempt 4: 240s
    ]
    for (let attempt = 1; attempt <= 4; attempt++) {
      const raw = expected[attempt - 1]
      // Sample several times — computeBackoffMs uses Math.random() —
      // and check every sample stays within the documented jitter band.
      for (let i = 0; i < 20; i++) {
        const ms = computeBackoffMs(attempt)
        assert.ok(ms >= raw * (1 - RETRY_JITTER) - 1 && ms <= raw * (1 + RETRY_JITTER) + 1, `attempt ${attempt}: ${ms}ms out of band around ${raw}ms`)
      }
    }
  })

  it("backoff is capped at 15 minutes even for a very high attempt count", () => {
    for (let i = 0; i < 20; i++) {
      const ms = computeBackoffMs(20)
      assert.ok(ms <= RETRY_MAX_DELAY_MS * (1 + RETRY_JITTER) + 1)
    }
  })

  it("reaches terminal failure at attempt 5 — the approved max_attempts (#11)", async () => {
    const item = await repo.insertSavedItem({
      orgId: alice.orgId,
      userId: alice.userId,
      url: FAKE_PUBLIC_URL,
      normalizedUrl: null,
      domain: "example.test",
    })
    let job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)

    for (let n = 1; n <= 4; n++) {
      const summary = await claimAndRunJob({ jobId: job.id, fetchDeps: { transport: failingTransport() } })
      assert.deepEqual(summary, { claimed: 1, succeeded: 0, retried: 1, failed: 0, stale: 0 }, `attempt ${n} should retry, not terminate`)
      job = (await repo.getJob(job.id))!
      assert.equal(job.attempts, n)
      assert.equal(job.status, "queued")
      // Force it claimable immediately for the test's next iteration —
      // real code waits for the real backoff; the test doesn't need to.
      await getTestPool().query("UPDATE knowledge_jobs SET available_at = $1 WHERE id = $2", [Date.now(), job.id])
    }

    // 5th failure — attempts reaches max_attempts (5).
    const finalSummary = await claimAndRunJob({ jobId: job.id, fetchDeps: { transport: failingTransport() } })
    assert.deepEqual(finalSummary, { claimed: 1, succeeded: 0, retried: 0, failed: 1, stale: 0 })

    const terminal = await repo.getJob(job.id)
    assert.equal(terminal?.status, "failed")
    assert.equal(terminal?.attempts, 5)
    assert.equal(terminal?.locked_at, null)
  })

  it("terminal failure updates the knowledge item to failed with the real error (#12)", async () => {
    const item = await repo.insertSavedItem({
      orgId: alice.orgId,
      userId: alice.userId,
      url: FAKE_PUBLIC_URL,
      normalizedUrl: null,
      domain: "example.test",
    })
    let job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)
    for (let n = 0; n < repo.DEFAULT_MAX_ATTEMPTS; n++) {
      await claimAndRunJob({ jobId: job.id, fetchDeps: { transport: failingTransport("a distinctive real failure reason") } })
      job = (await repo.getJob(job.id))!
      if (job.status !== "failed") {
        await getTestPool().query("UPDATE knowledge_jobs SET available_at = $1 WHERE id = $2", [Date.now(), job.id])
      }
    }
    assert.equal(job.status, "failed")

    const failedItem = await repo.getItem(item.id, alice.orgId, alice.userId)
    assert.equal(failedItem?.status, "failed")
    assert.ok(failedItem?.error, "a real error message is persisted on the item, not just the job")
  })
})

/* ------------------------------------------------------------------ *
 * 13-14 — retry flow creates durable jobs, no duplicates
 * ------------------------------------------------------------------ */

describe("retry flow — durable job, no duplicates (#13, #14)", () => {
  it("retrying a failed item enqueues a real durable job", async () => {
    const item = await freshItem(alice)
    await repo.setStatus(item.id, alice.orgId, alice.userId, "failed", "some earlier failure")

    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)
    assert.equal(job.status, "queued")
    assert.equal(job.item_id, item.id)
  })

  it("a double retry (two rapid enqueue calls) does not create duplicate open jobs", async () => {
    const item = await freshItem(alice)
    await repo.setStatus(item.id, alice.orgId, alice.userId, "failed", "some earlier failure")

    const [jobA, jobB] = await Promise.all([
      repo.enqueueIngestJob(item.id, alice.orgId, alice.userId),
      repo.enqueueIngestJob(item.id, alice.orgId, alice.userId),
    ])
    assert.equal(jobA.id, jobB.id, "both retry requests resolve to the same one open job")

    const pool = getTestPool()
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM knowledge_jobs WHERE item_id = $1 AND status = 'queued'", [item.id])
    assert.equal(rows[0].n, 1)
  })
})

/* ------------------------------------------------------------------ *
 * 15 — save creates item + durable job, atomically available
 * ------------------------------------------------------------------ */

describe("saveUrl — item + durable job together (#15)", () => {
  it("a genuinely new save returns a real jobId, and the job already exists in Postgres", async () => {
    const result = await saveUrl({ orgId: alice.orgId, userId: alice.userId, url: FAKE_PUBLIC_URL + `?x=${randomUUID()}` })
    assert.equal(result.duplicate, false)
    assert.ok(result.jobId, "a real job id is returned")

    const job = await repo.getJob(result.jobId!)
    assert.equal(job?.status, "queued")
    assert.equal(job?.item_id, result.row.id)
  })

  it("a duplicate save returns jobId: null and enqueues nothing new — unchanged pre-existing behavior", async () => {
    const url = FAKE_PUBLIC_URL + `?x=${randomUUID()}`
    const first = await saveUrl({ orgId: alice.orgId, userId: alice.userId, url })
    const second = await saveUrl({ orgId: alice.orgId, userId: alice.userId, url })

    assert.equal(second.duplicate, true)
    assert.equal(second.jobId, null)
    assert.equal(second.row.id, first.row.id)
  })
})

/* ------------------------------------------------------------------ *
 * 18 — ownership isolation
 * ------------------------------------------------------------------ */

describe("ownership isolation (#18)", () => {
  it("a claimed job's org_id/created_by are exactly what was persisted at enqueue time — never mixed across tenants", async () => {
    const aliceItem = await freshItem(alice)
    const bobItem = await freshItem(bob)
    await repo.enqueueIngestJob(aliceItem.id, alice.orgId, alice.userId)
    await repo.enqueueIngestJob(bobItem.id, bob.orgId, bob.userId)

    const batch = await repo.claimJobs(10, "isolation-worker")
    const aliceJob = batch.find((j) => j.item_id === aliceItem.id)
    const bobJob = batch.find((j) => j.item_id === bobItem.id)

    assert.equal(aliceJob?.org_id, alice.orgId)
    assert.equal(aliceJob?.created_by, alice.userId)
    assert.equal(bobJob?.org_id, bob.orgId)
    assert.equal(bobJob?.created_by, bob.userId)
    assert.notEqual(aliceJob?.org_id, bobJob?.org_id)
  })

  it("runIngestJob's own owner-scoped getItem() means a job can never touch another tenant's row even if org_id were somehow wrong", async () => {
    // Defense in depth, characterizing existing repo.getItem() behavior
    // (unchanged by this commit): a job whose (org_id, created_by) does
    // not match the item's real owner simply finds nothing and returns,
    // exactly like the old processItem's ownership-gone-stale case.
    const item = await freshItem(alice)
    await assert.doesNotReject(() => runIngestJob(item.id, bob.orgId, bob.userId))
    const untouched = await repo.getItem(item.id, alice.orgId, alice.userId)
    assert.equal(untouched?.status, "saved", "bob's mismatched ownership call touched nothing")
  })
})

/* ------------------------------------------------------------------ *
 * 19 — deleted item behavior
 * ------------------------------------------------------------------ */

describe("deleted item behavior (#19)", () => {
  it("deleting a knowledge item cascades to remove its jobs — no orphaned job rows", async () => {
    const item = await freshItem(alice)
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)
    assert.ok(await repo.getJob(job.id))

    const deleted = await repo.deleteItem(item.id, alice.orgId, alice.userId)
    assert.equal(deleted, true)

    assert.equal(await repo.getJob(job.id), null, "ON DELETE CASCADE removed the job row with its item")
  })

  it("runIngestJob on a since-deleted item's id returns cleanly (no throw) — matches the old processItem's contract", async () => {
    const item = await freshItem(alice)
    await repo.deleteItem(item.id, alice.orgId, alice.userId)
    await assert.doesNotReject(() => runIngestJob(item.id, alice.orgId, alice.userId))
  })
})

/* ------------------------------------------------------------------ *
 * 20 — concurrent enqueue race
 * ------------------------------------------------------------------ */

describe("concurrent enqueue race (#20)", () => {
  it("many simultaneous enqueue calls for the same item still produce exactly one open job", async () => {
    const item = await freshItem(alice)
    const jobs = await Promise.all(Array.from({ length: 10 }, () => repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)))

    const uniqueIds = new Set(jobs.map((j) => j.id))
    assert.equal(uniqueIds.size, 1, "all 10 concurrent enqueue calls resolved to the same one job")

    const pool = getTestPool()
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM knowledge_jobs WHERE item_id = $1", [item.id])
    assert.equal(rows[0].n, 1, "exactly one job row was ever created, not 10")
  })
})
