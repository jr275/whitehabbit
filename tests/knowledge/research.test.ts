/* ================================================================== *
 * RESEARCH — the brief, and what it refuses to put in one.
 *
 * Research reuses Ask's retrieval, floor, context assembly and
 * citation model wholesale, so those guarantees are not re-tested
 * here. What IS new is the structured output, and structure is where
 * a grounded feature quietly stops being grounded: a "key discovery"
 * reads as an established fact, so one citing nothing real is just an
 * assertion in a confident font.
 *
 * Real Postgres, real GIN, real HNSW; a synthetic vector space and a
 * stubbed model, so nothing here costs anything.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "@/lib/ai/embeddings"
import { embedItemChunks, indexItem } from "@/lib/knowledge/indexing"
import { researchObjective, ResearchUpstreamError } from "@/lib/knowledge/research"
import { InvalidObjectiveError, MAX_OBJECTIVE_CHARS, parseObjective } from "@/lib/knowledge/research-contract"

/** Documents sit on axis 0. A query sits there too UNLESS it is
 *  registered as off-topic, in which case it sits on axis 2 —
 *  orthogonal, cosine similarity 0, below any floor.
 *
 *  A fake that returned one vector for everything would make every
 *  query a perfect match and quietly disable the admissibility floor,
 *  which is the very thing two of these tests exist to check. */
const OFF_TOPIC = new Set(["seventeenth century Portuguese naval provisioning"])

function vec(axis: number) {
  const v = new Array(EMBEDDING_DIMENSIONS).fill(0)
  v[axis] = 1
  return v
}
const embeddings: EmbeddingProvider = {
  id: "fake",
  model: "research-test",
  dimensions: EMBEDDING_DIMENSIONS,
  isConfigured: () => true,
  embedDocument: async () => ({ values: vec(0), model: "research-test", provider: "fake" }),
  embedQuery: async (input) => ({
    values: vec(OFF_TOPIC.has(input.trim()) ? 2 : 0),
    model: "research-test",
    provider: "fake",
  }),
}

/** A model that returns exactly the JSON a test hands it. */
function model(payload: unknown) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload)
  let calls = 0
  const impl = (async () => {
    calls += 1
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text }],
        model: "stub-1",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
      text: async () => "",
    } as unknown as Response
  }) as unknown as typeof fetch
  return { impl, calls: () => calls }
}

const DOC =
  "Payment reconciliation teams increasingly apply machine learning to match transactions that differ in reference format. The gain is in the exceptions queue, not the straight-through cases, because those already match on identifiers."

async function save(t: TestTenant, text: string, title: string) {
  const id = `kn_${randomUUID()}`
  const now = Date.now()
  await getTestPool().query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, title, site_name, domain, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,FALSE,$5,'Ledger Weekly','ledger.test',$6,$7,$7)`,
    [id, t.orgId, t.userId, `https://ledger.test/${id}`, title, text, now],
  )
  await indexItem({ itemId: id, orgId: t.orgId, userId: t.userId })
  await embedItemChunks({ itemId: id, orgId: t.orgId, userId: t.userId }, { embeddings })
  return id
}

describe("parseObjective", () => {
  it("accepts a real objective and trims it", () => {
    assert.equal(parseObjective({ objective: "  how companies reconcile payments  " }), "how companies reconcile payments")
  })

  const rejected: [string, unknown][] = [
    ["a null body", null],
    ["a non-object body", "objective"],
    ["a missing objective", {}],
    ["an objective below the minimum", { objective: "AI" }],
    ["a whitespace-only objective", { objective: "          " }],
    ["a non-string objective", { objective: 42 }],
    ["an objective over the cap", { objective: "x".repeat(MAX_OBJECTIVE_CHARS + 1) }],
  ]
  for (const [label, body] of rejected) {
    it(`rejects ${label}`, () => assert.throws(() => parseObjective(body), InvalidObjectiveError))
  }

  it("has no field through which a caller could name an org or user", () => {
    // Scope is the enforcement, and the shape is the scope.
    const parsed = parseObjective({ objective: "reconciliation with AI", orgId: "org_other", userId: "user_other" })
    assert.equal(typeof parsed, "string")
  })
})

describe("researchObjective", () => {
  let alice: TestTenant
  let bob: TestTenant
  let savedKey: string | undefined

  before(async () => {
    // callLlm checks configuration BEFORE spending a request, so a
    // stubbed fetch alone is not enough to reach the model path. The
    // value is a placeholder; every call is served by the stub.
    savedKey = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = "sk-test-never-real"
    await prepareDatabase()
    alice = await createTenant("res-a")
    bob = await createTenant("res-b")
    await save(alice, DOC, "Reconciliation and ML")
  })
  after(async () => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = savedKey
    await closeTestPool()
  })

  const run = (t: TestTenant, objective: string, payload: unknown) => {
    const m = model(payload)
    return researchObjective({ objective, scope: t }, { embeddings, fetchImpl: m.impl }).then((brief) => ({ brief, m }))
  }

  const GOOD = {
    summary: "Teams apply machine learning to the exceptions queue [1].",
    discoveries: [
      { title: "Exceptions are the win", finding: "Straight-through cases already match.", importance: 1, citation_ids: ["1"] },
    ],
  }

  it("produces a brief grounded in the library", async () => {
    const { brief } = await run(alice, "machine learning payment reconciliation", GOOD)
    assert.equal(brief.status, "researched")
    assert.equal(brief.discoveries.length, 1)
    assert.equal(brief.sources.length, 1)
    assert.equal(brief.unresolvedCitationIds.length, 0)
    assert.ok(brief.retrieval.itemsCovered >= 1)
  })

  it("drops a discovery that cites nothing real", async () => {
    // A key discovery reads as an established fact. One whose sources
    // do not exist is an assertion, and showing it with a warning
    // would still be showing it.
    const { brief } = await run(alice, "machine learning payment reconciliation", {
      summary: "Grounded [1].",
      discoveries: [
        { title: "Real", finding: "Supported.", importance: 1, citation_ids: ["1"] },
        { title: "Invented", finding: "Cites a source that was never retrieved.", importance: 2, citation_ids: ["9"] },
        { title: "Unsourced", finding: "Cites nothing at all.", importance: 3, citation_ids: [] },
      ],
    })
    assert.deepEqual(brief.discoveries.map((d) => d.title), ["Real"])
  })

  it("renumbers surviving discoveries so the ordinals have no gaps", async () => {
    const { brief } = await run(alice, "machine learning payment reconciliation", {
      summary: "Grounded [1].",
      discoveries: [
        { title: "Dropped", finding: "x", importance: 1, citation_ids: ["9"] },
        { title: "Kept A", finding: "x", importance: 5, citation_ids: ["1"] },
        { title: "Kept B", finding: "x", importance: 9, citation_ids: ["1"] },
      ],
    })
    assert.deepEqual(brief.discoveries.map((d) => [d.title, d.importance]), [["Kept A", 1], ["Kept B", 2]])
  })

  it("reports an invented marker in the SUMMARY rather than dropping the synthesis", async () => {
    // Unlike a discovery, the prose around a bad marker is still the
    // model's reading of real sources — so it is shown, flagged.
    const { brief } = await run(alice, "machine learning payment reconciliation", {
      summary: "Real [1] and invented [9].",
      discoveries: [{ title: "Real", finding: "x", importance: 1, citation_ids: ["1"] }],
    })
    assert.deepEqual(brief.unresolvedCitationIds, ["9"])
    assert.match(brief.summary, /invented/)
  })

  it("lists only the sources the brief actually leans on", async () => {
    const { brief } = await run(alice, "machine learning payment reconciliation", {
      summary: "No markers at all here.",
      discoveries: [{ title: "Real", finding: "x", importance: 1, citation_ids: ["1"] }],
    })
    assert.deepEqual(brief.sources.map((s) => s.citationId), ["1"])
  })

  it("survives a model that wraps its JSON in a fence", async () => {
    const { brief } = await run(alice, "machine learning payment reconciliation", "```json\n" + JSON.stringify(GOOD) + "\n```")
    assert.equal(brief.status, "researched")
  })

  it("refuses to render prose that is not a brief", async () => {
    // Structure is the deliverable. Unparseable output is not a brief
    // with missing parts; it is a different thing.
    await assert.rejects(
      () => run(alice, "machine learning payment reconciliation", "Here are my thoughts, unstructured."),
      ResearchUpstreamError,
    )
  })

  it("returns no_evidence WITHOUT calling the model when nothing matches", async () => {
    const m = model(GOOD)
    const brief = await researchObjective(
      { objective: "seventeenth century Portuguese naval provisioning", scope: alice },
      { embeddings, fetchImpl: m.impl },
    )
    assert.equal(brief.status, "no_evidence")
    assert.equal(brief.discoveries.length, 0)
    assert.equal(brief.sources.length, 0)
    assert.equal(brief.usage, undefined, "a refusal spent nothing")
    assert.equal(m.calls(), 0, "no evidence must mean no model call, and no cost")
  })

  it("never researches another tenant's library", async () => {
    const m = model(GOOD)
    const brief = await researchObjective(
      { objective: "machine learning payment reconciliation", scope: bob },
      { embeddings, fetchImpl: m.impl },
    )
    assert.equal(brief.status, "no_evidence")
    assert.equal(m.calls(), 0)
    assert.ok(!JSON.stringify(brief).includes("exceptions queue"), "another tenant's text leaked")
  })
})
