/* ================================================================== *
 * BACKFILL — never_summarized.
 *
 * Summaries used to happen only when someone pressed a button, so most
 * items never had one. They are now the pipeline's last stage, which
 * means the same question the concepts stage raised applies again:
 * how do you tell an item nobody has summarized from one that was
 * summarized and produced nothing?
 *
 * The answer is the same — a COMPLETED summary job — and these tests
 * exist to keep it that way. Getting it wrong costs real money: every
 * pass of the backfill would spend another Anthropic call per item to
 * learn what the last pass already learned.
 *
 * Real PostgreSQL. No model is called; no credential is needed.
 * ================================================================== */

import { after, before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import * as repo from "@/lib/knowledge/repo"
import { countBacklog, enqueueBackfill, findBackfillCandidates } from "@/lib/knowledge/backfill"

let owner: TestTenant
let colleague: TestTenant

before(async () => {
  await prepareDatabase()
})
beforeEach(async () => {
  owner = await createTenant("sum-owner")
  const mate = await createTenant("sum-colleague")
  await getTestPool().query("UPDATE memberships SET org_id = $1 WHERE user_id = $2", [owner.orgId, mate.userId])
  colleague = { orgId: owner.orgId, userId: mate.userId }
})
after(closeTestPool)

const scopeOf = (t: TestTenant) => ({ orgId: t.orgId, userId: t.userId })
const MODEL = "test-embedding-model"
const candidates = (t: TestTenant) => findBackfillCandidates(scopeOf(t), { model: MODEL })

let seq = 0

/** An item whose ONLY outstanding stage is the summary: chunked,
 *  embedded and analyzed. Anything less and the survey would report a
 *  different reason, and the case would be testing something else. */
async function summarizableItem(t: TestTenant, opts: { text?: string | null } = {}) {
  seq += 1
  const id = `kn_${randomUUID()}`
  const now = Date.now()
  const hash = `sum-hash-${seq}`
  const pool = getTestPool()
  await pool.query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived,
                                  title, site_name, domain, content_text, content_hash, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,FALSE,'A piece','Ex','ex.test',$5,$6,$7,$7)`,
    [
      id,
      t.orgId,
      t.userId,
      `https://ex.test/sum-${id}`,
      opts.text === undefined ? "A body of text worth summarizing, about retrieval and agents." : opts.text,
      hash,
      now,
    ],
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
  await pool.query(
    `INSERT INTO knowledge_chunk_embeddings (chunk_id, org_id, created_by, embedding, provider, model, dimensions, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'fake',$5,768,$6,$6)`,
    [`chunk_${id}_0`, t.orgId, t.userId, `[${new Array(768).fill(0).join(",")}]`, MODEL, now],
  )
  await completedJob(id, t, "concepts")
  return id
}

async function completedJob(itemId: string, t: TestTenant, jobType: "concepts" | "summary") {
  await getTestPool().query(
    `INSERT INTO knowledge_jobs (id, item_id, org_id, created_by, job_type, status, attempts, max_attempts, available_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,'done',1,5,$6,$6,$6)`,
    [`knj_${randomUUID()}`, itemId, t.orgId, t.userId, jobType, Date.now()],
  )
}

describe("never_summarized — selection", () => {
  it("selects an item with extracted text and no summary", async () => {
    const id = await summarizableItem(owner)
    const found = await candidates(owner)
    assert.equal(found.length, 1)
    assert.equal(found[0].itemId, id)
    assert.equal(found[0].reason, "never_summarized")
  })

  it("does NOT select an item that already has a summary", async () => {
    const id = await summarizableItem(owner)
    await repo.setSummary(id, owner.orgId, owner.userId, "Two sentences about the piece.")
    assert.deepEqual(await candidates(owner), [])
  })

  it("does NOT select an item a completed summary job already ran on", async () => {
    // The expensive mistake. No summary AND no record of trying looks
    // identical to no summary AND a run that yielded nothing — and
    // re-running the second group costs a real Anthropic call per item
    // on every single pass.
    const id = await summarizableItem(owner)
    await completedJob(id, owner, "summary")
    assert.deepEqual(await candidates(owner), [], "a completed attempt must not be repeated")
  })

  it("DOES select an item whose summary job failed", async () => {
    const id = await summarizableItem(owner)
    const job = await repo.enqueueSummaryJob(id, owner.orgId, owner.userId)
    const claimed = await repo.claimJobById(job!.id, "worker-test")
    await repo.failJob(claimed!.id, "worker-test", { attempts: 5, error: "not configured", retryAt: null })

    const found = await candidates(owner)
    assert.equal(found.length, 1)
    assert.equal(found[0].reason, "never_summarized")
  })

  it("queues a SUMMARY job, not an index or concepts job", async () => {
    const id = await summarizableItem(owner)
    const result = await enqueueBackfill(scopeOf(owner), { model: MODEL })
    assert.equal(result.enqueued, 1)

    const { rows } = await getTestPool().query<{ job_type: string; status: string }>(
      "SELECT job_type, status FROM knowledge_jobs WHERE item_id = $1 AND status = 'queued'",
      [id],
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].job_type, "summary")
  })

  it("running it twice queues nothing the second time", async () => {
    await summarizableItem(owner)
    const first = await enqueueBackfill(scopeOf(owner), { model: MODEL })
    const second = await enqueueBackfill(scopeOf(owner), { model: MODEL })
    assert.equal(first.enqueued, 1)
    assert.equal(second.enqueued, 0)
    assert.equal(second.alreadyQueued, 1)
  })

  it("counts never_summarized as its own line in the backlog", async () => {
    await summarizableItem(owner)
    const counts = await countBacklog(scopeOf(owner), { model: MODEL })
    assert.equal(counts.neverSummarized, 1)
    assert.equal(counts.neverAnalyzed, 0)
    assert.equal(counts.missingVectors, 0)
  })

  it("ranks analysis ahead of a summary when an item needs both", async () => {
    // Concepts feed Explorer, Related Knowledge and Discovery; a
    // summary feeds one card. When only one job can be open per item,
    // the one more things depend on goes first — and the next run
    // picks up the other.
    const id = await summarizableItem(owner)
    await getTestPool().query("DELETE FROM knowledge_jobs WHERE item_id = $1 AND job_type = 'concepts'", [id])

    const found = await candidates(owner)
    assert.equal(found[0].reason, "never_analyzed")
  })
})

describe("never_summarized — scope", () => {
  it("never selects a COLLEAGUE's item", async () => {
    await summarizableItem(colleague)
    assert.deepEqual(await candidates(owner), [])
    assert.equal((await countBacklog(scopeOf(owner), { model: MODEL })).total, 0)
  })

  it("a COLLEAGUE's completed summary job does not suppress my item", async () => {
    const mine = await summarizableItem(owner)
    await completedJob(mine, colleague, "summary")

    const found = await candidates(owner)
    assert.equal(found.length, 1, "their job is not my summary, even in the same organization")
    assert.equal(found[0].reason, "never_summarized")
  })
})
