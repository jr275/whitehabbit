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

/** Runs the index job so the item really has passages, and returns the
 *  id of the concepts job indexing chained. Extraction reads chunks —
 *  pointed at an unindexed item it correctly SKIPS, which is a
 *  different outcome from the provider failures below and would make
 *  them pass for the wrong reason. jobsFor projects only type and
 *  status, so the id is read straight from the queue. */
async function chainedConceptsJobId(t: TestTenant, itemId: string): Promise<string> {
  const indexJob = await repo.enqueueIndexJob(itemId, t.orgId, t.userId)
  await claimAndRunJob({ jobId: indexJob!.id })
  const { rows } = await getTestPool().query<{ id: string }>(
    "SELECT id FROM knowledge_jobs WHERE item_id = $1 AND job_type = 'concepts'",
    [itemId],
  )
  assert.equal(rows.length, 1, "indexing must have chained exactly one concepts job")
  return rows[0].id
}

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
    //
    // Indexing DOES now chain one concepts job — the pipeline's last
    // link. The property under test is unchanged and still exactly as
    // strict: no SECOND index job, and the chain terminates. Counting
    // total rows would have quietly turned this into an assertion
    // about pipeline length, which is not what it is for.
    const itemId = await makeReadyItem(t)
    const job = await repo.enqueueIndexJob(itemId, t.orgId, t.userId)
    await claimAndRunJob({ jobId: job!.id })

    const all = await jobsFor(itemId)
    const indexJobs = all.filter((j) => j.job_type === "index")
    assert.equal(indexJobs.length, 1, `expected exactly one index job, got ${JSON.stringify(all)}`)
    assert.equal(indexJobs[0].status, "done")
    assert.equal(all.filter((j) => j.job_type === "concepts").length, 1, "exactly one concepts job is chained")
  })

  it("records a provider-blocked concepts job as FAILED, never done", async () => {
    // The distinction the whole concepts backfill rests on. No model
    // provider is configured in this suite, so extraction cannot run —
    // and a job that completes anyway would claim the item had been
    // looked at, which is how these items became permanently invisible
    // to the backfill's survey in the first place.
    const itemId = await makeReadyItem(t)
    const conceptsJobId = await chainedConceptsJobId(t, itemId)
    await claimAndRunJob({ jobId: conceptsJobId })

    const settled = await repo.getJob(conceptsJobId)
    assert.equal(settled?.status, "failed", "a stage that did not run must not be recorded as done")
    assert.match(settled!.last_error ?? "", /provider/i, "and must carry the real reason")
  })

  it("does not retry a provider-blocked concepts job — an absent credential is not transient", async () => {
    // Retrying would burn max_attempts claims per item across a whole
    // library to re-learn that the same credential is still absent.
    // The backfill is this stage's retry, and it runs when an operator
    // asks rather than on a backoff timer.
    const itemId = await makeReadyItem(t)
    const conceptsJobId = await chainedConceptsJobId(t, itemId)
    await claimAndRunJob({ jobId: conceptsJobId })

    const settled = await repo.getJob(conceptsJobId)
    assert.equal(settled?.status, "failed")
    assert.equal(settled?.attempts, settled?.max_attempts, "it goes terminal on the first attempt, not after five")
  })

  it("a failed concepts job leaves the ITEM readable, not failed", async () => {
    // Same rule indexing already follows: the piece was fetched,
    // extracted and is readable — only its concepts are missing.
    // Marking it failed would tell the user their save broke and offer
    // a Retry that re-fetches a page that was never the problem.
    const itemId = await makeReadyItem(t)
    const conceptsJobId = await chainedConceptsJobId(t, itemId)
    await claimAndRunJob({ jobId: conceptsJobId })

    assert.equal((await repo.getJob(conceptsJobId))?.status, "failed", "precondition: the job really did fail")
    const item = await repo.getItem(itemId, t.orgId, t.userId)
    assert.equal(item?.status, "ready", "a missing concept is not a broken save")
    assert.equal(item?.error, null)
  })

  it("chains exactly one summary job off a concepts job, and the pipeline then terminates", async () => {
    // The chain is ingest → index → concepts → summary. Each stage
    // schedules the NEXT one and nothing else; if any stage scheduled
    // its own type, or two stages scheduled the same one, the queue
    // would never drain. Asserted per stage rather than as a total, so
    // this stays a statement about the chain's shape rather than about
    // how many stages happen to exist.
    const itemId = await makeReadyItem(t)
    const concepts = await repo.enqueueConceptJob(itemId, t.orgId, t.userId)
    await claimAndRunJob({ jobId: concepts!.id })

    const afterConcepts = await jobsFor(itemId)
    assert.equal(afterConcepts.filter((j) => j.job_type === "concepts").length, 1, "no second concepts job")
    assert.equal(afterConcepts.filter((j) => j.job_type === "summary").length, 1, "exactly one summary job is chained")

    const { rows } = await getTestPool().query<{ id: string }>(
      "SELECT id FROM knowledge_jobs WHERE item_id = $1 AND job_type = 'summary'",
      [itemId],
    )
    await claimAndRunJob({ jobId: rows[0].id })

    const afterSummary = await jobsFor(itemId)
    assert.equal(afterSummary.length, 2, `the chain must stop here, got ${JSON.stringify(afterSummary)}`)
  })

  it("records a provider-blocked summary job as FAILED, and leaves the item readable", async () => {
    // Same rule as concepts: no ANTHROPIC_API_KEY in the suite, so the
    // stage genuinely cannot run. Recording it done would hide the item
    // from the backfill forever; marking the ITEM failed would tell the
    // user their save broke when only its summary is missing.
    const itemId = await makeReadyItem(t)
    const concepts = await repo.enqueueConceptJob(itemId, t.orgId, t.userId)
    await claimAndRunJob({ jobId: concepts!.id })
    const { rows } = await getTestPool().query<{ id: string }>(
      "SELECT id FROM knowledge_jobs WHERE item_id = $1 AND job_type = 'summary'",
      [itemId],
    )
    await claimAndRunJob({ jobId: rows[0].id })

    const settled = await repo.getJob(rows[0].id)
    assert.equal(settled?.status, "failed")
    assert.equal(settled?.attempts, settled?.max_attempts, "terminal on the first attempt, not after five")

    const item = await repo.getItem(itemId, t.orgId, t.userId)
    assert.equal(item?.status, "ready")
    assert.equal(item?.summary, null, "and no summary was invented in place of the one that could not be made")
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
