/* ================================================================== *
 * KNOWLEDGE CONCEPTS — normalization, the validation gate, and the
 * ownership rule.
 *
 * Three things are being pinned here, and they fail in different ways:
 *
 *  1. NORMALIZATION IS THE DEDUPLICATION RULE. The unique index in
 *     migration 0010 is built on its output, so a change that makes it
 *     non-deterministic does not produce duplicate concepts — it
 *     produces duplicate-key errors in production. These tests are the
 *     cheap place to find that out.
 *  2. THE MODEL NEVER WRITES. Every rejection case below is output a
 *     real model produces sooner or later: a confidence of 4, a type
 *     it invented, evidence citing a passage it was never shown.
 *  3. A CONCEPT BELONGS TO SOMEONE. Cross-owner reads and writes are
 *     exercised against a real database, not asserted from the SQL.
 *
 * Real PostgreSQL. No model is called; no credential is needed.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"

import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import * as repo from "@/lib/knowledge/repo"
import {
  getConcept,
  getConceptsForItem,
  getConceptsForItems,
  listConcepts,
  replaceItemConcepts,
  upsertConcept,
} from "@/lib/knowledge/concepts/repo"
import { explainRelation, findRelatedItems } from "@/lib/knowledge/concepts/related"
import {
  MAX_CONCEPTS_PER_ITEM,
  MIN_CONFIDENCE,
  parseExtraction,
  parseExtractedConcept,
  parseExtractionJson,
} from "@/lib/knowledge/concepts/contract"
import { canonicalConceptName, dedupeByNormalizedName, normalizeConceptName } from "@/lib/knowledge/concepts/normalize"

/* ================================================================== *
 * 1. NORMALIZATION — no database needed
 * ================================================================== */

describe("concept normalization", () => {
  it("collapses the spellings that would otherwise become four concepts", () => {
    const forms = ["AI", "A.I.", "a.i.", "  AI  "]
    const keys = new Set(forms.map(normalizeConceptName))
    assert.equal(keys.size, 1, `expected one key, got ${[...keys].join(" | ")}`)
    assert.equal([...keys][0], "ai")
  })

  it("treats separators as separators and apostrophes as part of the word", () => {
    assert.equal(normalizeConceptName("Artificial-Intelligence"), "artificial intelligence")
    assert.equal(normalizeConceptName("Artificial   Intelligence"), "artificial intelligence")
    assert.equal(normalizeConceptName("artificial_intelligence"), "artificial intelligence")
    assert.equal(normalizeConceptName("Human-in-the-loop"), "human in the loop")
    // Splitting this would produce "o" and "reilly", which is not a name.
    assert.equal(normalizeConceptName("O'Reilly"), "o'reilly")
  })

  it("folds accents and unicode forms so one word stays one concept", () => {
    assert.equal(normalizeConceptName("Café"), "cafe")
    // Composed vs decomposed é — visually identical, different bytes.
    assert.equal(normalizeConceptName("Café"), normalizeConceptName("Café"))
    assert.equal(normalizeConceptName("ＭＣＰ"), "mcp", "full-width forms must fold")
  })

  it("is idempotent and deterministic", () => {
    for (const input of ["AI Agents", "  MCP  ", "Tool-Calling", "O'Reilly", "Café"]) {
      const once = normalizeConceptName(input)
      assert.equal(normalizeConceptName(once), once, `not idempotent for ${input}`)
      assert.equal(normalizeConceptName(input), once, "not deterministic")
    }
  })

  it("returns empty for anything that is punctuation rather than a subject", () => {
    for (const junk of ["", "   ", "...", "—", "!!!", " "]) {
      assert.equal(normalizeConceptName(junk), "", `accepted ${JSON.stringify(junk)}`)
    }
  })

  it("does NOT guess that an acronym and its expansion are the same thing", () => {
    // Deliberate. Merging these is a semantic judgement, and a wrong
    // merge is unrecoverable — two subjects become one with no record.
    assert.notEqual(normalizeConceptName("AI"), normalizeConceptName("Artificial Intelligence"))
  })

  it("keeps the author's capitalisation for display", () => {
    assert.equal(canonicalConceptName("  MCP  "), "MCP", "an acronym must not become Mcp")
    assert.equal(canonicalConceptName("AI   Agents"), "AI Agents")
    assert.equal(canonicalConceptName("x".repeat(500)).length, 120, "a paragraph must not reach a chip")
  })

  it("dedupes a batch, keeping the stronger claim and both evidences", () => {
    const merged = dedupeByNormalizedName(
      [
        { name: "AI Agents", confidence: 0.6, evidence: ["a"] },
        { name: "ai  agents", confidence: 0.9, evidence: ["b"] },
        { name: "MCP", confidence: 0.8, evidence: ["c"] },
      ],
      (win, lose) => ({ ...win, evidence: [...win.evidence, ...lose.evidence] }),
    )

    assert.equal(merged.length, 2)
    const agents = merged.find((m) => normalizeConceptName(m.name) === "ai agents")!
    assert.equal(agents.confidence, 0.9, "the stronger claim wins")
    assert.deepEqual(agents.evidence.sort(), ["a", "b"], "the weaker claim's evidence is not lost")
  })
})

/* ================================================================== *
 * 2. THE VALIDATION GATE
 * ================================================================== */

describe("the extraction contract", () => {
  const known = new Set(["chunk_1", "chunk_2"])
  const good = { name: "AI Agents", type: "TOPIC", confidence: 0.9, evidence: [{ chunkId: "chunk_1" }] }

  it("accepts a well-formed concept and derives both names", () => {
    const c = parseExtractedConcept(good, known)
    assert.equal(c.canonicalName, "AI Agents")
    assert.equal(c.normalizedName, "ai agents")
    assert.equal(c.type, "TOPIC")
    assert.equal(c.confidence, 0.9)
  })

  it("rejects a confidence outside 0..1", () => {
    for (const confidence of [4, -0.1, 1.01, Number.NaN, Number.POSITIVE_INFINITY, "0.9"]) {
      assert.throws(
        () => parseExtractedConcept({ ...good, confidence }, known),
        /confidence/,
        `accepted ${JSON.stringify(confidence)}`,
      )
    }
  })

  it("rejects a concept type the model invented", () => {
    for (const type of ["THEME", "topic", "", null, 7]) {
      assert.throws(() => parseExtractedConcept({ ...good, type }, known), /type/, `accepted ${JSON.stringify(type)}`)
    }
  })

  it("rejects a name that is punctuation", () => {
    for (const name of ["", "   ", "...", "—"]) {
      assert.throws(() => parseExtractedConcept({ ...good, name }, known), /name/, `accepted ${JSON.stringify(name)}`)
    }
  })

  it("rejects evidence citing a passage the model was never shown", () => {
    // The fabricated-citation case, and the one that would otherwise
    // let a JSON field reference another document entirely.
    assert.throws(
      () => parseExtractedConcept({ ...good, evidence: [{ chunkId: "chunk_from_nowhere" }] }, known),
      /not among the passages provided/,
    )
  })

  it("rejects a concept with no evidence at all", () => {
    assert.throws(() => parseExtractedConcept({ ...good, evidence: [] }, known), /no supporting passage/)
  })

  it("rejects malformed evidence entries", () => {
    for (const evidence of [[{}], ["chunk_1"], [{ chunk: "chunk_1" }], "chunk_1", null]) {
      assert.throws(() => parseExtractedConcept({ ...good, evidence }, known), /evidence/)
    }
  })

  it("deduplicates repeated evidence rather than storing it twice", () => {
    const c = parseExtractedConcept(
      { ...good, evidence: [{ chunkId: "chunk_1" }, { chunkId: "chunk_1" }, { chunkId: "chunk_2" }] },
      known,
    )
    assert.deepEqual(c.evidence.map((e) => e.chunkId), ["chunk_1", "chunk_2"])
  })

  it("drops one bad concept without failing the batch, and says why", () => {
    const { concepts, rejected } = parseExtraction(
      {
        concepts: [
          good,
          { ...good, name: "Broken", confidence: 9 },
          { ...good, name: "Invented", evidence: [{ chunkId: "nope" }] },
        ],
      },
      known,
    )
    assert.equal(concepts.length, 1)
    assert.equal(rejected.length, 2)
    assert.ok(rejected.some((r) => /confidence/.test(r.reason)))
    assert.ok(rejected.some((r) => /not among the passages/.test(r.reason)))
  })

  it("drops low-confidence concepts rather than storing a weak fact", () => {
    const { concepts, rejected } = parseExtraction(
      { concepts: [{ ...good, confidence: MIN_CONFIDENCE - 0.01 }] },
      known,
    )
    assert.equal(concepts.length, 0)
    assert.match(rejected[0].reason, /below/)
  })

  it("caps per item, keeping the strongest rather than the first", () => {
    const many = Array.from({ length: MAX_CONCEPTS_PER_ITEM + 5 }, (_, i) => ({
      ...good,
      name: `Concept ${i}`,
      confidence: 0.4 + i / 100,
    }))
    const { concepts } = parseExtraction({ concepts: many }, known)
    assert.equal(concepts.length, MAX_CONCEPTS_PER_ITEM)
    assert.equal(concepts[0].name, `Concept ${many.length - 1}`, "highest confidence must survive")
  })

  it("throws on a malformed envelope — there is nothing to partially trust", () => {
    for (const body of [null, "text", [], {}, { concepts: "none" }]) {
      assert.throws(() => parseExtraction(body, known), /body|concepts/)
    }
  })

  it("survives the markdown fence models wrap JSON in", () => {
    assert.deepEqual(parseExtractionJson('```json\n{"concepts":[]}\n```'), { concepts: [] })
    assert.equal(parseExtractionJson("not json at all"), null)
  })
})

/* ================================================================== *
 * 3. PERSISTENCE AND OWNERSHIP — real database
 * ================================================================== */

let owner: TestTenant
let otherOrg: TestTenant
let sameOrgOther: TestTenant

before(async () => {
  await prepareDatabase()
  owner = await createTenant("con-owner")
  otherOrg = await createTenant("con-otherorg")
  const colleague = await createTenant("con-colleague")
  await getTestPool().query("UPDATE memberships SET org_id = $1 WHERE user_id = $2", [owner.orgId, colleague.userId])
  sameOrgOther = { orgId: owner.orgId, userId: colleague.userId }
})
after(async () => {
  await closeTestPool()
})

function scopeOf(t: TestTenant) {
  return { orgId: t.orgId, userId: t.userId }
}

let seq = 0
async function itemFor(t: TestTenant, slug: string) {
  seq += 1
  return repo.insertSavedItem({
    orgId: t.orgId,
    userId: t.userId,
    url: `https://example.test/${slug}-${seq}`,
    normalizedUrl: `example.test/${slug}-${seq}`,
    domain: "example.test",
  })
}

function extracted(name: string, confidence = 0.9, chunkId = "chunk_1") {
  return {
    name,
    canonicalName: canonicalConceptName(name),
    normalizedName: normalizeConceptName(name),
    type: "TOPIC" as const,
    confidence,
    evidence: [{ chunkId }],
    source: "llm" as const,
  }
}

describe("concept persistence", () => {
  it("creates a concept once and returns the same row for an equivalent name", async () => {
    const a = await upsertConcept(
      { canonicalName: "AI Agents", normalizedName: normalizeConceptName("AI Agents"), type: "TOPIC" },
      scopeOf(owner),
    )
    const b = await upsertConcept(
      { canonicalName: "ai  agents", normalizedName: normalizeConceptName("ai  agents"), type: "TOPIC" },
      scopeOf(owner),
    )
    assert.equal(b.id, a.id, "an equivalent name must not mint a second concept")
    assert.equal(b.canonical_name, "AI Agents", "the first spelling seen is kept for display")
  })

  it("gives a DIFFERENT owner their own concept row for the same name", async () => {
    const mine = await upsertConcept(
      { canonicalName: "MCP", normalizedName: normalizeConceptName("MCP"), type: "TECHNOLOGY" },
      scopeOf(owner),
    )
    const theirs = await upsertConcept(
      { canonicalName: "MCP", normalizedName: normalizeConceptName("MCP"), type: "TECHNOLOGY" },
      scopeOf(otherOrg),
    )
    assert.notEqual(theirs.id, mine.id, "concepts must not be shared across tenants")
  })

  it("associates concepts with an item, with provenance intact", async () => {
    const item = await itemFor(owner, "assoc")
    const { written } = await replaceItemConcepts(
      item.id,
      [extracted("Tool Calling", 0.92), extracted("Memory", 0.71, "chunk_2")],
      scopeOf(owner),
    )
    assert.equal(written, 2)

    const got = await getConceptsForItem(item.id, scopeOf(owner))
    assert.deepEqual(got.map((c) => c.canonical_name), ["Tool Calling", "Memory"], "strongest first")
    assert.equal(got[0].confidence, 0.92)
    assert.equal(got[0].source, "llm")
    assert.deepEqual(got[0].evidence, [{ chunkId: "chunk_1" }], "provenance must survive the round trip")
  })

  it("re-extraction replaces rather than accumulates", async () => {
    const item = await itemFor(owner, "reextract")
    await replaceItemConcepts(item.id, [extracted("Old One"), extracted("Kept")], scopeOf(owner))
    await replaceItemConcepts(item.id, [extracted("Kept", 0.5), extracted("New One")], scopeOf(owner))

    const got = await getConceptsForItem(item.id, scopeOf(owner))
    assert.deepEqual(got.map((c) => c.canonical_name).sort(), ["Kept", "New One"])
    assert.equal(got.find((c) => c.canonical_name === "Kept")!.confidence, 0.5, "confidence must be updated")
  })

  it("counts items per concept without an N+1", async () => {
    const t = await createTenant("con-count")
    const a = await itemFor(t, "c1")
    const b = await itemFor(t, "c2")
    await replaceItemConcepts(a.id, [extracted("Shared")], scopeOf(t))
    await replaceItemConcepts(b.id, [extracted("Shared")], scopeOf(t))

    const list = await listConcepts(scopeOf(t))
    assert.equal(list.length, 1)
    assert.equal(list[0].item_count, 2)
  })

  it("batches concepts for many items in one call", async () => {
    const t = await createTenant("con-batch")
    const a = await itemFor(t, "b1")
    const b = await itemFor(t, "b2")
    await replaceItemConcepts(a.id, [extracted("Alpha")], scopeOf(t))
    await replaceItemConcepts(b.id, [extracted("Beta")], scopeOf(t))

    const map = await getConceptsForItems([a.id, b.id], scopeOf(t))
    assert.deepEqual(map.get(a.id)!.map((c) => c.canonical_name), ["Alpha"])
    assert.deepEqual(map.get(b.id)!.map((c) => c.canonical_name), ["Beta"])
  })
})

/* ================================================================== *
 * 4. CROSS-OWNER — every operation the directive names
 * ================================================================== */

describe("cross-owner isolation", () => {
  function attackers() {
    return [
      { label: "another organization", scope: scopeOf(otherOrg) },
      { label: "another user in the same organization", scope: scopeOf(sameOrgOther) },
    ]
  }

  it("nobody else can READ a concept, even holding its real id", async () => {
    const concept = await upsertConcept(
      { canonicalName: "Private Subject", normalizedName: "private subject", type: "TOPIC" },
      scopeOf(owner),
    )
    assert.ok(await getConcept(concept.id, scopeOf(owner)))
    for (const { label, scope } of attackers()) {
      assert.equal(await getConcept(concept.id, scope), null, `leaked to ${label}`)
    }
  })

  it("nobody else's concepts appear in a listing", async () => {
    const t = await createTenant("con-listiso")
    const item = await itemFor(t, "listiso")
    await replaceItemConcepts(item.id, [extracted("Only Theirs")], scopeOf(t))

    for (const { label, scope } of [...attackers(), { label: "the owner", scope: scopeOf(owner) }]) {
      const list = await listConcepts(scope)
      assert.ok(!list.some((c) => c.canonical_name === "Only Theirs"), `listed for ${label}`)
    }
  })

  it("nobody else can ASSOCIATE a concept with another owner's item", async () => {
    // The write an attacker would aim at: their session, the victim's
    // item id. Ownership is checked on the row being written.
    const victimItem = await itemFor(owner, "victim")
    for (const { label, scope } of attackers()) {
      const { written } = await replaceItemConcepts(victimItem.id, [extracted("Injected")], scope)
      assert.equal(written, 0, `${label} wrote an association`)
    }
    assert.deepEqual(await getConceptsForItem(victimItem.id, scopeOf(owner)), [])
  })

  it("nobody else can DESTROY another owner's associations", async () => {
    // replaceItemConcepts deletes before it writes. If the ownership
    // check ran after the delete, an attacker would not need to write
    // anything to erase someone's concepts.
    const item = await itemFor(owner, "destroy")
    await replaceItemConcepts(item.id, [extracted("Must Survive")], scopeOf(owner))

    for (const { label, scope } of attackers()) {
      await replaceItemConcepts(item.id, [], scope)
      const still = await getConceptsForItem(item.id, scopeOf(owner))
      assert.equal(still.length, 1, `${label} erased the owner's concepts`)
    }
  })

  it("nobody else can read the concepts OF another owner's item", async () => {
    const item = await itemFor(owner, "readiso")
    await replaceItemConcepts(item.id, [extracted("Confidential Topic")], scopeOf(owner))
    for (const { label, scope } of attackers()) {
      assert.deepEqual(await getConceptsForItem(item.id, scope), [], `leaked to ${label}`)
      const batch = await getConceptsForItems([item.id], scope)
      assert.deepEqual(batch.get(item.id) ?? [], [], `batched leak to ${label}`)
    }
  })

  it("a mismatched org/user pair is refused even when each half is real", async () => {
    const concept = await upsertConcept(
      { canonicalName: "Pair Check", normalizedName: "pair check", type: "TOPIC" },
      scopeOf(owner),
    )
    assert.equal(await getConcept(concept.id, { orgId: owner.orgId, userId: otherOrg.userId }), null)
    assert.equal(await getConcept(concept.id, { orgId: otherOrg.orgId, userId: owner.userId }), null)
  })
})

/* ================================================================== *
 * 5. RELATED KNOWLEDGE — deterministic, explainable, scoped
 * ================================================================== */

describe("related knowledge", () => {
  it("relates two items by their shared concepts, and can say which", async () => {
    const t = await createTenant("rel-basic")
    const a = await itemFor(t, "rel-a")
    const b = await itemFor(t, "rel-b")
    const c = await itemFor(t, "rel-c")

    await replaceItemConcepts(a.id, [extracted("AI Agents"), extracted("LLM"), extracted("Automation")], scopeOf(t))
    await replaceItemConcepts(b.id, [extracted("AI Agents"), extracted("LLM"), extracted("Payments")], scopeOf(t))
    await replaceItemConcepts(c.id, [extracted("Gardening")], scopeOf(t))

    const related = await findRelatedItems(a.id, scopeOf(t))
    assert.equal(related.length, 1, "only the item that shares concepts is related")
    assert.equal(related[0].itemId, b.id)
    assert.deepEqual(related[0].shared.map((s) => s.name).sort(), ["AI Agents", "LLM"])
    assert.ok(!related.some((r) => r.itemId === a.id), "an item is never related to itself")

    assert.equal(explainRelation(related[0]), "Both discuss AI Agents and LLM.")
  })

  it("is deterministic — the same library gives the same answer", async () => {
    const t = await createTenant("rel-det")
    const a = await itemFor(t, "det-a")
    const b = await itemFor(t, "det-b")
    await replaceItemConcepts(a.id, [extracted("Shared One"), extracted("Shared Two")], scopeOf(t))
    await replaceItemConcepts(b.id, [extracted("Shared One"), extracted("Shared Two")], scopeOf(t))

    const first = await findRelatedItems(a.id, scopeOf(t))
    const second = await findRelatedItems(a.id, scopeOf(t))
    assert.deepEqual(first, second)
  })

  it("ranks a more distinctive shared concept above a ubiquitous one", async () => {
    // Everything is about "AI", so "AI" explains nothing; the item
    // sharing the rare concept must win even at equal confidence.
    const t = await createTenant("rel-idf")
    const subject = await itemFor(t, "idf-subject")
    const common = await itemFor(t, "idf-common")
    const rare = await itemFor(t, "idf-rare")
    const filler = await Promise.all([itemFor(t, "f1"), itemFor(t, "f2"), itemFor(t, "f3"), itemFor(t, "f4")])

    await replaceItemConcepts(subject.id, [extracted("AI"), extracted("Rare Thing")], scopeOf(t))
    await replaceItemConcepts(common.id, [extracted("AI")], scopeOf(t))
    await replaceItemConcepts(rare.id, [extracted("Rare Thing")], scopeOf(t))
    for (const f of filler) await replaceItemConcepts(f.id, [extracted("AI")], scopeOf(t))

    const related = await findRelatedItems(subject.id, scopeOf(t))
    assert.equal(related[0].itemId, rare.id, "the distinctive shared concept must rank higher")
  })

  it("uses the weaker end of a shared concept as its strength", async () => {
    const t = await createTenant("rel-min")
    const a = await itemFor(t, "min-a")
    const b = await itemFor(t, "min-b")
    await replaceItemConcepts(a.id, [extracted("Link", 0.95)], scopeOf(t))
    await replaceItemConcepts(b.id, [extracted("Link", 0.4)], scopeOf(t))

    const related = await findRelatedItems(a.id, scopeOf(t))
    assert.equal(related[0].shared[0].strength, 0.4, "a link is only as strong as its weaker end")
  })

  it("never relates across owners, even on an identically named concept", async () => {
    const mine = await itemFor(owner, "iso-mine")
    const theirs = await itemFor(otherOrg, "iso-theirs")
    await replaceItemConcepts(mine.id, [extracted("Same Name")], scopeOf(owner))
    await replaceItemConcepts(theirs.id, [extracted("Same Name")], scopeOf(otherOrg))

    const related = await findRelatedItems(mine.id, scopeOf(owner))
    assert.ok(!related.some((r) => r.itemId === theirs.id), "cross-tenant relation leaked")
  })

  it("returns nothing rather than failing for an item with no concepts", async () => {
    const t = await createTenant("rel-empty")
    const lonely = await itemFor(t, "lonely")
    assert.deepEqual(await findRelatedItems(lonely.id, scopeOf(t)), [])
  })

  it("excludes archived items from relatedness", async () => {
    const t = await createTenant("rel-arch")
    const a = await itemFor(t, "arch-a")
    const b = await itemFor(t, "arch-b")
    await replaceItemConcepts(a.id, [extracted("Topic")], scopeOf(t))
    await replaceItemConcepts(b.id, [extracted("Topic")], scopeOf(t))
    await repo.setArchived(b.id, t.orgId, t.userId, true)

    assert.deepEqual(await findRelatedItems(a.id, scopeOf(t)), [])
  })
})
