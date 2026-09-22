/* ================================================================== *
 * BACKFILL — never_analyzed.
 *
 * Concepts arrived in migration 0010. Everything saved before it has
 * none, and any item whose extraction broke has none either — and
 * until this existed there was no way back into the pipeline for
 * either group, because the concepts job had already completed.
 *
 * THE DISTINCTION THIS FILE EXISTS TO PIN. "No concepts" is three
 * different situations wearing the same clothes:
 *
 *   1. nobody ever looked          → must be analyzed
 *   2. we looked, and the document → must NOT be analyzed again, or
 *      is genuinely about nothing     every run spends another model
 *      nameable                       call to hear the same answer
 *   3. we looked and it broke      → must be analyzed again
 *
 * A completed concepts job is what separates 2 from 1 and 3. Collapse
 * that and the backfill either misses real gaps or bills for them
 * forever; both mistakes are one predicate wide.
 *
 * Real PostgreSQL. No model is called; no credential is needed.
 * ================================================================== */

import { after, before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import * as repo from "@/lib/knowledge/repo"
import { countBacklog, enqueueBackfill, findBackfillCandidates } from "@/lib/knowledge/backfill"
import { replaceItemConcepts, upsertConcept } from "@/lib/knowledge/concepts/repo"
import { canonicalConceptName, normalizeConceptName } from "@/lib/knowledge/concepts/normalize"

let owner: TestTenant
/** A whole separate organization. */
let stranger: TestTenant
/** A colleague: the SAME organization, a different person — the case
 *  an org_id-only predicate silently allows. */
let colleague: TestTenant

before(async () => {
  await prepareDatabase()
})
beforeEach(async () => {
  // A fresh pair per test: the backlog survey is scope-wide, so rows
  // left by a previous case would silently join the next one's answer.
  owner = await createTenant("bf-owner")
  stranger = await createTenant("bf-stranger")
  const mate = await createTenant("bf-colleague")
  await getTestPool().query("UPDATE memberships SET org_id = $1 WHERE user_id = $2", [owner.orgId, mate.userId])
  colleague = { orgId: owner.orgId, userId: mate.userId }
})
after(closeTestPool)

function scopeOf(t: TestTenant) {
  return { orgId: t.orgId, userId: t.userId }
}

/** The model this deployment would embed with. Passed explicitly so no
 *  test depends on whether an embedding credential happens to exist. */
const MODEL = "test-embedding-model"

let seq = 0

/** A ready item with chunks AND vectors — i.e. one whose ONLY possible
 *  outstanding work is analysis. Everything else is already done, so a
 *  candidate here can only be never_analyzed. */
async function analyzableItem(t: TestTenant) {
  seq += 1
  const id = `kn_${randomUUID()}`
  const now = Date.now()
  const hash = `hash-${seq}`
  const pool = getTestPool()
  await pool.query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived,
                                  title, site_name, domain, content_text, content_hash, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,FALSE,'A piece','Ex','ex.test',$5,$6,$7,$7)`,
    [id, t.orgId, t.userId, `https://ex.test/${id}`, "Body text about retrieval and agents.", hash, now],
  )
  await repo.replaceChunks(id, t.orgId, t.userId, hash, [
    {
      id: `chunk_${id}_0`,
      ordinal: 0,
      text: "Retrieval joins lexical and semantic search.",
      charStart: 0,
      charEnd: 44,
      tokenEstimate: 11,
      contentHash: hash,
    },
  ])
  // A summary, so never_summarized can never be the reason either —
  // these cases are about the ANALYSIS stage, and an item missing two
  // things would be reported by whichever ranks higher rather than by
  // the one under test.
  await repo.setSummary(id, t.orgId, t.userId, "A short summary.")
  // A vector from MODEL, so missing_vectors can never be the reason.
  await pool.query(
    `INSERT INTO knowledge_chunk_embeddings (chunk_id, org_id, created_by, embedding, provider, model, dimensions, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'fake',$5,768,$6,$6)`,
    [`chunk_${id}_0`, t.orgId, t.userId, `[${new Array(768).fill(0).join(",")}]`, MODEL, now],
  )
  return id
}

function extracted(name: string) {
  return {
    name,
    canonicalName: canonicalConceptName(name),
    normalizedName: normalizeConceptName(name),
    type: "TOPIC" as const,
    confidence: 0.9,
    evidence: [{ chunkId: "chunk_1" }],
    source: "llm" as const,
  }
}

/** Records that a concepts job ran to completion for this item —
 *  whatever it concluded. This is the fact the survey reads. */
async function completedConceptJob(itemId: string, t: TestTenant) {
  const job = await repo.enqueueConceptJob(itemId, t.orgId, t.userId)
  const claimed = await repo.claimJobById(job!.id, "worker-test")
  await repo.completeJob(claimed!.id, "worker-test")
}

const candidates = (t: TestTenant) => findBackfillCandidates(scopeOf(t), { model: MODEL })

/* ================================================================== *
 * SELECTION
 * ================================================================== */

describe("never_analyzed — what gets selected", () => {
  it("selects an item that predates concepts: chunked, embedded, never looked at", async () => {
    const id = await analyzableItem(owner)
    const found = await candidates(owner)

    assert.equal(found.length, 1)
    assert.equal(found[0].itemId, id)
    assert.equal(found[0].reason, "never_analyzed")
  })

  it("does NOT select an item that already has concepts", async () => {
    const id = await analyzableItem(owner)
    await replaceItemConcepts(id, [extracted("Retrieval")], scopeOf(owner))

    assert.deepEqual(await candidates(owner), [])
  })

  it("does NOT select an item the model read and found nothing nameable in", async () => {
    // The case that makes this expensive to get wrong. Zero concepts,
    // exactly like case 1 — but a job completed, so we DID look, and
    // re-asking would buy the same empty answer at full price on every
    // run of the backfill, forever.
    const id = await analyzableItem(owner)
    await completedConceptJob(id, owner)

    assert.deepEqual(await candidates(owner), [], "a completed analysis must not be repeated")
  })

  it("DOES select an item whose analysis failed", async () => {
    // A job that exhausted its retries is `failed`, never `done`, so
    // the survey sees no completed analysis and the item comes back
    // round — which is the entire reason failure is now recorded as
    // failure instead of being swallowed.
    const id = await analyzableItem(owner)
    const job = await repo.enqueueConceptJob(id, owner.orgId, owner.userId)
    const claimed = await repo.claimJobById(job!.id, "worker-test")
    await repo.failJob(claimed!.id, "worker-test", {
      attempts: 5,
      error: "no LLM provider configured",
      retryAt: null,
    })

    const found = await candidates(owner)
    assert.equal(found.length, 1)
    assert.equal(found[0].reason, "never_analyzed")
  })

  it("does not select an item with no chunks as never_analyzed — it needs indexing first", async () => {
    // Extraction reads passages. An item with none is a different gap
    // and a different job, and calling it never_analyzed would queue a
    // concepts job that can only skip.
    const id = `kn_${randomUUID()}`
    const now = Date.now()
    await getTestPool().query(
      `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, title, domain, content_text, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,FALSE,'Bare','ex.test','Some body text.',$5,$5)`,
      [id, owner.orgId, owner.userId, `https://ex.test/${id}`, now],
    )

    const found = await candidates(owner)
    assert.equal(found.length, 1)
    assert.equal(found[0].reason, "never_indexed")
  })

  it("prefers analysis over vectors when an item needs both", async () => {
    // A deployment with no embedding credential is a supported state
    // (semantic search fails open — see docs/knowledge-semantic-
    // search.md), and in it EVERY chunked item reports missing
    // vectors, forever. If vectors outranked analysis, that deployment
    // could never analyze anything: the concepts backfill would be
    // unreachable rather than merely slower. Nothing is lost the other
    // way round — the next run picks up the vectors.
    const id = await analyzableItem(owner)
    await getTestPool().query("DELETE FROM knowledge_chunk_embeddings WHERE chunk_id = $1", [`chunk_${id}_0`])

    const found = await candidates(owner)
    assert.equal(found.length, 1)
    assert.equal(found[0].reason, "never_analyzed")
  })

  it("still reports missing_vectors once the item HAS been analyzed", async () => {
    // The other half of the precedence, so it is a rule rather than a
    // one-way preference: analysis first, then vectors — not analysis
    // instead of vectors.
    const id = await analyzableItem(owner)
    await getTestPool().query("DELETE FROM knowledge_chunk_embeddings WHERE chunk_id = $1", [`chunk_${id}_0`])
    await replaceItemConcepts(id, [extracted("Retrieval")], scopeOf(owner))

    const found = await candidates(owner)
    assert.equal(found.length, 1)
    assert.equal(found[0].reason, "missing_vectors")
  })

  it("counts never_analyzed as its own line in the backlog", async () => {
    await analyzableItem(owner)
    const counts = await countBacklog(scopeOf(owner), { model: MODEL })
    assert.equal(counts.neverAnalyzed, 1)
    assert.equal(counts.missingVectors, 0)
    assert.equal(counts.total, 1)
  })
})

/* ================================================================== *
 * WHAT GETS QUEUED
 * ================================================================== */

async function jobsFor(itemId: string) {
  const rows = await getTestPool().query<{ job_type: string; status: string }>(
    "SELECT job_type, status FROM knowledge_jobs WHERE item_id = $1 ORDER BY created_at",
    [itemId],
  )
  return rows.rows
}

describe("never_analyzed — what gets queued", () => {
  it("queues a concepts job, not an index job", async () => {
    const id = await analyzableItem(owner)
    const result = await enqueueBackfill(scopeOf(owner), { model: MODEL })

    assert.equal(result.enqueued, 1)
    const jobs = await jobsFor(id)
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].job_type, "concepts", "an item that only needs understanding must not be re-indexed")
    assert.equal(jobs[0].status, "queued")
  })

  it("running it twice enqueues nothing the second time", async () => {
    const id = await analyzableItem(owner)
    const first = await enqueueBackfill(scopeOf(owner), { model: MODEL })
    const second = await enqueueBackfill(scopeOf(owner), { model: MODEL })

    assert.equal(first.enqueued, 1)
    assert.equal(second.enqueued, 0, "the second run must start no new work")
    assert.equal(second.alreadyQueued, 1, "and must say why, rather than reporting nothing to do")
    assert.equal((await jobsFor(id)).length, 1, "exactly one job row survives both runs")
  })

  it("two operators running it at the same time still produce one job", async () => {
    // The partial unique index is what enforces this, not the loop —
    // so the concurrent case has to be exercised, not reasoned about.
    const id = await analyzableItem(owner)
    const [a, b] = await Promise.all([
      enqueueBackfill(scopeOf(owner), { model: MODEL }),
      enqueueBackfill(scopeOf(owner), { model: MODEL }),
    ])

    assert.equal(a.enqueued + b.enqueued, 1, "exactly one of the two runs may create the job")
    assert.equal((await jobsFor(id)).length, 1)
  })

  it("does not duplicate an item's existing concepts", async () => {
    // replaceItemConcepts replaces; a re-analysis of an item that
    // already has concepts must not append a second copy. Guarded here
    // because the backfill is the one caller that can run analysis
    // over an item repeatedly.
    const id = await analyzableItem(owner)
    await replaceItemConcepts(id, [extracted("Retrieval"), extracted("Agents")], scopeOf(owner))
    await replaceItemConcepts(id, [extracted("Retrieval"), extracted("Agents")], scopeOf(owner))

    const { rows } = await getTestPool().query<{ n: string }>(
      "SELECT count(*) AS n FROM knowledge_item_concepts WHERE item_id = $1",
      [id],
    )
    assert.equal(Number(rows[0].n), 2, "re-analysis replaces, never appends")
  })
})

/* ================================================================== *
 * SCOPE
 * ================================================================== */

describe("never_analyzed — scope", () => {
  it("another owner's unanalyzed item is not in my backlog", async () => {
    await analyzableItem(stranger)

    assert.deepEqual(await candidates(owner), [])
    assert.equal((await countBacklog(scopeOf(owner), { model: MODEL })).total, 0)
  })

  it("enqueuing my backfill queues nothing for another owner's item", async () => {
    const theirs = await analyzableItem(stranger)
    const result = await enqueueBackfill(scopeOf(owner), { model: MODEL })

    assert.equal(result.candidates, 0)
    assert.equal(result.enqueued, 0)
    assert.deepEqual(await jobsFor(theirs), [], "their item must be untouched")
  })

  it("a COLLEAGUE's unanalyzed item is not in my backlog", async () => {
    // Same organization, different person. org_id alone would put
    // their whole library in my survey and queue model calls against
    // items I cannot even read.
    await analyzableItem(colleague)

    assert.deepEqual(await candidates(owner), [])
    assert.equal((await countBacklog(scopeOf(owner), { model: MODEL })).total, 0)
  })

  it("a COLLEAGUE's completed concepts job does not suppress my item", async () => {
    const mine = await analyzableItem(owner)
    await getTestPool().query(
      `INSERT INTO knowledge_jobs (id, item_id, org_id, created_by, job_type, status, attempts, max_attempts, available_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'concepts','done',1,5,$5,$5,$5)`,
      [`knj_${randomUUID()}`, mine, colleague.orgId, colleague.userId, Date.now()],
    )

    const found = await candidates(owner)
    assert.equal(found.length, 1, "their job is not my analysis, even in the same organization")
    assert.equal(found[0].reason, "never_analyzed")
  })

  it("a COLLEAGUE's concept association does not suppress my item either", async () => {
    const mine = await analyzableItem(owner)
    const theirConcept = await upsertConcept(
      { canonicalName: "Theirs", normalizedName: normalizeConceptName("Theirs"), type: "TOPIC" },
      scopeOf(colleague),
    )
    await getTestPool().query(
      `INSERT INTO knowledge_item_concepts (id, item_id, concept_id, org_id, created_by, source, confidence, evidence, created_at)
       VALUES ($1,$2,$3,$4,$5,'llm',0.9,'[]'::jsonb,$6)`,
      [`kic_${randomUUID()}`, mine, theirConcept.id, colleague.orgId, colleague.userId, Date.now()],
    )

    const found = await candidates(owner)
    assert.equal(found.length, 1)
    assert.equal(found[0].reason, "never_analyzed")
  })

  it("another owner's completed concepts job does not suppress MY item", async () => {
    // The mirror of the leak above: if the "have we looked?" check
    // ignored ownership, a stranger's job on an id could mark my item
    // as already analyzed and it would never be picked up.
    const mine = await analyzableItem(owner)
    const pool = getTestPool()
    await pool.query(
      `INSERT INTO knowledge_jobs (id, item_id, org_id, created_by, job_type, status, attempts, max_attempts, available_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'concepts','done',1,5,$5,$5,$5)`,
      [`knj_${randomUUID()}`, mine, stranger.orgId, stranger.userId, Date.now()],
    )

    const found = await candidates(owner)
    assert.equal(found.length, 1, "a job recorded under someone else must not count as my analysis")
    assert.equal(found[0].reason, "never_analyzed")
  })

  it("another owner's concept association on my item does not suppress it either", async () => {
    // The mirror of the job leak, on the other half of the predicate.
    //
    // replaceItemConcepts refuses to write across owners, so the row
    // is inserted directly: the point is not whether the write path
    // allows it (it does not) but whether the SURVEY would be fooled
    // by such a row if one existed. Without the owner predicate it is,
    // and my item silently drops out of my own backlog because someone
    // else's association made it look analyzed.
    const mine = await analyzableItem(owner)
    const theirConcept = await upsertConcept(
      { canonicalName: "Theirs", normalizedName: normalizeConceptName("Theirs"), type: "TOPIC" },
      scopeOf(stranger),
    )
    await getTestPool().query(
      `INSERT INTO knowledge_item_concepts (id, item_id, concept_id, org_id, created_by, source, confidence, evidence, created_at)
       VALUES ($1,$2,$3,$4,$5,'llm',0.9,'[]'::jsonb,$6)`,
      [`kic_${randomUUID()}`, mine, theirConcept.id, stranger.orgId, stranger.userId, Date.now()],
    )

    const found = await candidates(owner)
    assert.equal(found.length, 1, "a concept recorded under someone else must not count as my analysis")
    assert.equal(found[0].reason, "never_analyzed")
  })
})
