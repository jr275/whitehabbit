/* ================================================================== *
 * EXPLORER — the viewer's own concepts and their own saved items.
 *
 * The Explorer is the first surface where a concept id arrives FROM
 * THE URL. That makes the authorization question concrete: the id is a
 * filter over rows this scope already proved it owns, and it is never
 * itself permission to see anything. Every test below that touches
 * scope uses a COLLEAGUE — same organization, different person —
 * because that is the attacker an org_id-only predicate silently
 * allows, and a cross-organization test would pass without the
 * created_by half ever being exercised.
 *
 * Real PostgreSQL. No model is called; no credential is needed.
 * ================================================================== */

import { after, before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"

import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import * as repo from "@/lib/knowledge/repo"
import { liveExplorer } from "@/lib/knowledge/understand/live"
import { replaceItemConcepts, upsertConcept } from "@/lib/knowledge/concepts/repo"
import { canonicalConceptName, normalizeConceptName } from "@/lib/knowledge/concepts/normalize"

let owner: TestTenant
/** Same organization, different person. */
let colleague: TestTenant
/** A whole separate organization. */
let stranger: TestTenant

before(async () => {
  await prepareDatabase()
})
beforeEach(async () => {
  owner = await createTenant("exp-owner")
  stranger = await createTenant("exp-stranger")
  const mate = await createTenant("exp-colleague")
  await getTestPool().query("UPDATE memberships SET org_id = $1 WHERE user_id = $2", [owner.orgId, mate.userId])
  colleague = { orgId: owner.orgId, userId: mate.userId }
})
after(closeTestPool)

const scopeOf = (t: TestTenant) => ({ orgId: t.orgId, userId: t.userId })

let seq = 0
async function save(
  t: TestTenant,
  opts: { title?: string; kind?: string; archived?: boolean; author?: string | null; createdAt?: number } = {},
) {
  seq += 1
  const id = `kn_${randomUUID()}`
  const now = opts.createdAt ?? Date.now() + seq
  await getTestPool().query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived,
                                  title, site_name, domain, author, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready',$5,0,FALSE,$6,$7,'Example','example.test',$8,'Body.',$9,$9)`,
    [
      id,
      t.orgId,
      t.userId,
      `https://example.test/${id}`,
      opts.kind ?? "article",
      opts.archived ?? false,
      opts.title ?? `Piece ${seq}`,
      opts.author ?? null,
      now,
    ],
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

/* ================================================================== *
 * REAL DATA
 * ================================================================== */

describe("liveExplorer — the viewer's own library", () => {
  it("returns the owner's items with the fields a row actually renders", async () => {
    const id = await save(owner, { title: "How agents call tools", author: "A. Writer" })
    const { objects } = await liveExplorer(scopeOf(owner))

    assert.equal(objects.length, 1)
    assert.equal(objects[0].id, id)
    assert.equal(objects[0].title, "How agents call tools")
    assert.equal(objects[0].author, "A. Writer")
    assert.equal(objects[0].domain, "example.test")
    assert.ok(objects[0].url?.startsWith("https://example.test/"), "a real row must be openable")
  })

  it("carries the persisted summary, from the same query — no second read", async () => {
    // The summary is on the row the list query already returned. If it
    // ever needed a fetch of its own, this page would issue one request
    // per item, which is the failure the whole module is shaped to
    // avoid.
    const id = await save(owner)
    await repo.setSummary(id, owner.orgId, owner.userId, "Two plain sentences about the piece.")

    const [object] = (await liveExplorer(scopeOf(owner))).objects
    assert.equal(object.summary, "Two plain sentences about the piece.")
  })

  it("leaves summary undefined when the item has none, and substitutes nothing", async () => {
    // Undefined means "no summary yet". The surface must not fall back
    // to the excerpt: a publisher's meta description is the source's
    // own marketing copy, not something Keeply understood, and showing
    // it in the same place would make the two indistinguishable.
    const id = await save(owner)
    await getTestPool().query("UPDATE knowledge_items SET excerpt = $1 WHERE id = $2", ["Publisher blurb.", id])

    const [object] = (await liveExplorer(scopeOf(owner))).objects
    assert.equal(object.summary, undefined)
  })

  it("does not read a COLLEAGUE's summary", async () => {
    const theirs = await save(colleague)
    await repo.setSummary(theirs, colleague.orgId, colleague.userId, "Their private summary.")
    assert.deepEqual((await liveExplorer(scopeOf(owner))).objects, [])
  })

  it("carries NO insight, relevance or revisit count — nothing derives them", async () => {
    // These are measures of the sample library. A live object that
    // carried a plausible value for them would put an invented line
    // under someone's own save, indistinguishable from a real one.
    await save(owner)
    const [object] = (await liveExplorer(scopeOf(owner))).objects

    assert.equal(object.insight, undefined)
    assert.equal(object.relevance, undefined)
    assert.equal(object.revisits, undefined)
  })

  it("attaches each item's real concepts", async () => {
    const a = await save(owner)
    const b = await save(owner)
    await replaceItemConcepts(a, [extracted("Tool Calling"), extracted("Agents")], scopeOf(owner))
    await replaceItemConcepts(b, [extracted("Agents")], scopeOf(owner))

    const { objects, concepts } = await liveExplorer(scopeOf(owner))
    const byId = new Map(objects.map((o) => [o.id, o]))
    assert.equal(byId.get(a)!.conceptIds.length, 2)
    assert.equal(byId.get(b)!.conceptIds.length, 1)

    const agents = concepts.find((c) => c.label === "Agents")
    assert.ok(agents)
    assert.equal(agents!.itemCount, 2, "the count is how many items hold it")
  })

  it("gives live concepts no theme — themes are not derived from anything", async () => {
    const id = await save(owner)
    await replaceItemConcepts(id, [extracted("Retrieval")], scopeOf(owner))
    const { concepts } = await liveExplorer(scopeOf(owner))
    assert.equal(concepts[0].themeId, undefined)
  })

  it("reports the library total, so a page can say it is a page", async () => {
    for (let i = 0; i < 4; i += 1) await save(owner)
    const result = await liveExplorer(scopeOf(owner), 2)
    assert.equal(result.objects.length, 2)
    assert.equal(result.total, 4)
  })

  it("excludes archived items", async () => {
    const live = await save(owner, { title: "Kept" })
    await save(owner, { title: "Gone", archived: true })

    const { objects, total } = await liveExplorer(scopeOf(owner))
    assert.deepEqual(objects.map((o) => o.title), ["Kept"])
    assert.equal(total, 1, "the total must agree with the rows, or the page claims items it will not show")
    assert.equal(objects[0].id, live)
  })

  it("is empty for an owner with nothing saved, and says nothing about concepts", async () => {
    assert.deepEqual(await liveExplorer(scopeOf(owner)), { concepts: [], objects: [], total: 0 })
  })

  it("returns items with NO concepts rather than hiding them", async () => {
    // An unanalyzed library is still a library. Dropping its items
    // would make the Explorer look empty to someone who has saves.
    await save(owner)
    const { objects, concepts } = await liveExplorer(scopeOf(owner))
    assert.equal(objects.length, 1)
    assert.deepEqual(objects[0].conceptIds, [])
    assert.deepEqual(concepts, [])
  })
})

describe("demo and live do not blend", () => {
  it("the sample objects still carry the prototype-only fields", async () => {
    // The live path asserts these are ABSENT. If the sample stopped
    // carrying them too, that assertion would pass for the wrong
    // reason — the fields would simply be gone everywhere, and the
    // separation this whole surface depends on would be untested.
    const { OBJECTS } = await import("@/lib/knowledge/understand/demo-data")
    assert.ok(OBJECTS.length > 0)
    assert.ok(
      OBJECTS.every((o) => o.insight !== undefined && o.relevance !== undefined && o.revisits !== undefined),
      "the prototype keeps its own measures",
    )
    assert.ok(OBJECTS.every((o) => o.url === undefined), "and points at nothing, so it offers no reader link")
    assert.ok(OBJECTS.every((o) => o.summary === undefined), "and carries no summary — it has an insight line instead")
  })
})

/* ================================================================== *
 * FILTERING BY CONCEPT
 * ================================================================== */

describe("liveExplorer — filtering by concept", () => {
  it("an object's conceptIds are what the filter selects on", async () => {
    const withIt = await save(owner)
    const without = await save(owner)
    await replaceItemConcepts(withIt, [extracted("Retrieval")], scopeOf(owner))
    await replaceItemConcepts(without, [extracted("Something Else")], scopeOf(owner))

    const { objects, concepts } = await liveExplorer(scopeOf(owner))
    const retrieval = concepts.find((c) => c.label === "Retrieval")!
    const matching = objects.filter((o) => o.conceptIds.includes(retrieval.id))

    assert.deepEqual(matching.map((o) => o.id), [withIt])
    assert.ok(!matching.some((o) => o.id === without))
  })

  it("a concept id from another owner matches nothing — it is a filter, not a key", async () => {
    // The Explorer takes ?concept=<id> from the URL. Pasting a
    // colleague's concept id must select among MY rows and find
    // nothing, not reach into theirs.
    await save(owner)
    const theirs = await save(colleague)
    await replaceItemConcepts(theirs, [extracted("Private Idea")], scopeOf(colleague))
    const theirConcept = (await liveExplorer(scopeOf(colleague))).concepts[0]
    assert.ok(theirConcept, "precondition: they have one")

    const mine = await liveExplorer(scopeOf(owner))
    assert.ok(!mine.concepts.some((c) => c.id === theirConcept.id), "their concept is not in my rail")
    assert.deepEqual(
      mine.objects.filter((o) => o.conceptIds.includes(theirConcept.id)),
      [],
      "and filtering by it returns nothing of mine, rather than anything of theirs",
    )
  })
})

/* ================================================================== *
 * SCOPE
 * ================================================================== */

describe("liveExplorer — scope", () => {
  it("never returns a COLLEAGUE's items", async () => {
    await save(colleague)
    await save(colleague)
    const { objects, total } = await liveExplorer(scopeOf(owner))
    assert.deepEqual(objects, [])
    assert.equal(total, 0)
  })

  it("never returns a COLLEAGUE's concepts", async () => {
    const theirs = await save(colleague)
    await replaceItemConcepts(theirs, [extracted("Theirs")], scopeOf(colleague))
    assert.deepEqual((await liveExplorer(scopeOf(owner))).concepts, [])
  })

  it("never returns another ORGANIZATION's items or concepts", async () => {
    const theirs = await save(stranger)
    await replaceItemConcepts(theirs, [extracted("Theirs")], scopeOf(stranger))
    assert.deepEqual(await liveExplorer(scopeOf(owner)), { concepts: [], objects: [], total: 0 })
  })

  it("does not attach a colleague's concept association to MY item", async () => {
    // replaceItemConcepts refuses to write across owners, so the row is
    // inserted directly: the question is whether the READ would be
    // fooled by one if it existed.
    const mine = await save(owner)
    const theirConcept = await upsertConcept(
      { canonicalName: "Theirs", normalizedName: normalizeConceptName("Theirs"), type: "TOPIC" },
      scopeOf(colleague),
    )
    await getTestPool().query(
      `INSERT INTO knowledge_item_concepts (id, item_id, concept_id, org_id, created_by, source, confidence, evidence, created_at)
       VALUES ($1,$2,$3,$4,$5,'llm',0.9,'[]'::jsonb,$6)`,
      [`kic_${randomUUID()}`, mine, theirConcept.id, colleague.orgId, colleague.userId, Date.now()],
    )

    const { objects } = await liveExplorer(scopeOf(owner))
    assert.deepEqual(objects[0].conceptIds, [], "their association is not part of what my item is about")
  })

  it("shows each person their own library in a shared organization", async () => {
    await save(owner, { title: "Mine" })
    await save(colleague, { title: "Theirs" })

    assert.deepEqual((await liveExplorer(scopeOf(owner))).objects.map((o) => o.title), ["Mine"])
    assert.deepEqual((await liveExplorer(scopeOf(colleague))).objects.map((o) => o.title), ["Theirs"])
  })
})

/* ================================================================== *
 * THE PAGE
 * ================================================================== */

describe("app/knowledge/page.tsx — the ?concept= parameter", () => {
  const source = readFileSync("app/knowledge/page.tsx", "utf8")

  it("validates the parameter against the viewer's OWN concepts before using it", () => {
    assert.match(source, /explorer\?\.concepts\.some\(\(c\) => c\.id === raw\)/)
  })

  it("passes the caller's own scope to the explorer, never a widened one", () => {
    assert.match(source, /const scope = \{ orgId: organizationId, userId \}/)
    assert.match(source, /liveExplorer\(scope\)/)
  })

  it("renders a failed library read as a failure, not as an empty one", () => {
    assert.match(source, /explorerError/)
    assert.match(source, /\.catch\(/)
  })
})
