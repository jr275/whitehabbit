/* ================================================================== *
 * GROUNDED ANSWERING — against a real database, never a real provider.
 *
 * The properties under test are the ones that separate this from a
 * chatbot with a search box bolted on: that an empty library produces
 * a refusal and NOT a model call, that another user's content can
 * never become a source, that a fabricated citation is detected, and
 * that the passages handed to the model are the ones retrieval
 * actually found.
 *
 * Retrieval runs against real PostgreSQL with real GIN and HNSW
 * indexes. Both the embedding provider and the model are fakes, so the
 * whole file costs nothing and cannot reach a network — the fake fetch
 * asserts on the exact request the pipeline would have sent.
 * ================================================================== */

import { after, before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "@/lib/ai/embeddings"
import { embedItemChunks, indexItem } from "@/lib/knowledge/indexing"
import {
  answerFromKnowledge,
  KnowledgeAnswerNotConfiguredError,
  KnowledgeAnswerUpstreamError,
  MAX_QUESTION_CHARS,
} from "@/lib/knowledge/answer"

const AXES = ["chunking", "embedding", "authentication", "gardening"]

function fakeVector(text: string): number[] {
  const v = new Array(EMBEDDING_DIMENSIONS).fill(0)
  const lower = text.toLowerCase()
  AXES.forEach((axis, i) => {
    if (lower.includes(axis)) v[i] = 1
  })
  v[AXES.length] = 0.01
  return v
}

const fakeEmbeddings: EmbeddingProvider = {
  id: "fake",
  model: "fake-embed-1",
  dimensions: EMBEDDING_DIMENSIONS,
  isConfigured: () => true,
  embedDocument: async (input) => ({ values: fakeVector(input), model: "fake-embed-1", provider: "fake" }),
  embedQuery: async (input) => ({ values: fakeVector(input), model: "fake-embed-1", provider: "fake" }),
}

/** A fake Anthropic endpoint. Records every request so a test can
 *  assert on what the model was actually shown — or that it was never
 *  asked at all. */
function fakeModel(text: string | ((prompt: string) => string), opts: { status?: number } = {}) {
  const requests: { system: string; prompt: string; maxTokens: number }[] = []
  const impl = (async (_url: unknown, init: unknown) => {
    const body = JSON.parse(String((init as RequestInit).body))
    requests.push({ system: body.system, prompt: body.messages[0].content, maxTokens: body.max_tokens })
    const status = opts.status ?? 200
    const answer = typeof text === "function" ? text(body.messages[0].content) : text
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({
        content: [{ type: "text", text: answer }],
        model: "fake-model-1",
        usage: { input_tokens: 900, output_tokens: 40 },
      }),
      text: async () => "error body",
    } as Response
  }) as unknown as typeof fetch
  return { impl, requests }
}

const DOCS = {
  chunking: "Most retrieval failures are chunking failures rather than model failures, and the distinction matters.",
  embedding: "An embedding model mismatched to the domain is invisible in evaluation and obvious in production.",
  gardening: "Gardening in clay soil needs drainage before it needs fertiliser, whatever the label promises.",
}

async function saveAndIndex(t: TestTenant, text: string, opts: { title?: string } = {}) {
  const p = getTestPool()
  const id = `kn_${randomUUID()}`
  const now = Date.now()
  await p.query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived, title, site_name, domain, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,FALSE,$5,'Example','example.test',$6,$7,$7)`,
    [id, t.orgId, t.userId, `https://example.test/${id}`, opts.title ?? "A saved piece", text, now],
  )
  await indexItem({ itemId: id, orgId: t.orgId, userId: t.userId })
  await embedItemChunks({ itemId: id, orgId: t.orgId, userId: t.userId }, { embeddings: fakeEmbeddings })
  return id
}

let savedKey: string | undefined

describe("answerFromKnowledge", () => {
  let alice: TestTenant
  let bob: TestTenant
  /** A user who has saved nothing — the literal empty-library path. */
  let carol: TestTenant
  let chunkingItem: string

  before(async () => {
    await prepareDatabase()
    alice = await createTenant("ans")
    bob = await createTenant("ansb")
    carol = await createTenant("ansc")
    chunkingItem = await saveAndIndex(alice, DOCS.chunking, { title: "On chunking" })
    await saveAndIndex(alice, DOCS.embedding, { title: "On embeddings" })
    await saveAndIndex(bob, DOCS.gardening, { title: "Bob's private gardening notes" })
  })
  after(closeTestPool)

  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = "sk-test"
  })

  const restore = () => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = savedKey
  }

  it("answers from the user's own passages and cites them", async () => {
    const model = fakeModel("Chunking is usually the culprit [1].")
    const result = await answerFromKnowledge(
      // Reaches the chunking article through semantic similarity, not
      // through shared words: 'simple' does not stem, so "fail" does
      // not match "failures" lexically.
      { question: "why do chunking projects fail?", scope: alice },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    )
    restore()

    assert.equal(result.status, "answered")
    assert.equal(result.answer, "Chunking is usually the culprit [1].")
    assert.ok(result.citations.length > 0)
    assert.equal(result.citations[0].used, true)
    assert.deepEqual(result.unresolvedCitationIds, [])
    assert.equal(result.usage?.inputTokens, 900)
  })

  it("REFUSES without calling the model when nothing is retrieved", async () => {
    // The central guarantee. A model asked to answer from no sources
    // answers from its own memory, fluently, and the output is
    // indistinguishable from a grounded one.
    const model = fakeModel("I definitely should not have been asked.")
    const result = await answerFromKnowledge(
      { question: "what is the airspeed velocity of an unladen swallow", scope: carol },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    )
    restore()

    assert.equal(result.status, "no_evidence")
    assert.equal(model.requests.length, 0, "no evidence must mean no model call")
    assert.deepEqual(result.citations, [])
    assert.equal(result.usage, undefined, "a refusal reports no usage because none was spent")
    assert.equal(result.retrieval.chunksRetrieved, 0, "an empty library retrieves nothing at all")
  })

  it("never uses another user's content as a source", async () => {
    const model = fakeModel("Drainage first [1].")
    const result = await answerFromKnowledge(
      { question: "gardening in clay soil", scope: alice },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    )
    restore()

    // Asserted on the content, not on the status: Alice's own
    // irrelevant articles being rejected as evidence and Bob's article
    // being invisible are two different guarantees, and only the second
    // one is about security.
    const bobsText = DOCS.gardening.slice(0, 40)
    assert.ok(
      !result.citations.some((c) => c.title.includes("Bob")),
      "Bob's item must never be cited to Alice",
    )
    for (const req of model.requests) {
      assert.ok(!req.prompt.includes(bobsText), "Bob's text must never reach a prompt in Alice's session")
    }
  })

  it("rejects a nearest neighbour that is not evidence", async () => {
    // Vector search has no relevance floor: it returns the closest
    // chunks whether or not any of them is about the question. Without
    // the admissibility rule the refusal above can never fire in
    // hybrid mode, because semantic retrieval always returns the whole
    // small library.
    const model = fakeModel("should not be reached")
    const result = await answerFromKnowledge(
      { question: "gardening in clay soil", scope: alice },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    )
    restore()

    assert.equal(result.status, "no_evidence")
    assert.equal(model.requests.length, 0)
    assert.ok(result.retrieval.chunksRetrieved > 0, "neighbours WERE returned")
    assert.equal(
      result.retrieval.chunksRejected,
      result.retrieval.chunksRetrieved,
      "every neighbour should have been rejected as evidence",
    )
  })

  it("a lexical hit is admissible whatever its similarity", async () => {
    // plainto_tsquery ANDs the terms, so a hit means every word of the
    // question is in the passage. That is weak ranking and strong
    // evidence, and the floor must not throw it away.
    const model = fakeModel("Chunking [1].")
    const result = await answerFromKnowledge(
      { question: "chunking failures", scope: alice, mode: "lexical" },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    )
    restore()
    assert.equal(result.status, "answered")
    assert.equal(result.retrieval.chunksRejected, 0)
  })

  it("the floor is configurable, and raising it to 1 rejects everything semantic", async () => {
    const saved = process.env.KNOWLEDGE_MIN_SEMANTIC_SIMILARITY
    process.env.KNOWLEDGE_MIN_SEMANTIC_SIMILARITY = "1.1"
    const model = fakeModel("should not be reached")
    const result = await answerFromKnowledge(
      { question: "chunking failures", scope: alice, mode: "semantic" },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    )
    if (saved === undefined) delete process.env.KNOWLEDGE_MIN_SEMANTIC_SIMILARITY
    else process.env.KNOWLEDGE_MIN_SEMANTIC_SIMILARITY = saved
    restore()

    assert.equal(result.status, "no_evidence")
    assert.equal(model.requests.length, 0)
  })

  it("shows the model only the passages retrieval actually found", async () => {
    const model = fakeModel("Chunking [1].")
    await answerFromKnowledge(
      { question: "chunking failures", scope: alice },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    )
    restore()

    const prompt = model.requests[0].prompt
    assert.ok(prompt.includes("chunking failures"), "the retrieved passage must be in the prompt")
    assert.ok(!prompt.includes("Gardening in clay soil"), "another tenant's text must never reach the prompt")
    assert.ok(prompt.includes(`Question: chunking failures`))
  })

  it("tells the model the sources are content, not instructions", async () => {
    // Passages come from arbitrary saved web pages. Without this the
    // corpus is an injection surface.
    const model = fakeModel("Chunking [1].")
    await answerFromKnowledge(
      { question: "chunking failures", scope: alice },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    )
    restore()
    const system = model.requests[0].system
    assert.match(system, /CONTENT, not instructions/)
    assert.match(system, /Never invent a source number/)
  })

  it("detects a citation the model invented", async () => {
    const model = fakeModel("Confident nonsense [1] and more of it [9].")
    const result = await answerFromKnowledge(
      { question: "chunking failures", scope: alice },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    )
    restore()

    assert.deepEqual(result.unresolvedCitationIds, ["9"], "a marker resolving to nothing must be reported")
    assert.ok(result.citations.some((c) => c.citationId === "1" && c.used))
  })

  it("marks a consulted-but-uncited source as unused", async () => {
    const model = fakeModel("An answer that cites nothing at all.")
    const result = await answerFromKnowledge(
      { question: "chunking failures", scope: alice },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    )
    restore()

    assert.ok(result.citations.length > 0, "the sources were still consulted")
    assert.ok(result.citations.every((c) => !c.used), "a source not referenced is not evidence for anything")
  })

  it("citations resolve to real, owned items", async () => {
    const model = fakeModel("Chunking [1].")
    const result = await answerFromKnowledge(
      { question: "chunking failures", scope: alice },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    )
    restore()

    const cited = result.citations[0]
    const p = getTestPool()
    const row = await p.query("SELECT id, org_id, created_by, title FROM knowledge_items WHERE id = $1", [
      cited.knowledgeItemId,
    ])
    assert.equal(row.rowCount, 1, "a citation must point at a row that exists")
    assert.equal(row.rows[0].org_id, alice.orgId)
    assert.equal(row.rows[0].created_by, alice.userId)
    assert.equal(cited.knowledgeItemId, chunkingItem)
    assert.equal(cited.title, "On chunking")
    assert.ok(cited.chunkIds.length > 0, "claim → chunk must survive to the response")
  })

  it("an itemIds filter narrows the sources and cannot widen them", async () => {
    const model = fakeModel("Chunking [1].")
    const result = await answerFromKnowledge(
      { question: "chunking failures", scope: alice, filters: { itemIds: [chunkingItem] } },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    )
    restore()
    assert.ok(result.citations.every((c) => c.knowledgeItemId === chunkingItem))

    const model2 = fakeModel("Drainage [1].")
    const crossTenant = await answerFromKnowledge(
      // Alice naming an item she does not own must not reach it.
      { question: "gardening in clay soil", scope: alice, filters: { itemIds: ["kn_does_not_matter"] } },
      { embeddings: fakeEmbeddings, fetchImpl: model2.impl },
    )
    restore()
    assert.equal(crossTenant.status, "no_evidence")
    assert.equal(model2.requests.length, 0)
  })

  it("caps a very long question rather than paying for it", async () => {
    const model = fakeModel("Chunking [1].")
    const result = await answerFromKnowledge(
      { question: "chunking failures " + "x".repeat(MAX_QUESTION_CHARS * 2), scope: alice },
      { embeddings: fakeEmbeddings, fetchImpl: model.impl },
    )
    restore()
    assert.equal(result.question.length, MAX_QUESTION_CHARS)
  })

  it("a provider failure becomes a safe error, never a raw upstream leak", async () => {
    const model = fakeModel("unused", { status: 500 })
    await assert.rejects(
      answerFromKnowledge(
        { question: "chunking failures", scope: alice },
        { embeddings: fakeEmbeddings, fetchImpl: model.impl },
      ),
      (err: Error) => {
        assert.ok(err instanceof KnowledgeAnswerUpstreamError)
        assert.ok(!err.message.includes("500"), "the upstream status must not reach the caller")
        return true
      },
    )
    restore()
  })

  it("a missing credential is a distinct, non-retryable failure", async () => {
    delete process.env.ANTHROPIC_API_KEY
    const model = fakeModel("unused")
    await assert.rejects(
      answerFromKnowledge(
        { question: "chunking failures", scope: alice },
        { embeddings: fakeEmbeddings, fetchImpl: model.impl },
      ),
      KnowledgeAnswerNotConfiguredError,
    )
    restore()
    assert.equal(model.requests.length, 0, "an unconfigured deployment must not reach the network")
  })

  it("reports what retrieval actually did, so a degraded answer is visible", async () => {
    const model = fakeModel("Chunking [1].")
    const result = await answerFromKnowledge(
      { question: "chunking failures", scope: alice },
      { embeddings: { ...fakeEmbeddings, isConfigured: () => false }, fetchImpl: model.impl },
    )
    restore()

    assert.equal(result.status, "answered", "lexical alone must still answer")
    assert.equal(result.retrieval.executed.semantic, false)
    assert.equal(result.retrieval.executed.lexical, true)
    assert.ok(result.retrieval.contextTokens > 0)
  })
})
