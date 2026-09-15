/* ================================================================== *
 * BACKFILL — the survey, and the promise that running it twice is
 * harmless.
 *
 * Two things are being tested, and only one of them is the query.
 * The other is idempotency, which is the whole reason this is a
 * survey-plus-enqueue rather than a migration: a library is embedded
 * slowly, at cost, and the run WILL be interrupted. A backfill that
 * cannot be safely re-run is a backfill nobody dares start.
 *
 * Real Postgres, because every claim here is a SQL predicate — which
 * items have no chunks, which chunks have no vector from the current
 * model, and whether the partial unique index really prevents a
 * second queued job. A mocked repository would assert none of it.
 * ================================================================== */

import { after, before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "@/lib/ai/embeddings"
import { embedItemChunks, indexItem } from "@/lib/knowledge/indexing"
import { countBacklog, enqueueBackfill, findBackfillCandidates } from "@/lib/knowledge/backfill"
import * as repo from "@/lib/knowledge/repo"

const MODEL = "backfill-test-model"

function fakeProvider(model = MODEL): EmbeddingProvider {
  const values = () => {
    const v = new Array(EMBEDDING_DIMENSIONS).fill(0)
    v[0] = 1
    return v
  }
  return {
    id: "fake",
    model,
    dimensions: EMBEDDING_DIMENSIONS,
    isConfigured: () => true,
    embedDocument: async () => ({ values: values(), model, provider: "fake" }),
    embedQuery: async () => ({ values: values(), model, provider: "fake" }),
  }
}

const TEXT =
  "Retrieval quality is decided long before the model runs, in how the source text was divided into passages and what was kept."

async function saveItem(
  t: TestTenant,
  opts: { archived?: boolean; status?: string; text?: string | null } = {},
): Promise<string> {
  const id = `kn_${randomUUID()}`
  const now = Date.now()
  await getTestPool().query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, title, site_name, domain, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,'article',0,FALSE,$6,'A piece','Example','example.test',$7,$8,$8)`,
    [
      id,
      t.orgId,
      t.userId,
      `https://example.test/${id}`,
      opts.status ?? "ready",
      opts.archived ?? false,
      opts.text === undefined ? TEXT : opts.text,
      now,
    ],
  )
  return id
}

const scopeOf = (t: TestTenant) => ({ orgId: t.orgId, userId: t.userId })

/**
 * Records that concept analysis has run to completion for this item.
 *
 * Needed by every case below that claims an item's ONLY outstanding
 * work is vectors, or that it has none at all. Those claims are about
 * the chunk/vector half of the survey, and they are only true of an
 * item the analysis half is also finished with — otherwise the item is
 * legitimately a never_analyzed candidate and the case is asserting
 * something it did not set up. Stating the precondition here makes it
 * a precondition rather than an accident of what the fixtures happened
 * to leave out.
 *
 * Uses the real queue, because a completed concepts job is exactly the
 * fact the survey reads — see tests/knowledge/backfill-concepts.test.ts.
 */
async function markAnalyzed(t: TestTenant, itemId: string): Promise<void> {
  const job = await repo.enqueueConceptJob(itemId, t.orgId, t.userId)
  const claimed = await repo.claimJobById(job!.id, "worker-backfill-test")
  await repo.completeJob(claimed!.id, "worker-backfill-test")
}

describe("backfill survey", () => {
  let alice: TestTenant
  let bob: TestTenant

  before(async () => {
    await prepareDatabase()
  })
  beforeEach(async () => {
    // A fresh tenant per test: these assertions are about counts, and
    // sharing a library between them would couple every test to the
    // order the others ran in.
    alice = await createTenant("bf")
    bob = await createTenant("bf-other")
  })
  after(closeTestPool)

  it("an item that was never indexed is a candidate", async () => {
    const id = await saveItem(alice)
    const candidates = await findBackfillCandidates(scopeOf(alice), { model: MODEL })
    assert.deepEqual(
      candidates.map((c) => [c.itemId, c.reason, c.chunks]),
      [[id, "never_indexed", 0]],
    )
  })

  it("a chunked item with no vectors is a candidate for its vectors only", async () => {
    const id = await saveItem(alice)
    await indexItem({ itemId: id, orgId: alice.orgId, userId: alice.userId })
    await markAnalyzed(alice, id)
    const [candidate] = await findBackfillCandidates(scopeOf(alice), { model: MODEL })
    assert.equal(candidate.reason, "missing_vectors")
    assert.ok(candidate.chunks > 0)
    assert.equal(candidate.embeddedChunks, 0)
  })

  it("a fully indexed and embedded item is NOT a candidate", async () => {
    const id = await saveItem(alice)
    await indexItem({ itemId: id, orgId: alice.orgId, userId: alice.userId })
    await embedItemChunks(
      { itemId: id, orgId: alice.orgId, userId: alice.userId },
      { embeddings: fakeProvider() },
    )
    await markAnalyzed(alice, id)
    assert.deepEqual(await findBackfillCandidates(scopeOf(alice), { model: MODEL }), [])
  })

  it("changing the embedding model makes every item a candidate again", async () => {
    // A model change and a missing vector need the same work, so they
    // are deliberately indistinguishable here. This is what makes a
    // re-index driven by a query possible instead of a full rebuild.
    const id = await saveItem(alice)
    await indexItem({ itemId: id, orgId: alice.orgId, userId: alice.userId })
    await embedItemChunks({ itemId: id, orgId: alice.orgId, userId: alice.userId }, { embeddings: fakeProvider() })
    await markAnalyzed(alice, id)

    assert.deepEqual(await findBackfillCandidates(scopeOf(alice), { model: MODEL }), [])
    const afterSwitch = await findBackfillCandidates(scopeOf(alice), { model: "a-different-model" })
    assert.equal(afterSwitch.length, 1)
    assert.equal(afterSwitch[0].reason, "missing_vectors")
  })

  it("chunks built from older text are reported as stale", async () => {
    const id = await saveItem(alice)
    await indexItem({ itemId: id, orgId: alice.orgId, userId: alice.userId })
    await embedItemChunks({ itemId: id, orgId: alice.orgId, userId: alice.userId }, { embeddings: fakeProvider() })

    // Move the item's text on without re-indexing — exactly what a
    // re-extraction does before its index job runs.
    await getTestPool().query(
      `UPDATE knowledge_items SET content_text = $2, content_hash = $3 WHERE id = $1`,
      [id, `${TEXT} A later revision added this sentence.`, "f".repeat(64)],
    )

    const [candidate] = await findBackfillCandidates(scopeOf(alice), { model: MODEL })
    assert.equal(candidate.reason, "stale_chunks")
  })

  it("skips items with nothing to index", async () => {
    await saveItem(alice, { status: "fetching" })
    await saveItem(alice, { archived: true })
    await saveItem(alice, { text: null })
    await saveItem(alice, { text: "   " })
    assert.deepEqual(await findBackfillCandidates(scopeOf(alice), { model: MODEL }), [])
  })

  it("never crosses a tenant boundary", async () => {
    await saveItem(bob)
    assert.deepEqual(await findBackfillCandidates(scopeOf(alice), { model: MODEL }), [])
    assert.equal((await findBackfillCandidates(scopeOf(bob), { model: MODEL })).length, 1)
  })

  it("counts the backlog by reason", async () => {
    await saveItem(alice)
    const chunked = await saveItem(alice)
    await indexItem({ itemId: chunked, orgId: alice.orgId, userId: alice.userId })
    await markAnalyzed(alice, chunked)
    const unanalyzed = await saveItem(alice)
    await indexItem({ itemId: unanalyzed, orgId: alice.orgId, userId: alice.userId })
    await embedItemChunks({ itemId: unanalyzed, orgId: alice.orgId, userId: alice.userId }, { embeddings: fakeProvider() })

    const backlog = await countBacklog(scopeOf(alice), { model: MODEL })
    assert.equal(backlog.total, 3)
    assert.equal(backlog.neverIndexed, 1)
    assert.equal(backlog.missingVectors, 1)
    assert.equal(backlog.neverAnalyzed, 1)
    assert.equal(backlog.staleChunks, 0)
  })

  it("respects a limit", async () => {
    for (let i = 0; i < 5; i++) await saveItem(alice)
    assert.equal((await findBackfillCandidates(scopeOf(alice), { model: MODEL, limit: 2 })).length, 2)
  })
})

describe("backfill enqueue", () => {
  let alice: TestTenant

  before(async () => {
    await prepareDatabase()
  })
  beforeEach(async () => {
    alice = await createTenant("bfq")
  })
  after(closeTestPool)

  const queuedJobs = async (itemId: string) =>
    (await getTestPool().query(`SELECT id, job_type, status FROM knowledge_jobs WHERE item_id = $1`, [itemId])).rows

  it("queues one index job per candidate, on the existing queue", async () => {
    const id = await saveItem(alice)
    const result = await enqueueBackfill(scopeOf(alice), { model: MODEL })
    assert.equal(result.candidates, 1)
    assert.equal(result.enqueued, 1)

    const jobs = await queuedJobs(id)
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].job_type, "index", "no second queue, and no new job type")
    assert.equal(jobs[0].status, "queued")
  })

  it("running it twice adds nothing — the second pass is a no-op", async () => {
    // The property that makes a backfill startable. Enforced by the
    // partial unique index, not by checking first, so two operators
    // running it at once is equally safe.
    const id = await saveItem(alice)
    const first = await enqueueBackfill(scopeOf(alice), { model: MODEL })
    const second = await enqueueBackfill(scopeOf(alice), { model: MODEL })

    assert.equal(first.enqueued, 1)
    assert.equal(second.enqueued, 0)
    assert.equal(second.alreadyQueued, 1)
    assert.equal((await queuedJobs(id)).length, 1)
  })

  it("is safe under concurrent callers", async () => {
    const id = await saveItem(alice)
    const runs = await Promise.all([
      enqueueBackfill(scopeOf(alice), { model: MODEL }),
      enqueueBackfill(scopeOf(alice), { model: MODEL }),
      enqueueBackfill(scopeOf(alice), { model: MODEL }),
    ])
    assert.equal((await queuedJobs(id)).length, 1, "the database, not the caller, enforces this")
    assert.equal(runs.reduce((n, r) => n + r.enqueued, 0), 1)
  })

  it("queues nothing when there is nothing to do", async () => {
    const id = await saveItem(alice)
    await indexItem({ itemId: id, orgId: alice.orgId, userId: alice.userId })
    await embedItemChunks({ itemId: id, orgId: alice.orgId, userId: alice.userId }, { embeddings: fakeProvider() })
    await markAnalyzed(alice, id)

    const result = await enqueueBackfill(scopeOf(alice), { model: MODEL })
    assert.equal(result.candidates, 0)
    assert.equal(result.enqueued, 0)
    // Only OPEN work counts: markAnalyzed above leaves a completed
    // concepts job behind, and a finished job is the evidence that
    // there is nothing to do — not a contradiction of it.
    assert.deepEqual(
      (await queuedJobs(id)).filter((j) => (j as { status: string }).status === "queued"),
      [],
      "nothing was queued",
    )
  })

  it("copies ownership from the item row, not from the caller", async () => {
    const id = await saveItem(alice)
    await enqueueBackfill(scopeOf(alice), { model: MODEL })
    const rows = (
      await getTestPool().query(`SELECT org_id, created_by FROM knowledge_jobs WHERE item_id = $1`, [id])
    ).rows
    assert.equal(rows[0].org_id, alice.orgId)
    assert.equal(rows[0].created_by, alice.userId)
  })
})
