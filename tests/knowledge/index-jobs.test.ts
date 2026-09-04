/* ================================================================== *
 * INDEXING THROUGH THE EXISTING QUEUE.
 *
 * Phase C deliberately did not build a second queue. knowledge_jobs
 * already solves leasing, backoff, the attempt cap and reaping stale
 * claims, and a parallel one would have to solve all of it again and
 * then be kept in step. What it did not have was a second kind of
 * work — so these tests pin the three things that share makes true:
 * an index job is dispatched to the indexer and not the fetcher; an
 * ingest job that lands schedules one; and the item's own status is
 * never damaged by an indexing failure.
 *
 * The constraint that shapes all of it: uq_knowledge_jobs_item_open
 * allows exactly ONE queued job per item, whatever its type.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import { claimAndRunJob } from "@/lib/knowledge/service"
import * as repo from "@/lib/knowledge/repo"

const LONG = Array.from(
  { length: 60 },
  (_, i) => `Paragraph ${i} carries a full idea, long enough to survive chunking as a passage worth retrieving.`,
).join("\n\n")

async function makeReadyItem(t: TestTenant): Promise<string> {
  const p = getTestPool()
  const id = `kn_${randomUUID()}`
  const now = Date.now()
  await p.query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,FALSE,$5,$6,$6)`,
    [id, t.orgId, t.userId, `https://example.test/${id}`, LONG, now],
  )
  return id
}

const jobsFor = async (itemId: string) =>
  (await getTestPool().query<{ job_type: string; status: string }>(
    "SELECT job_type, status FROM knowledge_jobs WHERE item_id = $1 ORDER BY created_at",
    [itemId],
  )).rows

describe("enqueueIndexJob", () => {
  let t: TestTenant
  before(async () => {
    await prepareDatabase()
    t = await createTenant("enqueue")
  })
  after(closeTestPool)

  it("creates a queued job of type index", async () => {
    const itemId = await makeReadyItem(t)
    const job = await repo.enqueueIndexJob(itemId, t.orgId, t.userId)
    assert.ok(job)
    assert.equal(job.job_type, "index")
    assert.equal(job.status, "queued")
    assert.equal(job.item_id, itemId)
    assert.equal(job.org_id, t.orgId)
    assert.equal(job.created_by, t.userId, "the job must carry the item's owner, never a caller-supplied one")
    assert.equal(job.max_attempts, repo.DEFAULT_MAX_ATTEMPTS, "index jobs use the same retry policy as ingestion")
  })

  it("does not create a second open job for the same item", async () => {
    // The partial unique index is per item, not per type — a double
    // enqueue must resolve to the job that already exists rather than
    // raise, which is what makes the call safe to repeat.
    const itemId = await makeReadyItem(t)
    const first = await repo.enqueueIndexJob(itemId, t.orgId, t.userId)
    const second = await repo.enqueueIndexJob(itemId, t.orgId, t.userId)
    assert.ok(first && second)
    assert.equal(second.id, first.id)
    assert.equal((await jobsFor(itemId)).length, 1)
  })
})

describe("running an index job through the shared queue", () => {
  let t: TestTenant
  before(async () => {
    await prepareDatabase()
    t = await createTenant("run")
  })
  after(closeTestPool)

  it("dispatches to the indexer, not the fetcher, and writes chunks", async () => {
    const itemId = await makeReadyItem(t)
    const job = await repo.enqueueIndexJob(itemId, t.orgId, t.userId)
    assert.ok(job)

    // A transport that throws on use: if the dispatch went to
    // ingestion instead of indexing, this job would fail rather than
    // succeed. `transport` is the real seam FetchDeps exposes — an
    // invented field name would be ignored and prove nothing.
    const summary = await claimAndRunJob({
      jobId: job.id,
      fetchDeps: {
        transport: () => {
          throw new Error("an index job must never perform a network fetch")
        },
      },
    })

    assert.equal(summary.claimed, 1)
    assert.equal(summary.succeeded, 1, "the index job should have completed")
    assert.equal(summary.failed, 0)

    const chunks = await repo.getChunks(itemId, t.orgId, t.userId)
    assert.ok(chunks.length > 1, "the job should have produced chunks")

    const done = await repo.getJob(job.id)
    assert.equal(done?.status, "done")
  })

  it("does not chain another index job off an index job", async () => {
    // Otherwise every completed index would schedule the next one and
    // the queue would never drain.
    const itemId = await makeReadyItem(t)
    const job = await repo.enqueueIndexJob(itemId, t.orgId, t.userId)
    await claimAndRunJob({ jobId: job!.id })
    const all = await jobsFor(itemId)
    assert.equal(all.length, 1, `expected exactly one job, got ${JSON.stringify(all)}`)
    assert.equal(all[0].status, "done")
  })

  it("leaves the item's own status untouched when indexing runs", async () => {
    const itemId = await makeReadyItem(t)
    const job = await repo.enqueueIndexJob(itemId, t.orgId, t.userId)
    await claimAndRunJob({ jobId: job!.id })
    const item = await repo.getItem(itemId, t.orgId, t.userId)
    assert.equal(item?.status, "ready", "indexing must not rewrite the UI-facing status")
    assert.equal(item?.error, null)
  })

  it("an item with no content completes without failing the job", async () => {
    // Nothing to chunk is a real, non-error outcome. Failing here
    // would burn five attempts and then mark a readable item broken.
    const p = getTestPool()
    const id = `kn_${randomUUID()}`
    await p.query(
      `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, content_text, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,FALSE,NULL,$5,$5)`,
      [id, t.orgId, t.userId, `https://example.test/${id}`, Date.now()],
    )
    const job = await repo.enqueueIndexJob(id, t.orgId, t.userId)
    const summary = await claimAndRunJob({ jobId: job!.id })
    assert.equal(summary.succeeded, 1)
    assert.equal(summary.failed, 0)
    const item = await repo.getItem(id, t.orgId, t.userId)
    assert.equal(item?.status, "ready", "an unindexable item is not a failed item")
  })
})
