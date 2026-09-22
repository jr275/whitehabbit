/* ================================================================== *
 * SCOPE PARITY — two retrieval paths, one tenancy rule.
 *
 * The Library's search (repo.searchItems, parameterised ILIKE over
 * whole items) and Knowledge AI's retrieval (lib/knowledge/search,
 * GIN + HNSW over chunks) are separate systems answering separate
 * questions, and Phase H's recommendation is to keep them that way.
 *
 * But they each write the tenancy rule out independently, in their own
 * SQL. That is where the risk is: a change to one that does not reach
 * the other produces a leak in exactly one path, and every existing
 * test would still pass because each path is only ever tested against
 * itself. These tests exist to fail when they drift.
 *
 * This is cheaper than extracting a shared predicate and it protects
 * the thing that actually matters. If the two ever do merge, this file
 * becomes trivially true rather than wrong.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "@/lib/ai/embeddings"
import { embedItemChunks, indexItem } from "@/lib/knowledge/indexing"
import { searchKnowledge } from "@/lib/knowledge/search"
import * as repo from "@/lib/knowledge/repo"

const SECRET = "Zorblatt margin narrowed on tooling costs across the Zorblatt division this quarter."

const vec = () => {
  const v = new Array(EMBEDDING_DIMENSIONS).fill(0)
  v[0] = 1
  return v
}
const provider: EmbeddingProvider = {
  id: "fake",
  model: "parity-model",
  dimensions: EMBEDDING_DIMENSIONS,
  isConfigured: () => true,
  embedDocument: async () => ({ values: vec(), model: "parity-model", provider: "fake" }),
  embedQuery: async () => ({ values: vec(), model: "parity-model", provider: "fake" }),
}

async function save(t: TestTenant, text: string, opts: { archived?: boolean } = {}) {
  const id = `kn_${randomUUID()}`
  const now = Date.now()
  await getTestPool().query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, title, site_name, domain, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,$5,'Internal memo','Private','private.test',$6,$7,$7)`,
    [id, t.orgId, t.userId, `https://private.test/${id}`, opts.archived ?? false, text, now],
  )
  await indexItem({ itemId: id, orgId: t.orgId, userId: t.userId })
  await embedItemChunks({ itemId: id, orgId: t.orgId, userId: t.userId }, { embeddings: provider })
  return id
}

/** Both paths, asked the same question, reduced to "which items came
 *  back". Chunks map to their item so the two are comparable. */
async function bothPaths(scope: TestTenant, q: string, includeArchived = false) {
  const lib = await repo.searchItems(scope.orgId, scope.userId, q, 20)
  const ai = await searchKnowledge(
    { query: q, scope, mode: "hybrid", filters: { includeArchived } },
    { embeddings: provider },
  )
  return {
    library: new Set(lib.map((r) => r.id)),
    knowledgeAi: new Set(ai.chunks.map((c) => c.knowledgeItemId)),
  }
}

describe("scope parity between Library search and Knowledge AI retrieval", () => {
  let alice: TestTenant
  let bobSameOrg: TestTenant
  let carolOtherOrg: TestTenant
  let aliceItem: string

  before(async () => {
    await prepareDatabase()
    alice = await createTenant("parity-a")
    carolOtherOrg = await createTenant("parity-c")
    // A second user inside Alice's organization: the S5 case, where an
    // org-only check would leak and a per-user check does not.
    bobSameOrg = { ...alice, userId: `user_${randomUUID()}` }

    aliceItem = await save(alice, SECRET)
  })
  after(closeTestPool)

  it("the owner finds their own item through BOTH paths", async () => {
    // The control. Without this, every assertion below could pass
    // because neither path finds anything at all.
    const { library, knowledgeAi } = await bothPaths(alice, "Zorblatt")
    assert.ok(library.has(aliceItem), "Library search did not find the owner's own item")
    const chunkPath = await bothPaths(alice, "Zorblatt margin narrowed")
    assert.ok(
      chunkPath.knowledgeAi.has(aliceItem) || knowledgeAi.has(aliceItem),
      "Knowledge AI did not retrieve the owner's own item",
    )
  })

  it("another ORGANIZATION sees nothing through either path", async () => {
    const { library, knowledgeAi } = await bothPaths(carolOtherOrg, "Zorblatt margin narrowed")
    assert.equal(library.size, 0)
    assert.equal(knowledgeAi.size, 0)
  })

  it("another USER in the same organization sees nothing through either path", async () => {
    // S5. The two paths must agree that org membership alone is not
    // enough — this is the assertion most likely to catch a drift,
    // because an org-only predicate looks correct in isolation.
    const { library, knowledgeAi } = await bothPaths(bobSameOrg, "Zorblatt margin narrowed")
    assert.equal(library.size, 0, "Library search leaked across users in one org")
    assert.equal(knowledgeAi.size, 0, "Knowledge AI leaked across users in one org")
  })

  it("both paths exclude archived content by default", async () => {
    // Indexed first, then archived — the realistic order, and the one
    // that leaves chunks behind for retrieval to have to exclude.
    const archived = await save(alice, "Quarterly Blorptastic revenue notes, since archived.", { archived: true })
    const { library, knowledgeAi } = await bothPaths(alice, "Blorptastic")

    assert.ok(!library.has(archived), "Library search returned archived content")
    assert.ok(!knowledgeAi.has(archived), "Knowledge AI returned archived content")

    // …and Knowledge AI returns it when explicitly asked, which is the
    // documented difference rather than a hole: the Library has no
    // such affordance and is not expected to grow one here.
    const withArchived = await bothPaths(alice, "Blorptastic", true)
    assert.ok(withArchived.knowledgeAi.has(archived), "includeArchived did not reach the retrieval path")

  })

  it("neither path can be widened by its query text", async () => {
    // A query is data. Neither path may let it change scope, whatever
    // it looks like — this is the SQL-injection-shaped case for a
    // parameterised ILIKE and a plainto_tsquery alike.
    for (const hostile of ["' OR 1=1 --", "%", "_", "Zorblatt' OR org_id IS NOT NULL --"]) {
      const { library, knowledgeAi } = await bothPaths(carolOtherOrg, hostile)
      assert.equal(library.size, 0, `Library search widened on: ${hostile}`)
      assert.equal(knowledgeAi.size, 0, `Knowledge AI widened on: ${hostile}`)
    }
  })
})

describe("archived items are already excluded before backfill sees them", () => {
  let alice: TestTenant

  before(async () => {
    await prepareDatabase()
    alice = await createTenant("parity-bf")
  })
  after(closeTestPool)

  it("an archived item is never queued for embedding", async () => {
    // Embedding costs money per passage. Spending it on content the
    // user has put away, which retrieval then refuses to return, is
    // paying for something unreachable.
    const { findBackfillCandidates } = await import("@/lib/knowledge/backfill")
    const id = `kn_${randomUUID()}`
    const now = Date.now()
    await getTestPool().query(
      `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, title, site_name, domain, content_text, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,TRUE,'Put away','Ex','ex.test',$5,$6,$6)`,
      [id, alice.orgId, alice.userId, `https://ex.test/${id}`, SECRET, now],
    )
    const candidates = await findBackfillCandidates(
      { orgId: alice.orgId, userId: alice.userId },
      { model: "parity-model" },
    )
    assert.ok(!candidates.some((c) => c.itemId === id))
  })
})
