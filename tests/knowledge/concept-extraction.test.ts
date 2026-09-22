/* ================================================================== *
 * CONCEPT EXTRACTION — the model's output, and every way it goes wrong.
 *
 * Every call goes through an injected callLlm. No model is contacted,
 * no credential is needed, and nothing here costs anything.
 *
 * What is actually under test is the boundary: the extractor is the one
 * place where text a model wrote becomes rows in a database, so each
 * case below is a shape a real model eventually produces — a fabricated
 * chunk id, a confidence of 4, prose instead of JSON, a provider that
 * is down — and the assertion is always the same in spirit: NOTHING
 * INVALID REACHES THE TABLE.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"

import { closeTestPool, createTenant, prepareDatabase, type TestTenant } from "../helpers/db"
import * as repo from "@/lib/knowledge/repo"
import { extractConceptsForItem } from "@/lib/knowledge/concepts/extract"
import { getConceptsForItem } from "@/lib/knowledge/concepts/repo"
import type { LlmResult } from "@/lib/ai/llm/types"

let tenant: TestTenant
let other: TestTenant

before(async () => {
  await prepareDatabase()
  tenant = await createTenant("ext-owner")
  other = await createTenant("ext-other")
})
after(async () => {
  await closeTestPool()
})

function scopeOf(t: TestTenant) {
  return { orgId: t.orgId, userId: t.userId }
}

let seq = 0

/** An item with real chunks — extraction reads what the indexer wrote,
 *  never the page again. */
async function indexedItem(t: TestTenant, texts: string[]) {
  seq += 1
  const item = await repo.insertSavedItem({
    orgId: t.orgId,
    userId: t.userId,
    url: `https://example.test/ext-${seq}`,
    normalizedUrl: `example.test/ext-${seq}`,
    domain: "example.test",
  })
  await repo.replaceChunks(
    item.id,
    t.orgId,
    t.userId,
    `hash-${seq}`,
    texts.map((text, i) => ({
      id: `chunk_${item.id}_${i}`,
      ordinal: i,
      text,
      charStart: 0,
      charEnd: text.length,
      tokenEstimate: Math.ceil(text.length / 4),
      contentHash: `hash-${seq}-${i}`,
    })),
  )
  const chunks = await repo.getChunks(item.id, t.orgId, t.userId)
  return { item, chunkIds: chunks.map((c) => c.id) }
}

/** A stub provider that records the prompt it was given. */
function stubLlm(text: string) {
  const calls: { system: string; prompt: string }[] = []
  const impl = (async (input: { system: string; prompt: string }) => {
    calls.push({ system: input.system, prompt: input.prompt })
    return {
      ok: true,
      output: { text, model: "fixture", inputTokens: 10, outputTokens: 5, provider: "fixture" },
      durationMs: 1,
    } satisfies LlmResult
  }) as never
  return { impl, calls }
}

function failingLlm(reason: "not_configured" | "provider_error", message: string) {
  return (async () => ({ ok: false, reason, message, durationMs: 1 }) satisfies LlmResult) as never
}

/* ================================================================== *
 * THE HAPPY PATH
 * ================================================================== */

describe("extraction", () => {
  it("persists validated concepts with their provenance", async () => {
    const { item, chunkIds } = await indexedItem(tenant, [
      "Agents call tools through a protocol layer.",
      "Memory is what an agent carries between turns.",
    ])
    const { impl } = stubLlm(
      JSON.stringify({
        concepts: [
          { name: "Tool Calling", type: "TECHNOLOGY", confidence: 0.93, evidence: [{ chunkId: chunkIds[0] }] },
          { name: "Agent Memory", type: "CONCEPT", confidence: 0.81, evidence: [{ chunkId: chunkIds[1] }] },
        ],
      }),
    )

    const outcome = await extractConceptsForItem(item.id, scopeOf(tenant), { callLlm: impl })
    assert.equal(outcome.status, "extracted")
    assert.equal(outcome.written, 2)

    const stored = await getConceptsForItem(item.id, scopeOf(tenant))
    assert.deepEqual(stored.map((c) => c.canonical_name), ["Tool Calling", "Agent Memory"])
    assert.equal(stored[0].source, "llm", "provenance must say a model produced this")
    assert.deepEqual(stored[0].evidence, [{ chunkId: chunkIds[0] }], "evidence must point at a real passage")
  })

  it("sends the model the passages and their ids, and demands them back", async () => {
    const { item, chunkIds } = await indexedItem(tenant, ["A passage about protocols."])
    const { impl, calls } = stubLlm(JSON.stringify({ concepts: [] }))
    await extractConceptsForItem(item.id, scopeOf(tenant), { callLlm: impl })

    assert.equal(calls.length, 1)
    assert.ok(calls[0].prompt.includes(chunkIds[0]), "the chunk id must be in the prompt or evidence cannot be checked")
    assert.ok(calls[0].prompt.includes("A passage about protocols."))
    assert.match(calls[0].system, /Never invent an id/)
  })

  it("does not re-fetch or re-chunk — it reads what already exists", async () => {
    // If extraction created its own chunks, the count would change.
    const { item } = await indexedItem(tenant, ["One.", "Two.", "Three."])
    const before = (await repo.getChunks(item.id, tenant.orgId, tenant.userId)).length
    const { impl } = stubLlm(JSON.stringify({ concepts: [] }))
    await extractConceptsForItem(item.id, scopeOf(tenant), { callLlm: impl })
    assert.equal((await repo.getChunks(item.id, tenant.orgId, tenant.userId)).length, before)
  })
})

/* ================================================================== *
 * MALFORMED MODEL OUTPUT
 * ================================================================== */

describe("bad model output", () => {
  it("writes nothing when the model returns prose instead of JSON", async () => {
    const { item } = await indexedItem(tenant, ["Some content."])
    const { impl } = stubLlm("I think this article is mostly about AI agents!")

    const outcome = await extractConceptsForItem(item.id, scopeOf(tenant), { callLlm: impl })
    assert.equal(outcome.status, "failed")
    assert.match(outcome.reason!, /did not return JSON/)
    assert.deepEqual(await getConceptsForItem(item.id, scopeOf(tenant)), [])
  })

  it("writes nothing when the envelope is the wrong shape", async () => {
    const { item } = await indexedItem(tenant, ["Some content."])
    for (const body of ['{"concepts":"none"}', "[]", "null", '{"items":[]}']) {
      const { impl } = stubLlm(body)
      const outcome = await extractConceptsForItem(item.id, scopeOf(tenant), { callLlm: impl })
      assert.equal(outcome.status, "failed", `accepted ${body}`)
      assert.deepEqual(await getConceptsForItem(item.id, scopeOf(tenant)), [])
    }
  })

  it("DROPS a fabricated citation and keeps the sound one", async () => {
    // The case this whole boundary exists for. A model citing a chunk
    // id it was never given is inventing evidence; that concept must
    // not survive, and the valid one beside it must.
    const { item, chunkIds } = await indexedItem(tenant, ["Real passage."])
    const { impl } = stubLlm(
      JSON.stringify({
        concepts: [
          { name: "Invented", type: "TOPIC", confidence: 0.99, evidence: [{ chunkId: "chunk_from_nowhere" }] },
          { name: "Grounded", type: "TOPIC", confidence: 0.7, evidence: [{ chunkId: chunkIds[0] }] },
        ],
      }),
    )

    const outcome = await extractConceptsForItem(item.id, scopeOf(tenant), { callLlm: impl })
    assert.equal(outcome.status, "extracted")
    assert.equal(outcome.written, 1)
    assert.equal(outcome.rejected, 1)

    const stored = await getConceptsForItem(item.id, scopeOf(tenant))
    assert.deepEqual(stored.map((c) => c.canonical_name), ["Grounded"])
  })

  it("drops out-of-range confidence and invented types", async () => {
    const { item, chunkIds } = await indexedItem(tenant, ["Content."])
    const { impl } = stubLlm(
      JSON.stringify({
        concepts: [
          { name: "TooSure", type: "TOPIC", confidence: 4, evidence: [{ chunkId: chunkIds[0] }] },
          { name: "MadeUpType", type: "THEME", confidence: 0.8, evidence: [{ chunkId: chunkIds[0] }] },
          { name: "Fine", type: "TOPIC", confidence: 0.8, evidence: [{ chunkId: chunkIds[0] }] },
        ],
      }),
    )

    const outcome = await extractConceptsForItem(item.id, scopeOf(tenant), { callLlm: impl })
    assert.equal(outcome.written, 1)
    assert.equal(outcome.rejected, 2)
    assert.deepEqual((await getConceptsForItem(item.id, scopeOf(tenant))).map((c) => c.canonical_name), ["Fine"])
  })

  it("accepts an empty result rather than forcing concepts onto a thin document", async () => {
    const { item } = await indexedItem(tenant, ["Hello."])
    const { impl } = stubLlm(JSON.stringify({ concepts: [] }))
    const outcome = await extractConceptsForItem(item.id, scopeOf(tenant), { callLlm: impl })
    assert.equal(outcome.status, "extracted")
    assert.equal(outcome.written, 0)
  })
})

/* ================================================================== *
 * PROVIDER FAILURE
 * ================================================================== */

describe("provider failure", () => {
  it("reports a missing provider as configuration, not as a broken document", async () => {
    // A backfill across a library with no credential must not look like
    // a thousand corrupt documents.
    const { item } = await indexedItem(tenant, ["Content."])
    const outcome = await extractConceptsForItem(item.id, scopeOf(tenant), {
      callLlm: failingLlm("not_configured", "Configure GEMINI_API_KEY."),
    })
    assert.equal(outcome.status, "failed")
    assert.match(outcome.reason!, /no LLM provider configured/)
    assert.deepEqual(await getConceptsForItem(item.id, scopeOf(tenant)), [])
  })

  it("reports a provider error with its real reason", async () => {
    const { item } = await indexedItem(tenant, ["Content."])
    const outcome = await extractConceptsForItem(item.id, scopeOf(tenant), {
      callLlm: failingLlm("provider_error", "upstream timed out"),
    })
    assert.equal(outcome.status, "failed")
    assert.match(outcome.reason!, /timed out/)
  })

  it("leaves a previous extraction intact when a later one fails", async () => {
    // Extraction replaces. If a failed run reached the write path, an
    // item that was understood yesterday would silently become
    // understood-about-nothing today.
    const { item, chunkIds } = await indexedItem(tenant, ["Content."])
    const { impl } = stubLlm(
      JSON.stringify({
        concepts: [{ name: "Established", type: "TOPIC", confidence: 0.9, evidence: [{ chunkId: chunkIds[0] }] }],
      }),
    )
    await extractConceptsForItem(item.id, scopeOf(tenant), { callLlm: impl })

    await extractConceptsForItem(item.id, scopeOf(tenant), { callLlm: failingLlm("provider_error", "down") })

    const stored = await getConceptsForItem(item.id, scopeOf(tenant))
    assert.deepEqual(stored.map((c) => c.canonical_name), ["Established"])
  })
})

/* ================================================================== *
 * SCOPE
 * ================================================================== */

describe("extraction scope", () => {
  it("skips an item that has not been indexed", async () => {
    const bare = await repo.insertSavedItem({
      orgId: tenant.orgId,
      userId: tenant.userId,
      url: "https://example.test/unindexed",
      normalizedUrl: "example.test/unindexed",
      domain: "example.test",
    })
    const { impl, calls } = stubLlm(JSON.stringify({ concepts: [] }))
    const outcome = await extractConceptsForItem(bare.id, scopeOf(tenant), { callLlm: impl })

    assert.equal(outcome.status, "skipped")
    assert.equal(calls.length, 0, "no model call may be spent on an item with no passages")
  })

  it("cannot be pointed at another owner's item", async () => {
    const { item } = await indexedItem(tenant, ["Private content."])
    const { impl, calls } = stubLlm(JSON.stringify({ concepts: [] }))

    const outcome = await extractConceptsForItem(item.id, scopeOf(other), { callLlm: impl })
    assert.equal(outcome.status, "skipped", "another owner's item must look absent")
    assert.equal(calls.length, 0, "and must not reach the model at all")
    assert.deepEqual(await getConceptsForItem(item.id, scopeOf(tenant)), [], "the owner's concepts are untouched")
  })
})
