/* ================================================================== *
 * HYBRID RETRIEVAL — proving it is one system, not two searches.
 *
 * The claim worth testing is not "lexical works" and "semantic works"
 * separately; each already has coverage in search.test.ts. It is that
 * the two cover each other's blind spots and that fusion combines
 * them, because a hybrid system that merely runs two queries and
 * concatenates them is indistinguishable from a real one until the
 * day a paraphrased question returns nothing.
 *
 * THE VECTOR SPACE IS SYNTHETIC AND EXACT, ON PURPOSE. Every fixture
 * is placed at a known angle in a two-axis plane, so cosine
 * similarity between any query and any document is a number this file
 * chose — cos(theta) — rather than whatever a real model happened to
 * produce. That is what lets a test say "this sits below the floor"
 * and mean it. Nothing here depends on a real embedding model, and
 * nothing here costs anything to run.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "@/lib/ai/embeddings"
import { embedItemChunks, indexItem } from "@/lib/knowledge/indexing"
import { searchKnowledge } from "@/lib/knowledge/search"
import { answerFromKnowledge, DEFAULT_MIN_SEMANTIC_SIMILARITY, isAdmissibleEvidence } from "@/lib/knowledge/answer"
import type { RetrievedChunk } from "@/lib/knowledge/search/types"

/* ---- The synthetic vector space ---------------------------------- *
 * Two orthogonal axes. A vector at angle theta from axis 0 has cosine
 * similarity cos(theta) with the query, which always sits at theta=0.
 * ------------------------------------------------------------------ */

function vectorAt(degrees: number): number[] {
  const rad = (degrees * Math.PI) / 180
  const v = new Array(EMBEDDING_DIMENSIONS).fill(0)
  v[0] = Math.cos(rad)
  v[1] = Math.sin(rad)
  return v
}

/** A third axis, orthogonal to the whole plane above, so a query
 *  placed here has similarity 0 with EVERY fixture.
 *
 *  Worth stating why this is needed rather than just using 90
 *  degrees: semantic retrieval returns the nearest neighbours however
 *  far away they are, so "far from the query" is only meaningful
 *  relative to every other document. A query at 90 degrees is
 *  orthogonal to axis 0 and nearly PARALLEL to a document sitting at
 *  89 — which is exactly the trap this file fell into first. */
function offPlaneVector(): number[] {
  const v = new Array(EMBEDDING_DIMENSIONS).fill(0)
  v[2] = 1
  return v
}

const ORTHOGONAL_QUERIES = new Set<string>()

/** Text → angle. Registered per fixture so each document's similarity
 *  to the query is a deliberate choice, not an accident of wording. */
const ANGLES = new Map<string, number>()
const QUERY_ANGLE = new Map<string, number>()

const provider = (): EmbeddingProvider => ({
  id: "fake",
  model: "synthetic-plane-1",
  dimensions: EMBEDDING_DIMENSIONS,
  isConfigured: () => true,
  embedDocument: async (input) => ({
    // Chunking may reshape the text slightly; match on a prefix so a
    // fixture keeps its angle either way. 90 degrees (orthogonal,
    // similarity 0) is the default for anything unregistered.
    values: vectorAt(lookup(ANGLES, input) ?? 90),
    model: "synthetic-plane-1",
    provider: "fake",
  }),
  embedQuery: async (input) => ({
    values: ORTHOGONAL_QUERIES.has(input.trim()) ? offPlaneVector() : vectorAt(QUERY_ANGLE.get(input.trim()) ?? 0),
    model: "synthetic-plane-1",
    provider: "fake",
  }),
})

function lookup(map: Map<string, number>, text: string): number | undefined {
  for (const [key, value] of map) if (text.includes(key)) return value
  return undefined
}

/* ---- Fixtures ---------------------------------------------------- *
 * Wording is chosen so lexical overlap with the query is controlled
 * independently of semantic distance — the only way to tell the two
 * retrievers apart.
 * ------------------------------------------------------------------ */

/** No content word in common with the query below. Lexical cannot
 *  reach it; semantic must. */
const PARAPHRASE =
  "Projects frequently fail because requirements are unclear and teams lack sufficient validation before delivery."
const PARAPHRASE_QUERY = "Why do software initiatives collapse?"

/** Shares exact words with its query, and sits far away in vector
 *  space. Semantic cannot reach it; lexical must. */
const EXACT = "The quarterly telemetry ingest pipeline retries with jittered exponential backoff."
const EXACT_QUERY = "telemetry ingest backoff"

/** Near the paraphrase query in vector space but below the floor —
 *  a topical neighbour that supports no claim. */
const NEIGHBOUR = "Organisational culture shapes how groups respond when plans slip."

/** Reachable by BOTH retrievers for the same query. */
const BOTH = "Unclear requirements are the most common reason projects fail."
const BOTH_QUERY = "unclear requirements"

ANGLES.set(PARAPHRASE.slice(0, 40), 25) // cos 25° ≈ 0.906 — well above the floor
ANGLES.set(EXACT.slice(0, 40), 89) //         cos 89° ≈ 0.017 — semantically unrelated
ANGLES.set(NEIGHBOUR.slice(0, 40), 66) //     cos 66° ≈ 0.407 — below the 0.5 floor
ANGLES.set(BOTH.slice(0, 40), 20) //          cos 20° ≈ 0.940

QUERY_ANGLE.set(PARAPHRASE_QUERY, 0)
QUERY_ANGLE.set(EXACT_QUERY, 0)
QUERY_ANGLE.set(BOTH_QUERY, 0)
ORTHOGONAL_QUERIES.add("a question about nothing anyone saved")

async function save(t: TestTenant, text: string, title: string) {
  const pool = getTestPool()
  const id = `kn_${randomUUID()}`
  const now = Date.now()
  await pool.query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, title, site_name, domain, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,FALSE,$5,'Example','example.test',$6,$7,$7)`,
    [id, t.orgId, t.userId, `https://example.test/${id}`, title, text, now],
  )
  await indexItem({ itemId: id, orgId: t.orgId, userId: t.userId })
  await embedItemChunks({ itemId: id, orgId: t.orgId, userId: t.userId }, { embeddings: provider() })
  return id
}

describe("hybrid retrieval — the seven cases", () => {
  let alice: TestTenant
  let paraphraseId: string
  let exactId: string
  let neighbourId: string
  let bothId: string

  before(async () => {
    await prepareDatabase()
    alice = await createTenant("hybrid")
    paraphraseId = await save(alice, PARAPHRASE, "On project failure")
    exactId = await save(alice, EXACT, "Telemetry pipeline")
    neighbourId = await save(alice, NEIGHBOUR, "On culture")
    bothId = await save(alice, BOTH, "Requirements")
  })
  after(closeTestPool)

  const search = (query: string, mode: "lexical" | "semantic" | "hybrid" = "hybrid") =>
    searchKnowledge({ query, scope: alice, mode }, { embeddings: provider() })

  it("CASE A — lexical alone finds what semantic cannot reach", async () => {
    const semanticOnly = await search(EXACT_QUERY, "semantic")
    const lexicalOnly = await search(EXACT_QUERY, "lexical")

    assert.ok(
      lexicalOnly.chunks.some((c) => c.knowledgeItemId === exactId),
      "lexical must find its own exact words",
    )
    // Semantic returns the nearest neighbours regardless of how far
    // they are, so the assertion is about SCORE, not absence: this
    // document is nearly orthogonal to the query.
    const semanticHit = semanticOnly.chunks.find((c) => c.knowledgeItemId === exactId)
    assert.ok(!semanticHit || semanticHit.score < 0.1, "semantic should place this document nowhere near the query")
  })

  it("CASE B — semantic alone finds a paraphrase with no shared words", async () => {
    // The central claim of the whole feature. The query and the
    // document share no content word; only meaning connects them.
    const lexicalOnly = await search(PARAPHRASE_QUERY, "lexical")
    const semanticOnly = await search(PARAPHRASE_QUERY, "semantic")

    assert.equal(lexicalOnly.chunks.length, 0, "no lexical hit is possible for this pair")
    const hit = semanticOnly.chunks.find((c) => c.knowledgeItemId === paraphraseId)
    assert.ok(hit, "semantic retrieval failed to find the paraphrase")
    assert.ok(hit.score > 0.85, `expected ~0.906, got ${hit.score}`)
  })

  it("CASE C — both retrievers find the same passage, and it is returned once", async () => {
    const result = await search(BOTH_QUERY)
    assert.equal(result.executed.lexical, true)
    assert.equal(result.executed.semantic, true)

    const hits = result.chunks.filter((c) => c.knowledgeItemId === bothId)
    assert.equal(hits.length, 1, "a chunk found twice must be returned once")
    // Both signals survive the merge — this is what admissibility and
    // any future ranking work read.
    assert.ok(hits[0].signals.lexical !== undefined, "lexical signal lost in fusion")
    assert.ok(hits[0].signals.semantic !== undefined, "semantic signal lost in fusion")
  })

  it("CASE D — a semantic neighbour below the floor is retrieved but not admissible", async () => {
    // Retrieval and evidence are different questions. The neighbour is
    // genuinely the nearest thing on the topic; that does not make it
    // support a claim.
    const result = await search(PARAPHRASE_QUERY, "semantic")
    const neighbour = result.chunks.find((c) => c.knowledgeItemId === neighbourId)
    assert.ok(neighbour, "the neighbour should still be RETRIEVED")
    assert.ok(neighbour.score < DEFAULT_MIN_SEMANTIC_SIMILARITY, `expected ~0.407, got ${neighbour.score}`)
    assert.equal(isAdmissibleEvidence(neighbour), false)

    const paraphrase = result.chunks.find((c) => c.knowledgeItemId === paraphraseId)!
    assert.equal(isAdmissibleEvidence(paraphrase), true, "the real match must survive the same filter")
  })

  it("CASE E — a strong lexical match is not displaced by semantic noise", async () => {
    const result = await search(EXACT_QUERY)
    assert.equal(result.chunks[0].knowledgeItemId, exactId, "the exact match must rank first")
  })

  it("CASE F — fusion combines the two lists rather than concatenating them", async () => {
    const result = await search(BOTH_QUERY)
    const lexical = await search(BOTH_QUERY, "lexical")
    const semantic = await search(BOTH_QUERY, "semantic")

    const ids = result.chunks.map((c) => c.chunkId)
    assert.equal(new Set(ids).size, ids.length, "fusion must deduplicate")
    assert.ok(result.candidates.lexical > 0 && result.candidates.semantic > 0)

    // The fused score is a rank-based value from RRF, not either
    // retriever's raw score — a caller comparing ts_rank against a
    // cosine similarity would be comparing two different things that
    // happen to be numbers.
    const fused = result.chunks.find((c) => c.knowledgeItemId === bothId)!
    const rawLexical = lexical.chunks.find((c) => c.knowledgeItemId === bothId)!.score
    const rawSemantic = semantic.chunks.find((c) => c.knowledgeItemId === bothId)!.score
    assert.notEqual(fused.score, rawLexical)
    assert.notEqual(fused.score, rawSemantic)

    // Agreement between the retrievers is what RRF rewards: a chunk
    // both ranked must outscore one only a single retriever saw.
    const soloIds = new Set(
      result.chunks.filter((c) => c.signals.lexical === undefined || c.signals.semantic === undefined).map((c) => c.chunkId),
    )
    for (const solo of result.chunks.filter((c) => soloIds.has(c.chunkId))) {
      assert.ok(fused.score >= solo.score, "a doubly-ranked chunk must not fall below a singly-ranked one")
    }

    assert.deepEqual(
      result.chunks.map((c) => c.score),
      [...result.chunks.map((c) => c.score)].sort((a, b) => b - a),
      "fused results must be ordered by fused score",
    )
  })

  it("CASE G — nothing admissible produces no_evidence, and the model is never called", async () => {
    // The credential is present, so nothing except the refusal rule
    // itself can be what stops the call. A spy on fetch is the only
    // seam the answer pipeline exposes to the provider, which makes
    // "zero calls" a claim about the real code path.
    const savedKey = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = "sk-test-never-real"
    let calls = 0
    const spyFetch = (async () => {
      calls += 1
      throw new Error("the model must not be called when there is no evidence")
    }) as unknown as typeof fetch

    try {
      const answer = await answerFromKnowledge(
        { question: "a question about nothing anyone saved", scope: alice },
        { embeddings: provider(), fetchImpl: spyFetch },
      )
      assert.equal(answer.status, "no_evidence")
      assert.equal(answer.citations.length, 0)
      assert.equal(answer.usage, undefined, "a refusal has no usage — it spent nothing")
      assert.equal(calls, 0, "no admissible evidence must mean no model call, and no cost")
    } finally {
      if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = savedKey
    }
  })
})

/* ------------------------------------------------------------------ *
 * The floor, at its boundary. Pure — the exact-equality case cannot be
 * asserted through float arithmetic in Postgres, and the rule itself
 * is what matters.
 * ------------------------------------------------------------------ */

function chunkWith(signals: RetrievedChunk["signals"]): RetrievedChunk {
  return {
    knowledgeItemId: "kn_x",
    chunkId: "knc_x",
    score: 0,
    title: "t",
    source: null,
    snippet: "text",
    ordinal: 0,
    charStart: 0,
    charEnd: 4,
    signals,
    metadata: { domain: null, url: "https://example.test/x", lang: null, publishedAt: null },
  }
}

describe("semantic relevance floor", () => {
  const floor = DEFAULT_MIN_SEMANTIC_SIMILARITY

  it("defaults to 0.5", () => {
    assert.equal(floor, 0.5)
  })

  it("rejects a semantic-only hit below the floor", () => {
    assert.equal(isAdmissibleEvidence(chunkWith({ semantic: floor - 0.0001 }), floor), false)
  })

  it("admits a semantic-only hit exactly at the floor", () => {
    // The boundary is inclusive. Stated as a test because ">=" versus
    // ">" is the kind of thing that flips silently in a refactor.
    assert.equal(isAdmissibleEvidence(chunkWith({ semantic: floor }), floor), true)
  })

  it("admits a semantic-only hit above the floor", () => {
    assert.equal(isAdmissibleEvidence(chunkWith({ semantic: floor + 0.0001 }), floor), true)
  })

  it("admits a lexical hit outright, however low its score", () => {
    // A lexical hit means every word of the question appears in the
    // passage: weak as ranking, strong as evidence of being on topic.
    assert.equal(isAdmissibleEvidence(chunkWith({ lexical: 0.0000001 }), floor), true)
  })

  it("admits a chunk with both signals even when the semantic one is below the floor", () => {
    assert.equal(isAdmissibleEvidence(chunkWith({ lexical: 0.01, semantic: 0.01 }), floor), true)
  })

  it("rejects a chunk with no signals at all", () => {
    assert.equal(isAdmissibleEvidence(chunkWith({}), floor), false)
  })

  it("honours a floor of 0 — every retrieved chunk becomes admissible", () => {
    assert.equal(isAdmissibleEvidence(chunkWith({ semantic: 0 }), 0), true)
  })

  it("honours a floor of 1 — only an exact vector match survives", () => {
    assert.equal(isAdmissibleEvidence(chunkWith({ semantic: 0.999 }), 1), false)
    assert.equal(isAdmissibleEvidence(chunkWith({ semantic: 1 }), 1), true)
  })
})

/* ------------------------------------------------------------------ *
 * WHY WE DO NOT NORMALIZE EMBEDDINGS.
 *
 * Google documents that gemini-embedding-001 returns UNNORMALIZED
 * vectors when outputDimensionality is set to anything below its
 * native width — which is exactly what this pipeline does, asking for
 * 768. Read quickly, that says our similarity scores are wrong and
 * the relevance floor is meaningless.
 *
 * It does not, because the index is vector_cosine_ops and cosine
 * distance divides by both magnitudes. The scores are true cosine
 * similarities whatever the vector's length, so the floor means what
 * it says and no normalization step is needed.
 *
 * That reasoning is load-bearing enough to be measured rather than
 * argued, and it is measured HERE rather than in a comment because it
 * stops being true the moment someone switches the index to
 * vector_l2_ops or vector_ip_ops. If that happens, this test fails
 * and the failure explains itself.
 * ------------------------------------------------------------------ */

describe("cosine distance is scale-invariant, so unnormalized vectors are safe", () => {
  before(async () => {
    await prepareDatabase()
  })
  after(closeTestPool)

  const literal = (v: number[]) => `[${v.join(",")}]`

  it("a vector and the same vector scaled are the same distance from a query", async () => {
    const pool = getTestPool()
    const a = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => Math.sin(i * 0.7))
    const b = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => Math.cos(i * 0.31))
    const norm = Math.sqrt(a.reduce((n, x) => n + x * x, 0))

    const { rows } = await pool.query<{ raw: string; scaled: string; unit: string }>(
      `SELECT $1::vector <=> $4::vector AS raw,
              $2::vector <=> $4::vector AS scaled,
              $3::vector <=> $4::vector AS unit`,
      [literal(a), literal(a.map((x) => x * 7.3)), literal(a.map((x) => x / norm)), literal(b)],
    )

    // Not exact equality: pgvector stores float4, so the three differ
    // in the last bits of storage rounding. A tolerance this tight
    // still fails immediately under an L2 or inner-product operator,
    // where scaling changes the distance outright.
    const [raw, scaled, unit] = [Number(rows[0].raw), Number(rows[0].scaled), Number(rows[0].unit)]
    assert.ok(Math.abs(raw - scaled) < 1e-6, `scaling changed the distance: ${raw} vs ${scaled}`)
    assert.ok(Math.abs(raw - unit) < 1e-6, `normalizing changed the distance: ${raw} vs ${unit}`)
  })

  it("the HNSW index is built with the cosine operator class this depends on", async () => {
    const { rows } = await getTestPool().query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_knowledge_chunk_embeddings_hnsw'`,
    )
    assert.equal(rows.length, 1, "the HNSW index is missing")
    assert.match(rows[0].indexdef, /vector_cosine_ops/, "the argument above only holds for cosine")
  })
})
