/* ================================================================== *
 * CHARACTERIZATION — duplicate detection
 *
 * Runs against a REAL PostgreSQL, because most of what "dedup" means
 * here is not application code: it is the partial unique index (now
 * uq_knowledge_org_user_normalized, on (org_id, created_by,
 * normalized_url) — see migrations/0005_knowledge_user_scope.sql,
 * which replaced 0004_knowledge_dedupe.sql's org-only index). A mocked
 * client would assert nothing about the thing that actually decides.
 *
 * Dedup is two layers, and both are characterised here:
 *
 *   1. the canonical key (lib/knowledge/url.ts) decides what "the same
 *      page" means;
 *   2. the partial unique index enforces it, and is the backstop for
 *      the race the read-then-insert in service.saveUrl cannot win.
 *
 * As in url.test.ts: most of these tests DESCRIBE today's behaviour;
 * where it looked wrong the assertion used to encode the current
 * value, marked SUSPECT. Commit 9 (S3/S4) and Commit 10 (S5) each
 * fixed exactly the assertions marked that way in their own area,
 * in place — not deleted, not left stale.
 *
 * service.saveUrl itself is mostly avoided in the length/tenancy tests
 * above: its own dedup is the composition tested via the
 * save()/findExisting() helpers below — canonicalise, look up, insert,
 * catch the unique violation. Later blocks (S3/S4, and the S5
 * API-boundary suite at the end of this file) DO call saveUrl
 * directly.
 *
 * DNS IS SUPPLIED, NOT BORROWED FROM THE INTERNET. saveUrl validates
 * through the SSRF guard, which resolves a hostname. These tests used
 * to let that reach the real resolver, so two of them failed in any
 * environment without public DNS — for reasons that had nothing to do
 * with dedup. They now pass `resolver`, saveUrl's test seam, and
 * control the answer explicitly.
 *
 * That seam cannot be used to smuggle a forbidden URL past the guard:
 * every address a resolver returns is validated by the same rules, so
 * answering with loopback or a private range produces a REFUSAL. The
 * "a resolver cannot be used to save a forbidden destination" block
 * below asserts that, which is what makes the seam safe to have.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"

import { canonicalizeUrlSafe, MAX_CANONICAL_URL_BYTES } from "@/lib/knowledge/url"
import * as repo from "@/lib/knowledge/repo"
import { SaveValidationError, saveUrl } from "@/lib/knowledge/service"
import { MAX_RESOLVED_ADDRESSES, type AddressResolver } from "@/lib/security/ssrf-guard"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, type TestTenant } from "../helpers/db"

/* ---- controlled DNS ------------------------------------------------ *
 *
 * A real public address, so the guard's CIDR math admits it. Nothing
 * is ever connected to in these tests: saveUrl only VALIDATES the URL
 * and enqueues a job, so this answer is used for the range check and
 * nothing else. */
const PUBLIC_V4 = "93.184.216.34"

const resolvesToPublic: AddressResolver = async () => [{ address: PUBLIC_V4, family: 4 }]
const resolvesToLoopback: AddressResolver = async () => [{ address: "127.0.0.1", family: 4 }]
const resolvesToPrivate: AddressResolver = async () => [{ address: "10.0.0.7", family: 4 }]
const resolvesToMixed: AddressResolver = async () => [
  { address: PUBLIC_V4, family: 4 },
  { address: "192.168.1.1", family: 4 },
]
const resolvesToNothing: AddressResolver = async () => []
const resolverThatFails: AddressResolver = async () => {
  throw new Error("getaddrinfo ENOTFOUND internal-billing.corp")
}

let alice: TestTenant
let bob: TestTenant

before(async () => {
  await prepareDatabase()
  alice = await createTenant("alice")
  bob = await createTenant("bob")
})
after(async () => {
  await closeTestPool()
})

/** Save through the same steps service.saveUrl takes, minus the
 * network: canonicalise, then insert. */
async function save(tenant: TestTenant, url: string, userId: string | null = tenant.userId) {
  return repo.insertSavedItem({
    orgId: tenant.orgId,
    userId,
    url,
    normalizedUrl: canonicalizeUrlSafe(url),
    domain: new URL(url).hostname.replace(/^www\./, ""),
  })
}

/** A second real member of an EXISTING org. createTenant() always
 * creates a new org, which is not what "two colleagues in one
 * workspace" means — and created_by has a foreign key, so the user has
 * to genuinely exist. */
async function addMember(orgId: string, label: string): Promise<string> {
  const userId = `user_${randomBytes(8).toString("hex")}`
  const now = Date.now()
  await getTestPool().query("INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)", [
    userId,
    `${label}-${randomBytes(4).toString("hex")}@example.test`,
    "not-a-real-hash",
    now,
  ])
  await getTestPool().query(
    "INSERT INTO memberships (user_id, org_id, role, created_at) VALUES ($1, $2, 'member', $3)",
    [userId, orgId, now],
  )
  return userId
}

/** The read half of service.saveUrl's read-then-insert — scoped to the
 * tenant's own user, exactly as the real service does (S5). */
async function findExisting(tenant: TestTenant, url: string) {
  const key = canonicalizeUrlSafe(url)
  return key ? repo.findByNormalizedUrl(tenant.orgId, tenant.userId, key) : null
}

async function countItems(orgId: string): Promise<number> {
  const { rows } = await getTestPool().query<{ n: string }>(
    "SELECT count(*)::text AS n FROM knowledge_items WHERE org_id = $1",
    [orgId],
  )
  return Number(rows[0].n)
}

describe("dedup — the same page saved twice", () => {
  it("finds the existing item for the exact same URL", async () => {
    const url = `https://example.com/exact-${randomBytes(6).toString("hex")}`
    const first = await save(alice, url)

    const existing = await findExisting(alice, url)
    assert.ok(existing, "a second save must find the first")
    assert.equal(existing.id, first.id)
  })

  it("finds the existing item for a URL that only differs cosmetically", async () => {
    const slug = randomBytes(6).toString("hex")
    const first = await save(alice, `https://example.com/cosmetic-${slug}`)

    for (const variant of [
      `https://www.example.com/cosmetic-${slug}`,
      `https://example.com/cosmetic-${slug}/`,
      `https://example.com/cosmetic-${slug}#intro`,
      `https://example.com/cosmetic-${slug}?utm_source=newsletter`,
      `https://EXAMPLE.com/cosmetic-${slug}?fbclid=abc`,
    ]) {
      const existing = await findExisting(alice, variant)
      assert.ok(existing, `${variant} should have matched the original`)
      assert.equal(existing.id, first.id, `${variant} resolved to the wrong item`)
    }
  })

  it("keeps genuinely different pages as separate items", async () => {
    const slug = randomBytes(6).toString("hex")
    const a = await save(alice, `https://example.com/distinct-${slug}?id=1`)
    const b = await save(alice, `https://example.com/distinct-${slug}?id=2`)

    assert.notEqual(a.id, b.id)
    assert.notEqual(a.normalized_url, b.normalized_url)
  })
})

describe("dedup — the partial unique index", () => {
  it("refuses a second ACTIVE row with the same canonical key", async () => {
    const url = `https://example.com/unique-${randomBytes(6).toString("hex")}`
    await save(alice, url)

    await assert.rejects(
      () => save(alice, url),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        assert.match(message, /duplicate key|unique/i, "service.saveUrl matches on exactly this text")
        return true
      },
      "the index is the backstop behind the read-then-insert",
    )
  })

  it("allows a second row once the first is ARCHIVED", async () => {
    // The index is WHERE archived = FALSE, so archiving releases the
    // key. Deliberate: re-saving something you archived is a new save.
    const url = `https://example.com/archived-${randomBytes(6).toString("hex")}`
    const first = await save(alice, url)
    await repo.setArchived(first.id, alice.orgId, alice.userId, true)

    const second = await save(alice, url)
    assert.notEqual(second.id, first.id, "archiving the first must free the key")

    // ...and findByNormalizedUrl only ever returns the active one.
    const existing = await findExisting(alice, url)
    assert.equal(existing?.id, second.id)
  })

  it("treats NULL keys as distinct, so unparseable URLs never collide", async () => {
    // WHERE normalized_url IS NOT NULL. Legacy rows and any URL the
    // canonicaliser rejects simply do not participate in dedup.
    const a = await repo.insertSavedItem({
      orgId: alice.orgId, userId: alice.userId, url: "legacy-a", normalizedUrl: null, domain: null,
    })
    const b = await repo.insertSavedItem({
      orgId: alice.orgId, userId: alice.userId, url: "legacy-b", normalizedUrl: null, domain: null,
    })
    assert.notEqual(a.id, b.id, "two NULL keys must not conflict")
  })

  it("resolves a concurrent double-save to exactly one winner", async () => {
    // The race service.saveUrl cannot win with a read: two requests
    // both find nothing, both insert, and the index decides.
    const url = `https://example.com/race-${randomBytes(6).toString("hex")}`

    const results = await Promise.allSettled([save(alice, url), save(alice, url)])
    const won = results.filter((r) => r.status === "fulfilled")
    const lost = results.filter((r) => r.status === "rejected")

    assert.equal(won.length, 1, "exactly one insert may survive")
    assert.equal(lost.length, 1)
    assert.match(
      (lost[0] as PromiseRejectedResult).reason?.message ?? "",
      /duplicate key|unique/i,
      "the loser must be recognisable, or saveUrl cannot recover it",
    )

    const rows = await getTestPool().query(
      "SELECT id FROM knowledge_items WHERE org_id = $1 AND normalized_url = $2",
      [alice.orgId, canonicalizeUrlSafe(url)],
    )
    assert.equal(rows.rows.length, 1, "the library must not contain a duplicate")
  })
})

describe("dedup — tenancy", () => {
  it("scopes the key per organization, so two orgs may save the same page", async () => {
    const url = `https://example.com/shared-${randomBytes(6).toString("hex")}`
    const mine = await save(alice, url)
    const theirs = await save(bob, url)

    assert.notEqual(mine.id, theirs.id)
    assert.equal(mine.normalized_url, theirs.normalized_url, "the same key, different tenants")
  })

  it("never resolves a lookup across organizations", async () => {
    const url = `https://example.com/private-${randomBytes(6).toString("hex")}`
    await save(alice, url)

    assert.equal(await findExisting(bob, url), null, "bob must not see alice's item")
  })
})

describe("dedup — FIXED (S5, Commit 10): scoped by user, not just by org", () => {
  it("does NOT deduplicate across users inside one organization — each colleague gets their own item", async () => {
    // Was SUSPECT (high): two members of one org used to share a
    // single library — the second person to save a page was told it
    // was "already in your library", and it was, but it was someone
    // else's. Fixed at both layers: the read (findByNormalizedUrl,
    // now scoped by (org, user)) AND the database constraint itself
    // (migrations/0005_knowledge_user_scope.sql moves the unique index
    // from (org_id, normalized_url) to (org_id, created_by,
    // normalized_url)) — without the migration, this save would still
    // raise a real duplicate-key error from the database.
    const url = `https://example.com/two-users-${randomBytes(6).toString("hex")}`
    const colleague = await addMember(alice.orgId, "colleague")

    const mine = await save(alice, url, alice.userId)
    assert.equal(mine.created_by, alice.userId, "created_by IS written")

    const theirs = await save(alice, url, colleague)
    assert.notEqual(theirs.id, mine.id, "a colleague's save of the same public page is a genuinely new item, not a collision")
    assert.equal(theirs.created_by, colleague)
    assert.equal(theirs.normalized_url, mine.normalized_url, "same key — it really is the same page, just two owners")

    // Each user's own lookup finds only their own row.
    const found = await findExisting(alice, url)
    assert.equal(found?.created_by, alice.userId, "alice's lookup finds HER row")
    assert.notEqual(found?.id, theirs.id)
  })

  it("returns only the calling user's items from a list query — never a colleague's", async () => {
    const solo = await createTenant("solo")
    const slug = randomBytes(6).toString("hex")
    const colleague = await addMember(solo.orgId, "solo-colleague")
    const owner = await save(solo, `https://example.com/by-owner-${slug}`, solo.userId)
    await save(solo, `https://example.com/by-colleague-${slug}`, colleague)

    const { rows } = await repo.listItems(solo.orgId, solo.userId, { limit: 50, offset: 0 })
    assert.equal(rows.length, 1, "one library each, not one shared library")
    assert.equal(rows[0].id, owner.id)
    assert.ok(rows.every((r) => r.created_by === solo.userId))
  })
})

describe("dedup — canonical key length", () => {
  it("is why the limit exists: past the ceiling the index itself refuses", async () => {
    // This is the failure MAX_CANONICAL_URL_BYTES prevents, asserted
    // against the real index so the limit stays anchored to a measured
    // fact rather than a remembered number. Reaching it now requires
    // bypassing saveUrl, as this helper does.
    //
    // The dedup index is a btree whose row maximum is 2704 bytes. Past
    // it the INSERT fails with a Postgres error that service.saveUrl
    // does not recognise (it only catches /duplicate key|unique/i), so
    // it would propagate to withApiHandler and the user would get
    // "Something went wrong. Try again." — for a URL that will never
    // succeed, however many times they retry.
    //
    // Incompressible on purpose: repeat('a', n) is TOAST-compressed to
    // almost nothing and inserts happily at 20,000 characters, which
    // makes a naive test pass and hide this entirely.
    const incompressible = randomBytes(2000).toString("hex") // 4000 chars
    const url = `https://example.com/${incompressible}`
    assert.ok(canonicalizeUrlSafe(url)!.length > 2704, "the key must exceed the btree maximum")

    await assert.rejects(
      () => save(alice, url),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        assert.match(message, /index row size|exceeds btree/i)
        assert.doesNotMatch(
          message,
          /duplicate key|unique/i,
          "and it does NOT look like a duplicate, so saveUrl's recovery path misses it",
        )
        return true
      },
    )
  })

  it("accepts a long-but-indexable canonical URL", async () => {
    const incompressible = randomBytes(1200).toString("hex") // 2400 chars
    const url = `https://example.com/${incompressible}`
    const row = await save(alice, url)
    assert.ok(row.id, "the index tolerates more than the guard allows — that gap is the headroom")
  })

  /* ── The guard, exercised through the REAL service.saveUrl ──────── *
   * saveUrl is otherwise avoided in this file because assertSafeUrl
   * does DNS. A literal public IP is the exception: the guard checks
   * it directly and returns before any lookup, so these tests exercise
   * the actual production path with no network at all. That is what
   * makes "rejected BEFORE the database" provable rather than asserted
   * about a copy of the code. */

  const publicIpUrl = (pathBytes: number) => {
    const prefix = "https://93.184.216.34/"
    return prefix + "a".repeat(pathBytes - prefix.length)
  }

  it("saveUrl rejects an over-long URL with a message the user can act on", async () => {
    const tenant = await createTenant("too-long")
    await assert.rejects(
      () => saveUrl({ orgId: tenant.orgId, userId: tenant.userId, url: publicIpUrl(MAX_CANONICAL_URL_BYTES + 1) }),
      (err: unknown) => {
        assert.ok(err instanceof SaveValidationError, "a 400, not a 500")
        assert.match(err.message, /too long/i)
        return true
      },
    )
  })

  it("saveUrl rejects BEFORE writing anything", async () => {
    // The ordering is the point: input → canonicalise → validate →
    // dedup → persist. If the check ran after the insert the row count
    // would move, and the user would get a 500 from Postgres instead.
    const tenant = await createTenant("no-write")
    const before = await countItems(tenant.orgId)
    await assert.rejects(() =>
      saveUrl({ orgId: tenant.orgId, userId: tenant.userId, url: publicIpUrl(MAX_CANONICAL_URL_BYTES + 500) }),
    )
    assert.equal(await countItems(tenant.orgId), before, "nothing was persisted")
  })

  it("saveUrl rejects an enormous incompressible URL without reaching the index", async () => {
    // repeat("a", n) is TOAST-compressed to almost nothing and would
    // insert happily at 20,000 characters, which makes a naive test
    // pass and hides the index limit entirely. This one is genuinely
    // incompressible, and is far past the btree maximum — yet the user
    // still gets a validation error, never "index row size exceeds".
    const tenant = await createTenant("enormous")
    const url = `https://93.184.216.34/${randomBytes(4000).toString("hex")}`
    assert.ok(canonicalizeUrlSafe(url)!.length > 2704, "past the btree maximum, not merely past the guard")
    await assert.rejects(
      () => saveUrl({ orgId: tenant.orgId, userId: tenant.userId, url }),
      (err: unknown) => {
        assert.ok(err instanceof SaveValidationError)
        assert.doesNotMatch(err.message, /index row size|exceeds btree/i, "no raw Postgres error reaches the user")
        return true
      },
    )
    assert.equal(await countItems(tenant.orgId), 0)
  })

  it("saveUrl still accepts a URL at the limit", async () => {
    const tenant = await createTenant("at-limit")
    const result = await saveUrl({
      orgId: tenant.orgId,
      userId: tenant.userId,
      url: publicIpUrl(MAX_CANONICAL_URL_BYTES),
    })
    assert.equal(result.duplicate, false)
    assert.equal(await countItems(tenant.orgId), 1, "the limit is inclusive")
  })
})

describe("dedup — hash routes are distinct documents", () => {
  it("saves two hashbang articles as two rows", async () => {
    // The end-to-end consequence of the canonicalisation fix. Before
    // it, the second save collided with the first on the unique index
    // and the user was told the article was already in their library.
    const tenant = await createTenant("spa")
    const slug = randomBytes(6).toString("hex")
    const one = await save(tenant, `https://example.com/${slug}#!/artigo/1`)
    const two = await save(tenant, `https://example.com/${slug}#!/artigo/2`)
    assert.notEqual(one.id, two.id)
    assert.notEqual(one.normalized_url, two.normalized_url, "two keys, so the index permits both")

    const { rows } = await repo.listItems(tenant.orgId, tenant.userId, { limit: 50, offset: 0 })
    assert.equal(rows.length, 2)
  })

  it("still collapses the SAME route saved twice", async () => {
    // The fix must not cost dedup. The index is the one that decides.
    const tenant = await createTenant("spa-dupe")
    const slug = randomBytes(6).toString("hex")
    await save(tenant, `https://example.com/${slug}#!/artigo/1`)
    await assert.rejects(
      () => save(tenant, `https://www.example.com/${slug}/#!/artigo/1`),
      (err: unknown) => {
        assert.match(err instanceof Error ? err.message : String(err), /duplicate key|unique/i)
        return true
      },
    )
  })

  it("keeps an ordinary anchor collapsing, as before", async () => {
    const tenant = await createTenant("anchor")
    const slug = randomBytes(6).toString("hex")
    await save(tenant, `https://example.com/${slug}#intro`)
    await assert.rejects(() => save(tenant, `https://example.com/${slug}#comments`))
  })
})

describe("a resolver cannot be used to save a forbidden destination", () => {
  /* The seam exists so DNS is deterministic, NOT so a caller can
   * choose what counts as safe. Every address a resolver returns is
   * validated by resolveSafeUrl under the same rules, so each case
   * below must be REFUSED and must persist nothing. Without these, the
   * seam added in this phase would be an SSRF bypass with a test
   * suite that approved of it. */
  const forbidden: [string, AddressResolver][] = [
    ["loopback", resolvesToLoopback],
    ["a private range", resolvesToPrivate],
    ["a mixed answer with one private address", resolvesToMixed],
    ["an empty answer", resolvesToNothing],
    ["a resolver that throws", resolverThatFails],
  ]

  for (const [label, resolver] of forbidden) {
    it(`refuses a hostname resolving to ${label}, and writes nothing`, async () => {
      const tenant = await createTenant("ssrf")
      const before = await countItems(tenant.orgId)
      await assert.rejects(
        () => saveUrl({ orgId: tenant.orgId, userId: tenant.userId, url: "https://example.com/blocked" }, { resolver }),
        (err: unknown) => {
          assert.ok(err instanceof SaveValidationError, "a 400, not a 500")
          // The guard's own detail names the address; the user-facing
          // message must not, or it becomes an existence oracle.
          assert.doesNotMatch(err.message, /127\.0\.0\.1|10\.0\.0\.7|192\.168|ENOTFOUND|internal-billing/)
          return true
        },
      )
      assert.equal(await countItems(tenant.orgId), before, "nothing was persisted")
    })
  }

  /* A MALFORMED RESOLVER ANSWER IS A 400, NOT A 500 (B-1).
   *
   * The 3.2-B audit found that a resolver answering `null`, or an
   * array holding `[null]`, raised a TypeError inside the guard
   * instead of an UnsafeUrlError. saveUrl converts only
   * UnsafeUrlError, so the user got a 500 for what is a refusal —
   * fail-closed, but the wrong status and an error log that looked
   * like a crash. These cases live HERE, at the consumer, because the
   * 400 is a property of this path and not of the guard.
   *
   * The shapes themselves, and the "blocked" code from safeFetch, are
   * asserted in tests/security/ip-policy.test.ts; this file owns only
   * the HTTP-status and persistence halves. */
  const malformedAnswers: [string, () => unknown][] = [
    ["null instead of an array", () => null],
    ["an array holding null", () => [null]],
    ["an array holding undefined", () => [undefined]],
    ["a non-array", () => "93.184.216.34"],
    ["a public address followed by an invalid item", () => [{ address: PUBLIC_V4, family: 4 }, null]],
    ["an item whose address is not a string", () => [{ address: 2130706433, family: 4 }]],
  ]

  for (const [label, answer] of malformedAnswers) {
    it(`refuses ${label} with a 400, and writes nothing`, async () => {
      const tenant = await createTenant("ssrf-shape")
      const before = await countItems(tenant.orgId)
      const resolver = (async () => answer()) as unknown as AddressResolver
      await assert.rejects(
        () =>
          saveUrl(
            { orgId: tenant.orgId, userId: tenant.userId, url: `https://example.com/shape-${randomBytes(4).toString("hex")}` },
            { resolver },
          ),
        (err: unknown) => {
          assert.ok(
            err instanceof SaveValidationError,
            `a malformed answer must be a 400, not a 500 — got ${err instanceof Error ? err.name : typeof err}`,
          )
          assert.doesNotMatch(err.message, /93\.184\.216\.34|2130706433|TypeError/, "detail reached the user")
          return true
        },
      )
      assert.equal(await countItems(tenant.orgId), before, "nothing was persisted")
    })
  }

  /* THE RANGES ADDED BY REMEDIATION 3.2-A, THROUGH THE REAL saveUrl.
   *
   * The five cases above pre-date it and cover ranges the old
   * string-based classifier already refused. These are the ones it
   * ACCEPTED, so without them this consumer's evidence would stop at
   * "the mechanism works" rather than "it works for the addresses the
   * remediation is about". Each must be a 400 that names no address
   * and leaves the library empty. */
  const newlyCovered: [string, string][] = [
    ["an uncompressed IPv6 loopback", "0:0:0:0:0:0:0:1"],
    ["an IPv4-compatible loopback", "::127.0.0.1"],
    ["link-local above the fe80: spelling", "fe90::1"],
    ["CGNAT", "100.64.0.1"],
    ["documentation space", "192.0.2.1"],
    ["benchmarking space", "198.18.0.1"],
    ["multicast", "239.255.255.250"],
    ["the broadcast address", "255.255.255.255"],
    ["6to4 encapsulating loopback", "2002:7f00:1::1"],
  ]

  for (const [label, address] of newlyCovered) {
    it(`refuses ${label} (${address}) as a DNS answer, and writes nothing`, async () => {
      const tenant = await createTenant("ssrf-new")
      const before = await countItems(tenant.orgId)
      const resolver: AddressResolver = async () => [
        { address, family: address.includes(":") ? 6 : 4 },
      ]
      await assert.rejects(
        () =>
          saveUrl(
            { orgId: tenant.orgId, userId: tenant.userId, url: `https://example.com/new-${randomBytes(4).toString("hex")}` },
            { resolver },
          ),
        (err: unknown) => {
          assert.ok(err instanceof SaveValidationError, "a 400, not a 500")
          assert.ok(
            !err.message.includes(address),
            "the refused address must not reach the user-facing message",
          )
          return true
        },
      )
      assert.equal(await countItems(tenant.orgId), before, "nothing was persisted")
    })
  }

  it("still saves when the resolver answers with a public address", async () => {
    // The positive control. Without it, a guard that refused every
    // resolver answer would satisfy all five cases above.
    const tenant = await createTenant("ssrf-ok")
    const result = await saveUrl(
      { orgId: tenant.orgId, userId: tenant.userId, url: "https://example.com/allowed" },
      { resolver: resolvesToPublic },
    )
    assert.equal(result.duplicate, false)
    assert.equal(await countItems(tenant.orgId), 1)
  })

  /* THE ADDRESS CAP NOW APPLIES HERE TOO.
   *
   * MAX_ADDRESSES used to live in safe-fetch and bound only the
   * fetching path. It moved into the guard, so saveUrl — which only
   * VALIDATES — inherits it. That is a real behaviour change for this
   * consumer, so both sides of the boundary are pinned here. */
  it("accepts a hostname answering with exactly the address limit", async () => {
    const exactly: AddressResolver = async () =>
      Array.from({ length: MAX_RESOLVED_ADDRESSES }, (_, i) => ({ address: `93.184.216.${i + 1}`, family: 4 }))
    const tenant = await createTenant("cap-ok")
    const result = await saveUrl(
      { orgId: tenant.orgId, userId: tenant.userId, url: "https://example.com/eight" },
      { resolver: exactly },
    )
    assert.equal(result.duplicate, false)
    assert.equal(await countItems(tenant.orgId), 1, "eight addresses is within the limit and must save")
  })

  it("refuses a hostname answering with one address over the limit, and writes nothing", async () => {
    const tooMany: AddressResolver = async () =>
      Array.from({ length: MAX_RESOLVED_ADDRESSES + 1 }, (_, i) => ({ address: `93.184.216.${i + 1}`, family: 4 }))
    const tenant = await createTenant("cap-over")
    const before = await countItems(tenant.orgId)
    await assert.rejects(
      () => saveUrl({ orgId: tenant.orgId, userId: tenant.userId, url: "https://example.com/nine" }, { resolver: tooMany }),
      (err: unknown) => {
        assert.ok(err instanceof SaveValidationError, "a 400, not a 500")
        return true
      },
    )
    assert.equal(await countItems(tenant.orgId), before, "nothing was persisted")
  })

  it("performs no resolution at all for a literal public IP", async () => {
    // A literal is checked by CIDR math, so the resolver must never be
    // consulted — there is no rebinding window to close for one.
    let called = 0
    const counting: AddressResolver = async () => {
      called += 1
      return [{ address: PUBLIC_V4, family: 4 }]
    }
    const tenant = await createTenant("ssrf-lit")
    await saveUrl(
      { orgId: tenant.orgId, userId: tenant.userId, url: `https://${PUBLIC_V4}/literal` },
      { resolver: counting },
    )
    assert.equal(called, 0, "a literal address needs no lookup")
  })
})

describe("dedup — S3/S4 (Commit 9): credentials and non-http schemes never reach the database", () => {
  // Unlike the length tests above, none of these need a real IP or any
  // network access at all: the rejection happens in service.normalizeUrl
  // (lib/knowledge/url.ts's parseSaveableUrl()), which runs BEFORE
  // assertSafeUrl's DNS lookup — so an ordinary hostname is fine here,
  // and a passing test is real proof no lookup was even attempted, not
  // just that the eventual write didn't happen.

  it("saveUrl rejects a URL with credentials, and writes nothing", async () => {
    const tenant = await createTenant("creds")
    const before = await countItems(tenant.orgId)
    await assert.rejects(
      () => saveUrl({ orgId: tenant.orgId, userId: tenant.userId, url: "https://user:pass@example.com/article" }),
      (err: unknown) => {
        assert.ok(err instanceof SaveValidationError, "a 400, not a 500")
        assert.match(err.message, /username or password/i)
        return true
      },
    )
    assert.equal(await countItems(tenant.orgId), before, "nothing was persisted")
  })

  it("saveUrl rejects a non-http(s) scheme, and writes nothing", async () => {
    const tenant = await createTenant("scheme")
    const before = await countItems(tenant.orgId)
    await assert.rejects(
      () => saveUrl({ orgId: tenant.orgId, userId: tenant.userId, url: "file:///etc/passwd" }),
      (err: unknown) => {
        assert.ok(err instanceof SaveValidationError, "a 400, not a 500")
        assert.match(err.message, /http and https/i)
        return true
      },
    )
    assert.equal(await countItems(tenant.orgId), before, "nothing was persisted")
  })

  it("the equivalent public URL (same page, no credentials) still saves fine", async () => {
    const tenant = await createTenant("creds-public")
    const result = await saveUrl(
      { orgId: tenant.orgId, userId: tenant.userId, url: "https://example.com/article" },
      { resolver: resolvesToPublic },
    )
    assert.equal(result.duplicate, false)
    assert.equal(await countItems(tenant.orgId), 1)
    const row = await repo.getItem(result.row.id, tenant.orgId, tenant.userId)
    assert.ok(row)
    assert.doesNotMatch(row!.url, /@/, "no userinfo makes it into the stored url either")
    assert.doesNotMatch(row!.normalized_url ?? "", /@/, "or into the dedup key")
  })

  it("plain http:// (not just https://) still saves fine — the scheme check allows both", async () => {
    const tenant = await createTenant("http-scheme")
    const result = await saveUrl(
      { orgId: tenant.orgId, userId: tenant.userId, url: "http://example.com/plain-http" },
      { resolver: resolvesToPublic },
    )
    assert.equal(result.duplicate, false)
    assert.equal(await countItems(tenant.orgId), 1)
    const row = await repo.getItem(result.row.id, tenant.orgId, tenant.userId)
    assert.equal(row?.url, "http://example.com/plain-http")
  })
})

describe("S5 (Commit 10) — every real access path is scoped by (org, user), not just org", () => {
  // The minimum scenario the brief asks for: two real members of the
  // SAME organization (addMember() — a genuine users/memberships row,
  // not a second org). userA creates an item; userB, despite sharing
  // orgA.orgId, must be unable to list it, search it, read it, mutate
  // it, favorite/archive it, touch its tags, or retry it — every one
  // of those a real repo call, the actual boundary (not a copy of it).
  // Not-found is the required shape throughout: null/zero-rows/[]/
  // false, never a thrown "forbidden" that would confirm the item
  // exists (see lib/api-error.ts's NotFoundError — the routes turn
  // exactly these results into a 404 with no extra code, unchanged).

  it("list: userB never sees userA's item, and still sees their own", async () => {
    const orgA = await createTenant("s5-list-a")
    const userB = await addMember(orgA.orgId, "s5-list-b")
    const itemA = await save(orgA, `https://example.com/s5-list-${randomBytes(6).toString("hex")}`)
    const itemB = await save({ orgId: orgA.orgId, userId: userB }, `https://example.com/s5-list-b-${randomBytes(6).toString("hex")}`)

    const { rows: bRows } = await repo.listItems(orgA.orgId, userB, { limit: 50, offset: 0 })
    assert.ok(bRows.every((r) => r.id !== itemA.id), "userB's list must never include userA's item")
    assert.ok(bRows.some((r) => r.id === itemB.id), "userB still sees their own item")

    const { rows: aRows } = await repo.listItems(orgA.orgId, orgA.userId, { limit: 50, offset: 0 })
    assert.ok(aRows.every((r) => r.id !== itemB.id), "userA's list must never include userB's item")
    assert.ok(aRows.some((r) => r.id === itemA.id), "userA still sees their own item")
  })

  it("search: userB's search never surfaces userA's title/excerpt/content/domain/tags", async () => {
    const orgA = await createTenant("s5-search-a")
    const userB = await addMember(orgA.orgId, "s5-search-b")
    const needle = `Findable${randomBytes(4).toString("hex")}`
    const itemA = await save(orgA, `https://example.com/s5-search-${randomBytes(6).toString("hex")}`)
    await getTestPool().query("UPDATE knowledge_items SET title = $1 WHERE id = $2", [needle, itemA.id])
    await getTestPool().query("INSERT INTO knowledge_item_tags (item_id, org_id, tag) VALUES ($1, $2, $3)", [itemA.id, orgA.orgId, needle])

    // By title.
    const byTitle = await repo.searchItems(orgA.orgId, userB, needle)
    assert.equal(byTitle.length, 0, "userB's search must not find userA's title")
    // By tag.
    const byTag = await repo.searchItems(orgA.orgId, userB, needle)
    assert.equal(byTag.length, 0, "userB's search must not find userA's tag either — no lateral path through tags")

    // userA's own search DOES find it.
    const ownSearch = await repo.searchItems(orgA.orgId, orgA.userId, needle)
    assert.ok(ownSearch.some((r) => r.id === itemA.id))
  })

  it("get by id: userB gets null (the route's own 404), not userA's row", async () => {
    const orgA = await createTenant("s5-get-a")
    const userB = await addMember(orgA.orgId, "s5-get-b")
    const itemA = await save(orgA, `https://example.com/s5-get-${randomBytes(6).toString("hex")}`)

    assert.equal(await repo.getItem(itemA.id, orgA.orgId, userB), null)
    assert.ok(await repo.getItem(itemA.id, orgA.orgId, orgA.userId), "userA still reads their own item")
  })

  it("update (favorite/archive): userB's write affects zero rows and never changes userA's item", async () => {
    const orgA = await createTenant("s5-update-a")
    const userB = await addMember(orgA.orgId, "s5-update-b")
    const itemA = await save(orgA, `https://example.com/s5-update-${randomBytes(6).toString("hex")}`)

    const favResult = await repo.setFavorite(itemA.id, orgA.orgId, userB, true)
    assert.equal(favResult, null, "setFavorite as userB returns null — no row matched")
    const archResult = await repo.setArchived(itemA.id, orgA.orgId, userB, true)
    assert.equal(archResult, null, "setArchived as userB returns null — no row matched")

    const stillA = await repo.getItem(itemA.id, orgA.orgId, orgA.userId)
    assert.equal(stillA?.favorite, false, "userA's item was never favorited by userB's attempt")
    assert.equal(stillA?.archived, false, "userA's item was never archived by userB's attempt")

    // userA's own favorite/archive on their own item DOES work.
    assert.equal((await repo.setFavorite(itemA.id, orgA.orgId, orgA.userId, true))?.favorite, true)
  })

  it("delete: userB's delete affects zero rows; the item survives for userA", async () => {
    const orgA = await createTenant("s5-delete-a")
    const userB = await addMember(orgA.orgId, "s5-delete-b")
    const itemA = await save(orgA, `https://example.com/s5-delete-${randomBytes(6).toString("hex")}`)

    assert.equal(await repo.deleteItem(itemA.id, orgA.orgId, userB), false, "userB's delete must report nothing was deleted")
    assert.ok(await repo.getItem(itemA.id, orgA.orgId, orgA.userId), "the item still exists — userB never actually deleted it")
    assert.equal(await repo.deleteItem(itemA.id, orgA.orgId, orgA.userId), true, "userA CAN delete their own item")
  })

  it("tags: userB cannot read, and the ownership-check makes a tag write on userA's item a real no-op", async () => {
    const orgA = await createTenant("s5-tags-a")
    const userB = await addMember(orgA.orgId, "s5-tags-b")
    const itemA = await save(orgA, `https://example.com/s5-tags-${randomBytes(6).toString("hex")}`)
    await getTestPool().query("INSERT INTO knowledge_item_tags (item_id, org_id, tag) VALUES ($1, $2, 'secret-tag')", [itemA.id, orgA.orgId])

    assert.deepEqual(await repo.getTags(itemA.id, orgA.orgId, userB), [], "userB reads no tags for userA's item")
    assert.deepEqual(await repo.getTags(itemA.id, orgA.orgId, orgA.userId), ["secret-tag"], "userA reads their own real tag")

    // saveExtraction is the one path that rewrites tags — attempted as
    // userB, against userA's item, it must not touch that item's tags
    // at all (the UPDATE it's paired with affects zero rows first).
    await repo.saveExtraction(itemA.id, orgA.orgId, userB, {
      status: "ready", kind: "article", title: "hijacked", author: null, siteName: null, excerpt: null,
      imageUrl: null, favicon: null, canonicalUrl: null, publishedAt: null, wordCount: null, readingMin: null,
      lang: null, contentText: null, rawHtml: null, tags: ["attacker-tag"],
    })
    const afterAttempt = await repo.getItem(itemA.id, orgA.orgId, orgA.userId)
    assert.notEqual(afterAttempt?.title, "hijacked", "userB's saveExtraction must not have touched userA's item")
    assert.deepEqual(await repo.getTags(itemA.id, orgA.orgId, orgA.userId), ["secret-tag"], "and userA's real tag survives untouched")
  })

  it("topic aggregates: userB's tag counts never include userA's tags", async () => {
    const orgA = await createTenant("s5-topics-a")
    const userB = await addMember(orgA.orgId, "s5-topics-b")
    const itemA = await save(orgA, `https://example.com/s5-topics-${randomBytes(6).toString("hex")}`)
    await getTestPool().query("INSERT INTO knowledge_item_tags (item_id, org_id, tag) VALUES ($1, $2, 'a-only-topic')", [itemA.id, orgA.orgId])

    const bCounts = await repo.listTagCounts(orgA.orgId, userB)
    assert.ok(bCounts.every((t) => t.tag !== "a-only-topic"), "userB's Topics never surfaces userA's tag")
    const aCounts = await repo.listTagCounts(orgA.orgId, orgA.userId)
    assert.ok(aCounts.some((t) => t.tag === "a-only-topic"), "userA's own Topics does show it")
  })

  it("retry/reprocess: setStatus and incrementAttempts as userB are no-ops on userA's item", async () => {
    const orgA = await createTenant("s5-retry-a")
    const userB = await addMember(orgA.orgId, "s5-retry-b")
    const itemA = await save(orgA, `https://example.com/s5-retry-${randomBytes(6).toString("hex")}`)
    await repo.setStatus(itemA.id, orgA.orgId, orgA.userId, "failed", "some real failure")

    await repo.setStatus(itemA.id, orgA.orgId, userB, "saved", null) // userB "retrying" userA's item
    await repo.incrementAttempts(itemA.id, orgA.orgId, userB)

    const stillFailed = await repo.getItem(itemA.id, orgA.orgId, orgA.userId)
    assert.equal(stillFailed?.status, "failed", "userB's retry attempt must not resurrect userA's item")
    assert.equal(stillFailed?.attempts, 0, "and must not have incremented userA's attempt counter")
  })

  it("dedup key lookup: userB's save of the SAME public url as userA creates userB's OWN item, not a false 'duplicate'", async () => {
    const orgA = await createTenant("s5-dedup-a")
    const userB = await addMember(orgA.orgId, "s5-dedup-b")
    const url = `https://example.com/s5-dedup-${randomBytes(6).toString("hex")}`
    const itemA = await save(orgA, url)

    const bLookup = await repo.findByNormalizedUrl(orgA.orgId, userB, canonicalizeUrlSafe(url)!)
    assert.equal(bLookup, null, "userB's dedup lookup must not resolve to userA's row")

    const itemB = await save({ orgId: orgA.orgId, userId: userB }, url)
    assert.notEqual(itemB.id, itemA.id)
  })

  it("countSavedSince: userB's count never includes userA's saves", async () => {
    const orgA = await createTenant("s5-count-a")
    const userB = await addMember(orgA.orgId, "s5-count-b")
    const since = Date.now() - 1000
    await save(orgA, `https://example.com/s5-count-${randomBytes(6).toString("hex")}`)

    assert.equal(await repo.countSavedSince(orgA.orgId, userB, since), 0)
    assert.equal(await repo.countSavedSince(orgA.orgId, orgA.userId, since), 1)
  })

  it("the reverse direction holds too: userA (the item creator) cannot reach an item userB creates afterward", async () => {
    const orgA = await createTenant("s5-reverse-a")
    const userB = await addMember(orgA.orgId, "s5-reverse-b")
    await save(orgA, `https://example.com/s5-reverse-a1-${randomBytes(6).toString("hex")}`)
    const itemB = await save({ orgId: orgA.orgId, userId: userB }, `https://example.com/s5-reverse-b1-${randomBytes(6).toString("hex")}`)

    assert.equal(await repo.getItem(itemB.id, orgA.orgId, orgA.userId), null, "userA cannot read userB's item")
    assert.equal(await repo.setFavorite(itemB.id, orgA.orgId, orgA.userId, true), null, "userA cannot favorite userB's item")
    assert.equal(await repo.deleteItem(itemB.id, orgA.orgId, orgA.userId), false, "userA cannot delete userB's item")
    assert.ok(await repo.getItem(itemB.id, orgA.orgId, userB), "userB still has their own item, untouched by userA's attempts")
  })

  it("cross-ORG isolation still holds — a different org's user cannot reach either user's item, S5 did not weaken it", async () => {
    const orgA = await createTenant("s5-crossorg-a")
    const orgC = await createTenant("s5-crossorg-c")
    const itemA = await save(orgA, `https://example.com/s5-crossorg-${randomBytes(6).toString("hex")}`)

    assert.equal(await repo.getItem(itemA.id, orgC.orgId, orgC.userId), null, "a different org, even with a real user id, gets nothing")
    // Even guessing userA's own real userId against the wrong org fails — org_id is still checked.
    assert.equal(await repo.getItem(itemA.id, orgC.orgId, orgA.userId), null)
  })
})
