/* ================================================================== *
 * DURABLE INGESTION — corrective fixes for the two concerns raised by
 * the Commit 12A read-only correctness audit. Against a REAL
 * PostgreSQL, same reasoning as tests/knowledge/jobs.test.ts: what
 * these tests characterize is real transaction rollback and real
 * conditional-UPDATE behavior, neither of which a mocked repo would
 * assert anything real about.
 *
 * Fix 1 — save/retry orphan windows:
 *   - saveUrl's item+job insert is now ONE transaction
 *     (repo.insertSavedItemWithJob) instead of two independent round
 *     trips, so a failure between them can no longer leave a
 *     permanently stuck item with no job.
 *   - the retry route now enqueues the durable job BEFORE resetting
 *     the item's status, so an enqueue failure can no longer destroy
 *     an item's `failed` state (and with it, its only retry
 *     affordance) without ever getting a replacement job.
 *
 * Fix 2 — lease fencing:
 *   - completeJob/failJob now require the caller's workerId to match
 *     the job's current locked_by, so a "zombie" worker whose lease
 *     already expired and was reclaimed by someone else can no longer
 *     silently overwrite that someone else's outcome.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import type { Transport } from "@/lib/security/safe-fetch"
import { withTransaction } from "@/lib/db/client"
import * as repo from "@/lib/knowledge/repo"
import { claimAndRunJob, saveUrl } from "@/lib/knowledge/service"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"

let alice: TestTenant

before(async () => {
  await prepareDatabase()
  alice = await createTenant("alice")
})
after(async () => {
  await closeTestPool()
})

async function freshItem(tenant: TestTenant) {
  return repo.insertSavedItem({
    orgId: tenant.orgId,
    userId: tenant.userId,
    url: `https://example.test/${randomUUID()}`,
    normalizedUrl: null,
    domain: "example.test",
  })
}

// A literal public IP — assertSafeUrl checks it with pure CIDR math,
// no DNS, no network (see lib/security/ssrf-guard.ts). Only the
// injected transport below is ever "called".
const FAKE_PUBLIC_URL = "http://93.184.216.34/article"

function fakeHtmlTransport(html: string): Transport {
  return async () => ({
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: Buffer.from(html, "utf8"),
  })
}

// extractBody() requires >= 200 real characters — see jobs.test.ts's
// own identical fixture and comment for why.
const REAL_ARTICLE_HTML = `<html><head><title>A Real Test Article</title></head>
<body><article><h1>A Real Test Article</h1>
<p>This is the first real paragraph of genuinely extracted content, written long enough to clear the extractor's real two-hundred character minimum threshold for what counts as a genuine article body rather than a stub or navigation fragment.</p>
<p>This is a second real paragraph, with more genuine text to extract, also written with enough real substance that the whole sample comfortably exceeds the same quality bar the extractor applies to every real page it processes.</p>
</article></body></html>`

/* ------------------------------------------------------------------ *
 * Fix 1a — save transaction
 * ------------------------------------------------------------------ */

describe("insertSavedItemWithJob — atomicity", () => {
  it("commits the item and its job together", async () => {
    const result = await repo.insertSavedItemWithJob({
      orgId: alice.orgId,
      userId: alice.userId,
      url: `https://example.test/${randomUUID()}`,
      normalizedUrl: null,
      domain: "example.test",
    })

    assert.equal(result.job.item_id, result.row.id)
    assert.equal(result.job.status, "queued")
    assert.equal(result.job.org_id, alice.orgId)
    assert.equal(result.job.created_by, alice.userId)

    // Really persisted — read both back through fresh, independent queries.
    const persistedItem = await repo.getItem(result.row.id, alice.orgId, alice.userId)
    const persistedJob = await repo.getJob(result.job.id)
    assert.ok(persistedItem, "the item is really in the database")
    assert.ok(persistedJob, "the job is really in the database")
  })

  it("if the item insert itself fails (a real unique-constraint race), no job is created either — nothing orphaned", async () => {
    const normalizedUrl = `https://example.test/dup-${randomUUID()}`
    // A real, already-active item occupying this (org, user, normalizedUrl) slot.
    await repo.insertSavedItem({ orgId: alice.orgId, userId: alice.userId, url: normalizedUrl, normalizedUrl, domain: "example.test" })

    await assert.rejects(() =>
      repo.insertSavedItemWithJob({ orgId: alice.orgId, userId: alice.userId, url: normalizedUrl, normalizedUrl, domain: "example.test" }),
    )

    const pool = getTestPool()
    const { rows: itemRows } = await pool.query(
      "SELECT id FROM knowledge_items WHERE org_id = $1 AND created_by = $2 AND normalized_url = $3",
      [alice.orgId, alice.userId, normalizedUrl],
    )
    assert.equal(itemRows.length, 1, "no second item was left behind by the failed transaction")

    const { rows: jobRows } = await pool.query(
      `SELECT j.id FROM knowledge_jobs j JOIN knowledge_items i ON i.id = j.item_id
       WHERE i.org_id = $1 AND i.created_by = $2 AND i.normalized_url = $3`,
      [alice.orgId, alice.userId, normalizedUrl],
    )
    assert.equal(jobRows.length, 0, "no job was left behind either — the whole transaction rolled back")
  })

  it("saveUrl's existing duplicate-recovery behavior still works end-to-end after this fix", async () => {
    // A literal public IP, not a hostname — assertSafeUrl checks it with
    // pure CIDR math (no DNS); "example.test" would trigger a real,
    // failing DNS lookup (it's RFC 2606's deliberately non-resolvable
    // reserved TLD), which is exactly the live-network dependency this
    // suite avoids (see the file header and jobs.test.ts's own FAKE_
    // PUBLIC_URL).
    const url = `${FAKE_PUBLIC_URL}/e2e-${randomUUID()}`
    const first = await saveUrl({ orgId: alice.orgId, userId: alice.userId, url })
    const second = await saveUrl({ orgId: alice.orgId, userId: alice.userId, url })

    assert.equal(first.duplicate, false)
    assert.ok(first.jobId, "the first save gets a real durable job")
    assert.equal(second.duplicate, true)
    assert.equal(second.jobId, null, "unchanged pre-existing behavior — a duplicate never enqueues")
    assert.equal(second.row.id, first.row.id)
  })

  it("withTransaction really rolls back an earlier successful statement when a later one in the same transaction fails — the mechanism this fix depends on", async () => {
    const pool = getTestPool()
    const itemId = `kn_${randomUUID()}`

    await assert.rejects(() =>
      withTransaction(async (client) => {
        await client.query(
          `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'saved', 'article', 0, FALSE, FALSE, $5, $5)`,
          [itemId, alice.orgId, alice.userId, `https://example.test/${randomUUID()}`, Date.now()],
        )
        // Deliberately invalid — an org_id that doesn't exist violates
        // the real FK on knowledge_jobs.org_id, forcing this whole
        // transaction to fail after the item insert already "succeeded".
        await client.query(
          `INSERT INTO knowledge_jobs (id, item_id, org_id, created_by, job_type, status, attempts, max_attempts, available_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'ingest', 'queued', 0, 5, $5, $5, $5)`,
          [`knj_${randomUUID()}`, itemId, "org_does_not_exist", alice.userId, Date.now()],
        )
      }),
    )

    const { rows } = await pool.query("SELECT id FROM knowledge_items WHERE id = $1", [itemId])
    assert.equal(rows.length, 0, "the item insert was rolled back along with the failed job insert")
  })
})

/* ------------------------------------------------------------------ *
 * Fix 1b — retry ordering
 * ------------------------------------------------------------------ */

describe("retry ordering — enqueue before reset", () => {
  it("successful enqueue is followed by the status reset — job exists and the item is back to saved", async () => {
    const item = await freshItem(alice)
    await repo.setStatus(item.id, alice.orgId, alice.userId, "failed", "some earlier failure")

    // Mirrors the fixed retry route's order exactly.
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)
    await repo.setStatus(item.id, alice.orgId, alice.userId, "saved", null)

    const reset = await repo.getItem(item.id, alice.orgId, alice.userId)
    assert.equal(reset?.status, "saved")
    assert.equal(reset?.error, null)
    assert.equal(job.status, "queued")
  })

  it("if enqueue fails, the item's failed state and error are never touched — the retry affordance survives", async () => {
    const item = await freshItem(alice)
    await repo.setStatus(item.id, alice.orgId, alice.userId, "failed", "original failure reason")

    // Mirrors the retry route's fixed order: enqueue is attempted
    // BEFORE any reset. A bogus userId forces a real FK violation on
    // knowledge_jobs.created_by — deterministic, no mocking needed.
    await assert.rejects(() => repo.enqueueIngestJob(item.id, alice.orgId, "user_does_not_exist"))

    const stillFailed = await repo.getItem(item.id, alice.orgId, alice.userId)
    assert.equal(stillFailed?.status, "failed", "status was never reset")
    assert.equal(stillFailed?.error, "original failure reason", "the real error is still there for the user to see")
  })
})

/* ------------------------------------------------------------------ *
 * Fix 2 — lease fencing
 * ------------------------------------------------------------------ */

describe("lease fencing — completeJob/failJob", () => {
  it("the current worker can complete its own claimed job", async () => {
    const item = await freshItem(alice)
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)
    const claimed = await repo.claimJobById(job.id, "worker-A")
    assert.ok(claimed)

    const ok = await repo.completeJob(job.id, "worker-A")
    assert.equal(ok, true)
    const done = await repo.getJob(job.id)
    assert.equal(done?.status, "done")
  })

  it("the current worker can fail (retry) its own claimed job", async () => {
    const item = await freshItem(alice)
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)
    await repo.claimJobById(job.id, "worker-A")

    const ok = await repo.failJob(job.id, "worker-A", { attempts: 1, error: "boom", retryAt: Date.now() + 1000 })
    assert.equal(ok, true)
    const retried = await repo.getJob(job.id)
    assert.equal(retried?.status, "queued")
    assert.equal(retried?.attempts, 1)
    assert.equal(retried?.last_error, "boom")
  })

  it("the current worker can terminally fail its own claimed job", async () => {
    const item = await freshItem(alice)
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)
    await repo.claimJobById(job.id, "worker-A")

    const ok = await repo.failJob(job.id, "worker-A", { attempts: 5, error: "terminal", retryAt: null })
    assert.equal(ok, true)
    const failed = await repo.getJob(job.id)
    assert.equal(failed?.status, "failed")
  })

  it("a stale worker cannot complete a job after another worker reclaimed it", async () => {
    const item = await freshItem(alice)
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)
    const t0 = Date.now()
    await repo.claimJobById(job.id, "worker-A", t0)

    // worker A "dies" — its lease expires and worker B reclaims.
    const reclaimedByB = await repo.claimJobById(job.id, "worker-B", t0 + repo.LEASE_MS + 1)
    assert.ok(reclaimedByB)

    // worker A finally wakes up and tries to record success — refused.
    const staleOk = await repo.completeJob(job.id, "worker-A")
    assert.equal(staleOk, false, "the stale worker's completion must be refused")

    const current = await repo.getJob(job.id)
    assert.equal(current?.status, "queued", "still B's to finish — not clobbered into done")
    assert.equal(current?.locked_by, "worker-B")
  })

  it("a stale worker cannot fail a job after another worker reclaimed it", async () => {
    const item = await freshItem(alice)
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)
    const t0 = Date.now()
    await repo.claimJobById(job.id, "worker-A", t0)
    await repo.claimJobById(job.id, "worker-B", t0 + repo.LEASE_MS + 1)

    const staleOk = await repo.failJob(job.id, "worker-A", { attempts: 1, error: "stale failure", retryAt: null })
    assert.equal(staleOk, false)

    const current = await repo.getJob(job.id)
    assert.equal(current?.status, "queued", "not clobbered into 'failed' by the stale worker")
    assert.equal(current?.locked_by, "worker-B")
    assert.equal(current?.attempts, 0, "the stale worker's attempts write never landed either")
  })

  it("claimAndRunJob end-to-end: a normal single run fences successfully against its own claim — no false staleness", async () => {
    const item = await repo.insertSavedItem({
      orgId: alice.orgId,
      userId: alice.userId,
      url: FAKE_PUBLIC_URL,
      normalizedUrl: null,
      domain: "example.test",
    })
    const job = await repo.enqueueIngestJob(item.id, alice.orgId, alice.userId)

    const summary = await claimAndRunJob({ jobId: job.id, fetchDeps: { transport: fakeHtmlTransport(REAL_ARTICLE_HTML) } })
    assert.equal(summary.stale, 0)
    assert.equal(summary.succeeded, 1)

    const done = await repo.getJob(job.id)
    assert.equal(done?.status, "done")
  })
})
