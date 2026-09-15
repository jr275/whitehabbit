/* ================================================================== *
 * LIVE OVERVIEW — the first numbers on /knowledge that belong to the
 * person reading them.
 *
 * The surface shows four measures. Two are real tables; two — themes
 * and open questions — are not derived from anything in this codebase.
 * So the rule these tests exist to hold is narrow and specific: this
 * module returns what it can count and nothing else, and what it
 * counts is one owner's library.
 *
 * A wrong number here is worse than a missing one. It appears under a
 * heading that says "Keeply found", in the viewer's own account, and
 * there is nothing on the page that would let them tell it was a
 * guess.
 *
 * Real PostgreSQL. No model is called; no credential is needed.
 * ================================================================== */

import { after, before, beforeEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"

import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"
import * as repo from "@/lib/knowledge/repo"
import { liveOverview } from "@/lib/knowledge/understand/live"
import { replaceItemConcepts } from "@/lib/knowledge/concepts/repo"
import { canonicalConceptName, normalizeConceptName } from "@/lib/knowledge/concepts/normalize"

let owner: TestTenant
/** A whole separate organization. */
let stranger: TestTenant
/** A colleague: the SAME organization, a different person. This is the
 *  attacker an org_id-only predicate silently allows, and the reason
 *  every count here is scoped on created_by as well. */
let colleague: TestTenant

before(async () => {
  await prepareDatabase()
})
beforeEach(async () => {
  // Fresh owners per test: these are whole-library counts, so rows
  // left behind by a previous case would join the next one's answer.
  owner = await createTenant("live-owner")
  stranger = await createTenant("live-stranger")
  const mate = await createTenant("live-colleague")
  await getTestPool().query("UPDATE memberships SET org_id = $1 WHERE user_id = $2", [owner.orgId, mate.userId])
  colleague = { orgId: owner.orgId, userId: mate.userId }
})
after(closeTestPool)

const scopeOf = (t: TestTenant) => ({ orgId: t.orgId, userId: t.userId })

let seq = 0
async function save(t: TestTenant, opts: { archived?: boolean; createdAt?: number } = {}) {
  seq += 1
  const id = `kn_${randomUUID()}`
  const now = opts.createdAt ?? Date.now()
  await getTestPool().query(
    `INSERT INTO knowledge_items (id, org_id, created_by, url, status, kind, attempts, favorite, archived,
                                  title, domain, content_text, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'ready','article',0,FALSE,$5,'A piece','ex.test','Body.',$6,$6)`,
    [id, t.orgId, t.userId, `https://ex.test/${id}-${seq}`, opts.archived ?? false, now],
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
 * COUNTS
 * ================================================================== */

describe("liveOverview — what it counts", () => {
  it("reports an empty library as empty, with no start date", async () => {
    // Zero saves and "no collected-since yet" are both real states. The
    // surface renders them; it must not receive a fabricated date.
    assert.deepEqual(await liveOverview(scopeOf(owner)), {
      savedCount: 0,
      conceptCount: 0,
      since: null,
    })
  })

  it("counts the owner's saved items", async () => {
    await save(owner)
    await save(owner)
    assert.equal((await liveOverview(scopeOf(owner))).savedCount, 2)
  })

  it("does NOT count archived items", async () => {
    // Archiving is the user saying this is no longer part of their
    // library. A headline that keeps counting them contradicts the
    // library list, search and related knowledge, all of which drop
    // them.
    await save(owner)
    await save(owner, { archived: true })
    assert.equal((await liveOverview(scopeOf(owner))).savedCount, 1)
  })

  it("counts DISTINCT concepts, not associations", async () => {
    // "12 concepts" has to mean twelve different ideas. Counting rows
    // would report one idea found in twelve documents as twelve.
    const a = await save(owner)
    const b = await save(owner)
    await replaceItemConcepts(a, [extracted("Retrieval"), extracted("Agents")], scopeOf(owner))
    await replaceItemConcepts(b, [extracted("Retrieval")], scopeOf(owner))

    assert.equal((await liveOverview(scopeOf(owner))).conceptCount, 2)
  })

  it("does not count concepts that only live on archived items", async () => {
    const live = await save(owner)
    const archived = await save(owner)
    await replaceItemConcepts(live, [extracted("Kept")], scopeOf(owner))
    await replaceItemConcepts(archived, [extracted("Hidden")], scopeOf(owner))
    await repo.setArchived(archived, owner.orgId, owner.userId, true)

    assert.equal((await liveOverview(scopeOf(owner))).conceptCount, 1)
  })

  it("reports the earliest save as the start date", async () => {
    const earliest = Date.now() - 90 * 86_400_000
    await save(owner, { createdAt: earliest })
    await save(owner, { createdAt: Date.now() })

    assert.equal((await liveOverview(scopeOf(owner))).since, earliest)
  })
})

/* ================================================================== *
 * SCOPE
 * ================================================================== */

describe("liveOverview — scope", () => {
  it("never counts another ORGANIZATION's items or concepts", async () => {
    const theirs = await save(stranger)
    await save(stranger)
    await replaceItemConcepts(theirs, [extracted("Theirs")], scopeOf(stranger))

    assert.deepEqual(await liveOverview(scopeOf(owner)), { savedCount: 0, conceptCount: 0, since: null })
  })

  it("never counts a COLLEAGUE's items — same org, different person", async () => {
    // The case org_id alone does not catch, and the reason these
    // counts carry created_by. Without it a shared organization
    // reports everybody's library to everybody as their own.
    await save(colleague)
    await save(colleague)
    assert.equal((await liveOverview(scopeOf(owner))).savedCount, 0)
  })

  it("never counts a COLLEAGUE's concepts", async () => {
    const theirs = await save(colleague)
    await replaceItemConcepts(theirs, [extracted("Theirs")], scopeOf(colleague))
    assert.equal((await liveOverview(scopeOf(owner))).conceptCount, 0)
  })

  it("does not let a colleague's older library move my start date", async () => {
    await save(colleague, { createdAt: Date.now() - 900 * 86_400_000 })
    const mine = Date.now() - 3 * 86_400_000
    await save(owner, { createdAt: mine })

    assert.equal((await liveOverview(scopeOf(owner))).since, mine)
  })

  it("counts MY items in a shared organization, and only mine", async () => {
    // The other direction: scoping must not be so tight that it hides
    // the viewer's own library from them.
    await save(owner)
    await save(owner)
    await save(colleague)

    assert.equal((await liveOverview(scopeOf(owner))).savedCount, 2)
    assert.equal((await liveOverview(scopeOf(colleague))).savedCount, 1)
  })
})

/* ================================================================== *
 * THE PAGE
 *
 * Asserted by source inspection: app/knowledge/page.tsx imports
 * next-auth through lib/session, which this repo's plain-Node runner
 * cannot load (same constraint as tests/knowledge/tick.test.ts).
 * ================================================================== */

describe("app/knowledge/page.tsx", () => {
  const source = readFileSync("app/knowledge/page.tsx", "utf8")

  it("labels a resolved overview as live", () => {
    assert.match(source, /origin:\s*"live"/)
  })

  it("reports themes and open questions as NOT MEASURED, never as zero", () => {
    // Zero would be a claim about the reader's library. Null is a
    // statement about ours, and the surface omits the measure entirely.
    assert.match(source, /themeCount:\s*null/)
    assert.match(source, /questionCount:\s*null/)
    assert.doesNotMatch(source, /themeCount:\s*\d/)
    assert.doesNotMatch(source, /questionCount:\s*\d/)
  })

  it("falls back to the labelled prototype for a visitor with no usable session", () => {
    assert.match(source, /UnauthenticatedError/)
    assert.match(source, /StaleSessionError/)
    assert.match(source, /return null/)
  })

  it("is per-request — one tenant's counts must never be baked into the build", () => {
    assert.match(source, /export const dynamic = "force-dynamic"/)
  })

  it("passes the caller's own scope to the counts, never a widened one", () => {
    assert.match(source, /liveOverview\(\{ orgId: organizationId, userId \}\)/)
  })
})
