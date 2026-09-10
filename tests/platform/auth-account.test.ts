/* ================================================================== *
 * ACCOUNT LIFECYCLE — the layer that had no tests at all.
 *
 * Everything under lib/auth-password.ts and the account/reset
 * functions in lib/db/repo.ts was, until this file, verified only by
 * reading it. That is the wrong place for that: these functions decide
 * whether a password is checkable, whether a reset link can be spent
 * twice, and whether one person's email can be used to reach another
 * person's account. Each of those is a security property, and a
 * security property nobody exercises is a claim, not a guarantee.
 *
 * Real bcrypt, real PostgreSQL, real transactions. No mocks: the
 * behaviour under test IS the SQL and the hashing, and a fake of
 * either would assert nothing about the thing that ships.
 *
 * Nothing here needs, reads, or invents a credential.
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import { closeTestPool, getTestPool, prepareDatabase } from "../helpers/db"
import { generateResetToken, hashPassword, hashToken, isPasswordAcceptable, verifyPassword } from "@/lib/auth-password"
import {
  createPasswordResetToken,
  createUserWithOrganization,
  findOrCreateOAuthUser,
  getPrimaryOrgForUser,
  getUserByEmail,
  getValidResetToken,
  resetPasswordWithToken,
  userBelongsToOrg,
} from "@/lib/db/repo"

before(async () => {
  await prepareDatabase()
})
after(async () => {
  await closeTestPool()
})

/** A fresh address per test, so tests never collide on the unique index. */
function freshEmail(label: string): string {
  return `${label}-${randomUUID()}@example.test`
}

/* ================================================================== *
 * PASSWORD HASHING
 * ================================================================== */

describe("password hashing", () => {
  it("never stores the password itself", async () => {
    const password = "correct horse battery staple"
    const hash = await hashPassword(password)

    assert.ok(!hash.includes(password), "the hash must not contain the plaintext")
    assert.match(hash, /^\$2[aby]\$/, "expected a bcrypt hash")
    assert.ok(hash.length >= 55)
  })

  it("uses a real cost factor, not a fast default", async () => {
    // The whole value of bcrypt is that it is slow. A hash written at
    // cost 4 verifies identically and is worthless against an offline
    // attacker, and nothing else in the code would notice.
    const hash = await hashPassword("whatever")
    const cost = Number(hash.split("$")[2])
    assert.ok(cost >= 12, `bcrypt cost is ${cost}, expected at least 12`)
  })

  it("salts — the same password twice yields different hashes, both valid", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")])
    assert.notEqual(a, b, "two hashes of one password must differ, or the salt is not doing its job")
    assert.equal(await verifyPassword("same-password", a), true)
    assert.equal(await verifyPassword("same-password", b), true)
  })

  it("accepts the right password and rejects everything else", async () => {
    const hash = await hashPassword("the-real-password")
    assert.equal(await verifyPassword("the-real-password", hash), true)
    for (const wrong of ["the-real-passwor", "the-real-password ", "The-Real-Password", "", "x"]) {
      assert.equal(await verifyPassword(wrong, hash), false, `accepted: ${JSON.stringify(wrong)}`)
    }
  })

  it("enforces a length floor and nothing it cannot actually enforce", () => {
    assert.equal(isPasswordAcceptable("12345678"), true)
    assert.equal(isPasswordAcceptable("1234567"), false)
    assert.equal(isPasswordAcceptable(""), false)
    assert.equal(isPasswordAcceptable(undefined as unknown as string), false)
    assert.equal(isPasswordAcceptable(12345678 as unknown as string), false)
  })
})

/* ================================================================== *
 * SIGN-UP
 * ================================================================== */

describe("sign-up", () => {
  it("creates user, organization and membership together", async () => {
    const email = freshEmail("signup")
    const { user, org } = await createUserWithOrganization(email, await hashPassword("password123"), "Test Org")

    assert.equal(user.email, email)
    assert.equal(org.name, "Test Org")
    // A user without an organization cannot be authorized for anything —
    // requireSession() rejects a session with no org. The three rows have
    // to arrive together or not at all.
    assert.equal(await userBelongsToOrg(user.id, org.id), true)
    const primary = await getPrimaryOrgForUser(user.id)
    assert.equal(primary?.id, org.id)
  })

  it("normalizes the email so one address is one account", async () => {
    // The failure this prevents: signing up as User@X and then being
    // unable to sign in as user@X, or worse, ending up with two
    // accounts for one person and a library split between them.
    const raw = `Mixed-${randomUUID()}@Example.TEST`
    const { user } = await createUserWithOrganization(raw, await hashPassword("password123"), "Case Org")

    assert.equal(user.email, raw.toLowerCase())
    assert.ok(await getUserByEmail(raw), "the original casing must resolve")
    assert.ok(await getUserByEmail(raw.toLowerCase()), "the lowercase form must resolve")
    assert.ok(await getUserByEmail(`  ${raw.toUpperCase()}  `), "surrounding whitespace must not create a miss")
  })

  it("the database itself refuses a duplicate address", async () => {
    // The route checks for an existing user first, but two concurrent
    // signups can both pass that check. The unique index is what makes
    // "one address, one account" true rather than merely likely.
    const email = freshEmail("dupe")
    await createUserWithOrganization(email, await hashPassword("password123"), "First")

    const secondHash = await hashPassword("password456")
    await assert.rejects(() => createUserWithOrganization(email, secondHash, "Second"), /duplicate key|unique/i)
  })

  it("a rejected duplicate leaves no orphan organization behind", async () => {
    const email = freshEmail("orphan")
    await createUserWithOrganization(email, await hashPassword("password123"), "Kept Org")
    await createUserWithOrganization(email, await hashPassword("password456"), "Rolled Back Org").catch(() => undefined)

    // The user insert runs first inside the transaction, so the failure
    // rolls back before the org row commits. If it did not, every
    // duplicate signup attempt would litter an unreachable organization.
    const orphans = await getTestPool().query("SELECT id FROM organizations WHERE name = $1", ["Rolled Back Org"])
    assert.equal(orphans.rowCount, 0)
  })
})

/* ================================================================== *
 * CREDENTIALS SIGN-IN — the authorize() path, exercised directly
 * ================================================================== */

describe("credentials sign-in", () => {
  it("verifies a real account's password against the stored hash", async () => {
    const email = freshEmail("login")
    await createUserWithOrganization(email, await hashPassword("password123"), "Login Org")

    const user = await getUserByEmail(email)
    assert.ok(user?.passwordHash)
    assert.equal(await verifyPassword("password123", user.passwordHash), true)
    assert.equal(await verifyPassword("password124", user.passwordHash), false)
  })

  it("an unknown address resolves to nothing — there is no fallback account", async () => {
    assert.equal(await getUserByEmail(freshEmail("ghost")), null)
  })

  it("an OAuth-only account has no password to check", async () => {
    // authorize() returns null when passwordHash is absent. If it
    // instead fell through, a Google-only account would be reachable
    // with any password at all.
    const email = freshEmail("oauth-only")
    const { user } = await findOrCreateOAuthUser({ email, displayName: "OAuth Person", imageUrl: null })

    const fetched = await getUserByEmail(user.email)
    assert.equal(fetched?.passwordHash, null)
    assert.equal(fetched?.authProvider, "google")
  })
})

/* ================================================================== *
 * GOOGLE IDENTITY MAPPING
 * ================================================================== */

describe("google identity mapping", () => {
  it("provisions a user and organization on first sign-in", async () => {
    const email = freshEmail("g-new")
    const { user, org } = await findOrCreateOAuthUser({ email, displayName: "New Person", imageUrl: "https://img.test/a.png" })

    assert.equal(user.email, email)
    assert.equal(await userBelongsToOrg(user.id, org.id), true)
  })

  it("returns the same account on a second sign-in — it never forks a duplicate", async () => {
    const email = freshEmail("g-repeat")
    const first = await findOrCreateOAuthUser({ email, displayName: "P", imageUrl: null })
    const second = await findOrCreateOAuthUser({ email, displayName: "P", imageUrl: null })

    assert.equal(second.user.id, first.user.id)
    assert.equal(second.org.id, first.org.id)
  })

  it("links to an existing password account without disturbing its password", async () => {
    // This is the account-linking path. It must attach the Google
    // identity to the account that already exists — and must NOT clear,
    // replace, or bypass the password that account already has.
    const email = freshEmail("g-link")
    const created = await createUserWithOrganization(email, await hashPassword("password123"), "Existing Org")

    const linked = await findOrCreateOAuthUser({ email, displayName: "Same Person", imageUrl: null })
    assert.equal(linked.user.id, created.user.id, "linking must not create a second account")
    assert.equal(linked.org.id, created.org.id, "linking must not create a second organization")

    const after = await getUserByEmail(email)
    assert.ok(after?.passwordHash)
    assert.equal(await verifyPassword("password123", after.passwordHash), true, "the local password must still work")
    assert.equal(after.authProvider, "credentials", "linking must not rewrite how the account was created")
  })

  it("matches case-insensitively, so Google casing cannot fork an account", async () => {
    const email = freshEmail("g-case")
    const created = await createUserWithOrganization(email, await hashPassword("password123"), "Case Org")
    const linked = await findOrCreateOAuthUser({ email: email.toUpperCase(), displayName: null, imageUrl: null })
    assert.equal(linked.user.id, created.user.id)
  })
})

/* ================================================================== *
 * PASSWORD RESET
 * ================================================================== */

describe("password reset tokens", () => {
  it("stores only a hash — the raw token is never persisted", async () => {
    const email = freshEmail("reset-store")
    const { user } = await createUserWithOrganization(email, await hashPassword("password123"), "Reset Org")
    const { token, tokenHash } = generateResetToken()
    await createPasswordResetToken(user.id, tokenHash, 60_000)

    const stored = await getTestPool().query("SELECT token_hash FROM password_reset_tokens WHERE user_id = $1", [user.id])
    assert.equal(stored.rows.length, 1)
    assert.equal(stored.rows[0].token_hash, tokenHash)
    assert.notEqual(stored.rows[0].token_hash, token, "the raw token must never be what is stored")
    // A database leak must not yield usable links.
    assert.equal(hashToken(token), tokenHash)
  })

  it("mints tokens with real entropy, never repeating", () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i += 1) seen.add(generateResetToken().token)
    assert.equal(seen.size, 200)
    // 32 random bytes, base64url — 43 characters, no padding.
    assert.ok(generateResetToken().token.length >= 43)
  })

  it("accepts a live token and rejects an expired one", async () => {
    const email = freshEmail("reset-ttl")
    const { user } = await createUserWithOrganization(email, await hashPassword("password123"), "TTL Org")

    const live = generateResetToken()
    await createPasswordResetToken(user.id, live.tokenHash, 60_000)
    assert.ok(await getValidResetToken(live.tokenHash))

    const dead = generateResetToken()
    await createPasswordResetToken(user.id, dead.tokenHash, -1_000) // already past
    assert.equal(await getValidResetToken(dead.tokenHash), null)
  })

  it("rejects a token that was never issued", async () => {
    assert.equal(await getValidResetToken(hashToken("not-a-real-token")), null)
  })

  it("changes the password, and only for the token's own owner", async () => {
    const victimEmail = freshEmail("reset-victim")
    const otherEmail = freshEmail("reset-other")
    const { user: victim } = await createUserWithOrganization(victimEmail, await hashPassword("old-password"), "V")
    const { user: other } = await createUserWithOrganization(otherEmail, await hashPassword("other-password"), "O")

    const { tokenHash } = generateResetToken()
    await createPasswordResetToken(victim.id, tokenHash, 60_000)
    assert.equal(await resetPasswordWithToken(tokenHash, await hashPassword("new-password")), true)

    const updated = await getUserByEmail(victimEmail)
    assert.equal(await verifyPassword("new-password", updated!.passwordHash!), true)
    assert.equal(await verifyPassword("old-password", updated!.passwordHash!), false, "the old password must stop working")

    const untouched = await getUserByEmail(otherEmail)
    assert.equal(await verifyPassword("other-password", untouched!.passwordHash!), true, "another account must be untouched")
    assert.ok(other.id !== victim.id)
  })

  it("is single-use — a spent token cannot be replayed", async () => {
    const email = freshEmail("reset-replay")
    const { user } = await createUserWithOrganization(email, await hashPassword("old-password"), "R")
    const { tokenHash } = generateResetToken()
    await createPasswordResetToken(user.id, tokenHash, 60_000)

    assert.equal(await resetPasswordWithToken(tokenHash, await hashPassword("first-new")), true)
    assert.equal(await resetPasswordWithToken(tokenHash, await hashPassword("attacker-chosen")), false)

    const after = await getUserByEmail(email)
    assert.equal(await verifyPassword("first-new", after!.passwordHash!), true)
    assert.equal(await verifyPassword("attacker-chosen", after!.passwordHash!), false)
  })

  it("refuses an expired token even with the correct hash", async () => {
    const email = freshEmail("reset-expired")
    const { user } = await createUserWithOrganization(email, await hashPassword("old-password"), "E")
    const { tokenHash } = generateResetToken()
    await createPasswordResetToken(user.id, tokenHash, -1_000)

    assert.equal(await resetPasswordWithToken(tokenHash, await hashPassword("should-not-apply")), false)
    const after = await getUserByEmail(email)
    assert.equal(await verifyPassword("old-password", after!.passwordHash!), true)
  })

  it("burns every outstanding token for that user, not just the one spent", async () => {
    // Someone requests a reset twice — the second because the first
    // went somewhere they no longer control. Completing one reset has
    // to close the other door too, or the older link is still a live
    // account-takeover for the rest of its hour.
    const email = freshEmail("reset-siblings")
    const { user } = await createUserWithOrganization(email, await hashPassword("old-password"), "S")

    const older = generateResetToken()
    const newer = generateResetToken()
    await createPasswordResetToken(user.id, older.tokenHash, 60_000)
    await createPasswordResetToken(user.id, newer.tokenHash, 60_000)

    assert.equal(await resetPasswordWithToken(newer.tokenHash, await hashPassword("chosen-by-owner")), true)
    assert.equal(await getValidResetToken(older.tokenHash), null, "the older link must be dead")
    assert.equal(
      await resetPasswordWithToken(older.tokenHash, await hashPassword("chosen-by-attacker")),
      false,
      "the older link must not be spendable",
    )

    const after = await getUserByEmail(email)
    assert.equal(await verifyPassword("chosen-by-owner", after!.passwordHash!), true)
  })

  it("does not burn a DIFFERENT user's outstanding token", async () => {
    const aEmail = freshEmail("reset-scope-a")
    const bEmail = freshEmail("reset-scope-b")
    const { user: a } = await createUserWithOrganization(aEmail, await hashPassword("a-password"), "A")
    const { user: b } = await createUserWithOrganization(bEmail, await hashPassword("b-password"), "B")

    const aToken = generateResetToken()
    const bToken = generateResetToken()
    await createPasswordResetToken(a.id, aToken.tokenHash, 60_000)
    await createPasswordResetToken(b.id, bToken.tokenHash, 60_000)

    await resetPasswordWithToken(aToken.tokenHash, await hashPassword("a-new-password"))
    assert.ok(await getValidResetToken(bToken.tokenHash), "one user's reset must not invalidate another's")
  })

  it("setting a password on an OAuth-only account enables credentials sign-in", async () => {
    const email = freshEmail("reset-oauth")
    const { user } = await findOrCreateOAuthUser({ email, displayName: null, imageUrl: null })
    assert.equal((await getUserByEmail(email))?.passwordHash, null)

    const { tokenHash } = generateResetToken()
    await createPasswordResetToken(user.id, tokenHash, 60_000)
    assert.equal(await resetPasswordWithToken(tokenHash, await hashPassword("now-has-one")), true)

    const after = await getUserByEmail(email)
    assert.equal(await verifyPassword("now-has-one", after!.passwordHash!), true)
  })
})

/* ================================================================== *
 * MEMBERSHIP — what requireSession() re-verifies on every request
 * ================================================================== */

describe("organization membership", () => {
  it("is true only for a real membership row", async () => {
    const { user: a, org: orgA } = await createUserWithOrganization(freshEmail("mem-a"), await hashPassword("password123"), "Org A")
    const { user: b, org: orgB } = await createUserWithOrganization(freshEmail("mem-b"), await hashPassword("password123"), "Org B")

    assert.equal(await userBelongsToOrg(a.id, orgA.id), true)
    assert.equal(await userBelongsToOrg(b.id, orgB.id), true)

    // The forged-cookie case: a session claiming the other tenant's org.
    // requireSession() calls exactly this, and throws when it is false.
    assert.equal(await userBelongsToOrg(a.id, orgB.id), false)
    assert.equal(await userBelongsToOrg(b.id, orgA.id), false)
  })

  it("is false for ids that do not exist at all", async () => {
    assert.equal(await userBelongsToOrg("user_nope", "org_nope"), false)
    assert.equal(await userBelongsToOrg("", ""), false)
  })
})
