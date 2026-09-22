/* ================================================================== *
 * CONCEPT NAVIGATION — the loop item → idea → other items.
 *
 * Concepts have been extracted, stored, scored and displayed for
 * several commits, and every place that displayed one displayed it as
 * text. The single real relationship in the product was a dead end at
 * exactly the point a reader would follow it.
 *
 * What these tests pin is small and load-bearing: the URL is built in
 * ONE place, from the PERSISTED id, and the id is not authorization.
 * A name would have made the URL a lookup — names are not unique and
 * do not survive a re-extraction — and a second builder would let the
 * query key and the hash drift apart, which fails silently: the filter
 * applies and the page never scrolls to it.
 * ================================================================== */

import { after, before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"

import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import { askAboutConceptHref, askAboutHref, conceptHref } from "@/lib/knowledge/links"
import { liveExplorer } from "@/lib/knowledge/understand/live"
import { replaceItemConcepts } from "@/lib/knowledge/concepts/repo"
import { canonicalConceptName, normalizeConceptName } from "@/lib/knowledge/concepts/normalize"
import * as repo from "@/lib/knowledge/repo"

/* ================================================================== *
 * THE URL
 * ================================================================== */

describe("conceptHref", () => {
  it("points at the Explorer, filtered, and scrolled to", () => {
    // Both halves matter. /knowledge opens on an editorial intro, so a
    // link that filtered without the hash would land someone on a page
    // that looks unchanged — the feature would appear not to work while
    // working perfectly.
    assert.equal(conceptHref("knc_abc"), "/knowledge?concept=knc_abc#explorer")
  })

  it("encodes an id that needs it, rather than producing a broken URL", () => {
    assert.equal(conceptHref("a b&c=d"), "/knowledge?concept=a%20b%26c%3Dd#explorer")
  })

  it("asks about a concept through the SAME Ask as everything else", () => {
    const href = askAboutConceptHref("Agent Memory")
    assert.ok(href.startsWith("/knowledge/ai?q="), "there is one Ask, reached from many places")
    assert.equal(href, askAboutHref('What do I know about “Agent Memory”?'))
    assert.match(decodeURIComponent(href), /Agent Memory/)
  })
})

/* ================================================================== *
 * ONE BUILDER
 * ================================================================== */

describe("every surface uses the one helper", () => {
  const files = [
    "components/knowledge/discovery-panel.tsx",
    "components/knowledge/understand/explorer/knowledge-explorer.tsx",
    "app/knowledge/topics/page.tsx",
  ]

  it("nobody hand-builds a Knowledge URL", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8")
      assert.doesNotMatch(source, /["'`]\/knowledge\?concept=/, `${file} builds the concept URL itself`)
      assert.doesNotMatch(source, /`\/knowledge\/library\?q=/, `${file} builds the topic URL itself`)
      assert.doesNotMatch(source, /`\/knowledge\/ai\?q=/, `${file} builds the Ask URL itself`)
    }
  })

  it("nobody derives a concept link from a NAME", () => {
    // A name is not unique, is not stable across a re-extraction, and
    // would turn a reference into a lookup.
    const source = readFileSync("components/knowledge/discovery-panel.tsx", "utf8")
    assert.match(source, /conceptHref\(c\.id\)/)
    assert.doesNotMatch(source, /conceptHref\(c\.label\)/)
  })

  it("the Reader's chips are links; the Explorer's own chips are not", () => {
    // Each goes to wherever the concept is NOT. Inside the Explorer, a
    // chip that navigated to the Explorer would be a no-op that looks
    // like a broken link.
    const reader = readFileSync("components/knowledge/discovery-panel.tsx", "utf8")
    assert.match(reader, /<Link\s+href=\{conceptHref/)

    const explorer = readFileSync("components/knowledge/understand/explorer/knowledge-explorer.tsx", "utf8")
    assert.match(explorer, /onSelectConcept\(id === selectedConceptId \? null : id\)/)
  })
})

/* ================================================================== *
 * THE ID IS NOT A KEY
 * ================================================================== */

let owner: TestTenant
let colleague: TestTenant

before(async () => {
  await prepareDatabase()
})
beforeEach(async () => {
  owner = await createTenant("nav-owner")
  const mate = await createTenant("nav-colleague")
  await getTestPool().query("UPDATE memberships SET org_id = $1 WHERE user_id = $2", [owner.orgId, mate.userId])
  colleague = { orgId: owner.orgId, userId: mate.userId }
})
after(closeTestPool)

const scopeOf = (t: TestTenant) => ({ orgId: t.orgId, userId: t.userId })

let seq = 0
async function save(t: TestTenant, title: string) {
  seq += 1
  const id = `kn_${randomUUID()}`
  const now = Date.now() + seq
  await getTestPool().query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived,
                                  title, site_name, domain, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,FALSE,$5,'Example','example.test','Body.',$6,$6)`,
    [id, t.orgId, t.userId, `https://example.test/${id}`, title, now],
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

describe("a concept id in a URL is a filter, never a key", () => {
  it("the page validates it against the viewer's OWN concepts", () => {
    const source = readFileSync("app/knowledge/page.tsx", "utf8")
    assert.match(source, /explorer\?\.concepts\.some\(\(c\) => c\.id === raw\)/)
  })

  it("a colleague's concept id selects nothing of theirs and nothing of mine", async () => {
    // The whole attack surface this link introduces: an id that is now
    // visible in an address bar and can be pasted into someone else's.
    const mine = await save(owner, "Mine")
    await replaceItemConcepts(mine, [extracted("My Idea")], scopeOf(owner))
    const theirs = await save(colleague, "Theirs")
    await replaceItemConcepts(theirs, [extracted("Their Idea")], scopeOf(colleague))

    const theirConcept = (await liveExplorer(scopeOf(colleague))).concepts[0]
    assert.ok(theirConcept, "precondition: they have one")

    const mineView = await liveExplorer(scopeOf(owner))
    assert.ok(!mineView.concepts.some((c) => c.id === theirConcept.id), "their concept is not in my rail")
    assert.deepEqual(
      mineView.objects.filter((o) => o.conceptIds.includes(theirConcept.id)),
      [],
      "and filtering by it matches nothing of mine either",
    )
    assert.deepEqual(mineView.objects.map((o) => o.id), [mine], "I still see exactly my own library")
  })

  it("the link uses an id this viewer actually holds, so the round trip closes", async () => {
    // The loop the feature exists for: an item's concept id, taken from
    // the Reader's own panel, selects that item's siblings in the
    // Explorer.
    const a = await save(owner, "First")
    const b = await save(owner, "Second")
    const c = await save(owner, "Unrelated")
    await replaceItemConcepts(a, [extracted("Shared Idea")], scopeOf(owner))
    await replaceItemConcepts(b, [extracted("Shared Idea")], scopeOf(owner))
    await replaceItemConcepts(c, [extracted("Something Else")], scopeOf(owner))

    const view = await liveExplorer(scopeOf(owner))
    const shared = view.concepts.find((x) => x.label === "Shared Idea")!
    assert.equal(shared.itemCount, 2)

    const href = conceptHref(shared.id)
    const selected = new URL(href, "https://example.test").searchParams.get("concept")
    assert.equal(selected, shared.id, "the id survives the URL unchanged")

    const matching = view.objects.filter((o) => o.conceptIds.includes(selected!)).map((o) => o.id)
    assert.deepEqual(matching.sort(), [a, b].sort())
    assert.ok(!matching.includes(c))
  })

  it("an archived sibling does not come back through a concept link", async () => {
    const a = await save(owner, "Live")
    const gone = await save(owner, "Archived")
    await replaceItemConcepts(a, [extracted("Shared Idea")], scopeOf(owner))
    await replaceItemConcepts(gone, [extracted("Shared Idea")], scopeOf(owner))
    await repo.setArchived(gone, owner.orgId, owner.userId, true)

    const view = await liveExplorer(scopeOf(owner))
    const shared = view.concepts.find((x) => x.label === "Shared Idea")!
    const matching = view.objects.filter((o) => o.conceptIds.includes(shared.id)).map((o) => o.id)
    assert.deepEqual(matching, [a], "archiving means it stops appearing here too")
  })
})
