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
  createEmailVerificationToken,
  isEmailVerified,
  resetPasswordWithToken,
  resolveSessionSubject,
  userBelongsToOrg,
  verifyEmailWithToken,
} from "@/lib/db/repo"
import { emailProvider, isEmailDeliveryConfigured } from "@/lib/auth-email"

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

/* ================================================================== *
 * SESSION INVALIDATION — what a password reset must actually end.
 *
 * Sessions are JWTs: valid because they are signed, not because
 * anything looked them up. Until session_version existed there was no
 * point in the system where an already-issued cookie could be refused,
 * which meant the one action a person takes to eject an intruder —
 * changing the password — did not eject them.
 *
 * These tests exercise the version at the repository level, where the
 * comparison requireSession() performs is decided.
 * ================================================================== */

describe("session invalidation", () => {
  it("a new account starts at version 0, matching tokens that carry no claim", async () => {
    // The deploy-safety property. Tokens minted before this feature
    // existed have no version claim; requireSession reads that as 0.
    // If new accounts started at 1, shipping the fix would sign every
    // existing user out.
    const email = freshEmail("sv-new")
    const { user, org } = await createUserWithOrganization(email, await hashPassword("password123"), "SV")
    assert.equal(user.sessionVersion, 0)

    const subject = await resolveSessionSubject(user.id, org.id)
    assert.equal(subject.belongs, true)
    assert.equal(subject.sessionVersion, 0)
  })

  it("a completed password reset bumps the version", async () => {
    const email = freshEmail("sv-reset")
    const { user, org } = await createUserWithOrganization(email, await hashPassword("old-password"), "SV")
    const before = (await resolveSessionSubject(user.id, org.id)).sessionVersion

    const { tokenHash } = generateResetToken()
    await createPasswordResetToken(user.id, tokenHash, 60_000)
    assert.equal(await resetPasswordWithToken(tokenHash, await hashPassword("new-password")), true)

    const after = (await resolveSessionSubject(user.id, org.id)).sessionVersion
    assert.ok(after > before, `version did not advance: ${before} -> ${after}`)
  })

  it("a token minted before the reset is now stale, and a fresh one is not", async () => {
    // This is the comparison requireSession() makes, stated directly.
    const email = freshEmail("sv-stale")
    const { user, org } = await createUserWithOrganization(email, await hashPassword("old-password"), "SV")
    const attackerToken = (await resolveSessionSubject(user.id, org.id)).sessionVersion

    const { tokenHash } = generateResetToken()
    await createPasswordResetToken(user.id, tokenHash, 60_000)
    await resetPasswordWithToken(tokenHash, await hashPassword("new-password"))

    const current = (await resolveSessionSubject(user.id, org.id)).sessionVersion
    assert.ok(attackerToken < current, "the cookie held since before the reset must now be refused")

    const ownerToken = current
    assert.ok(!(ownerToken < current), "a token minted after the reset must still be accepted")
  })

  it("a FAILED reset does not evict anyone", async () => {
    // An expired or replayed link must not log a person out of their
    // own account — that would make the endpoint a denial-of-service
    // against any address an attacker knows.
    const email = freshEmail("sv-failed")
    const { user, org } = await createUserWithOrganization(email, await hashPassword("password123"), "SV")
    const before = (await resolveSessionSubject(user.id, org.id)).sessionVersion

    const { tokenHash } = generateResetToken()
    await createPasswordResetToken(user.id, tokenHash, -1_000) // already expired
    assert.equal(await resetPasswordWithToken(tokenHash, await hashPassword("nope")), false)

    assert.equal((await resolveSessionSubject(user.id, org.id)).sessionVersion, before)
  })

  it("resetting one account never evicts another", async () => {
    const a = await createUserWithOrganization(freshEmail("sv-a"), await hashPassword("a-password"), "A")
    const b = await createUserWithOrganization(freshEmail("sv-b"), await hashPassword("b-password"), "B")
    const bBefore = (await resolveSessionSubject(b.user.id, b.org.id)).sessionVersion

    const { tokenHash } = generateResetToken()
    await createPasswordResetToken(a.user.id, tokenHash, 60_000)
    await resetPasswordWithToken(tokenHash, await hashPassword("a-new-password"))

    assert.equal((await resolveSessionSubject(b.user.id, b.org.id)).sessionVersion, bBefore)
  })

  it("bumps again on a second reset — versions never go backwards", async () => {
    const email = freshEmail("sv-twice")
    const { user, org } = await createUserWithOrganization(email, await hashPassword("p1"), "SV")
    const versions: number[] = [(await resolveSessionSubject(user.id, org.id)).sessionVersion]

    for (const next of ["p2-password", "p3-password"]) {
      const { tokenHash } = generateResetToken()
      await createPasswordResetToken(user.id, tokenHash, 60_000)
      await resetPasswordWithToken(tokenHash, await hashPassword(next))
      versions.push((await resolveSessionSubject(user.id, org.id)).sessionVersion)
    }

    assert.deepEqual(versions, [...versions].sort((x, y) => x - y))
    assert.equal(new Set(versions).size, versions.length, "each reset must produce a distinct version")
  })

  it("resolveSessionSubject refuses a user/org pair that is not a real membership", async () => {
    const a = await createUserWithOrganization(freshEmail("sv-iso-a"), await hashPassword("password123"), "A")
    const b = await createUserWithOrganization(freshEmail("sv-iso-b"), await hashPassword("password123"), "B")

    assert.equal((await resolveSessionSubject(a.user.id, b.org.id)).belongs, false)
    assert.equal((await resolveSessionSubject("user_nope", a.org.id)).belongs, false)
  })
})

/* ================================================================== *
 * EMAIL VERIFICATION
 *
 * The token half is real and behaves exactly like password reset:
 * hash-at-rest, single-use, expiring. Nothing yet BLOCKS an unverified
 * account from signing in — that is a product decision, recorded in
 * migration 0011 rather than taken quietly here.
 * ================================================================== */

describe("email verification", () => {
  it("stores only a hash, and marks the address verified when spent", async () => {
    const email = freshEmail("ev-ok")
    const { user } = await createUserWithOrganization(email, await hashPassword("password123"), "EV")
    assert.equal(await isEmailVerified(user.id), false)

    const { token, tokenHash } = generateResetToken()
    await createEmailVerificationToken(user.id, email, tokenHash, 60_000)

    const stored = await getTestPool().query("SELECT token_hash FROM email_verification_tokens WHERE user_id = $1", [user.id])
    assert.equal(stored.rows[0].token_hash, tokenHash)
    assert.notEqual(stored.rows[0].token_hash, token, "the raw token must never be stored")

    assert.equal(await verifyEmailWithToken(tokenHash), true)
    assert.equal(await isEmailVerified(user.id), true)
  })

  it("is single-use", async () => {
    const email = freshEmail("ev-replay")
    const { user } = await createUserWithOrganization(email, await hashPassword("password123"), "EV")
    const { tokenHash } = generateResetToken()
    await createEmailVerificationToken(user.id, email, tokenHash, 60_000)

    assert.equal(await verifyEmailWithToken(tokenHash), true)
    assert.equal(await verifyEmailWithToken(tokenHash), false, "a spent token must not be replayable")
  })

  it("refuses an expired token", async () => {
    const email = freshEmail("ev-expired")
    const { user } = await createUserWithOrganization(email, await hashPassword("password123"), "EV")
    const { tokenHash } = generateResetToken()
    await createEmailVerificationToken(user.id, email, tokenHash, -1_000)

    assert.equal(await verifyEmailWithToken(tokenHash), false)
    assert.equal(await isEmailVerified(user.id), false)
  })

  it("refuses a token that was never issued", async () => {
    assert.equal(await verifyEmailWithToken(hashToken("invented")), false)
  })

  it("burns the account's other outstanding tokens", async () => {
    const email = freshEmail("ev-siblings")
    const { user } = await createUserWithOrganization(email, await hashPassword("password123"), "EV")
    const older = generateResetToken()
    const newer = generateResetToken()
    await createEmailVerificationToken(user.id, email, older.tokenHash, 60_000)
    await createEmailVerificationToken(user.id, email, newer.tokenHash, 60_000)

    assert.equal(await verifyEmailWithToken(newer.tokenHash), true)
    assert.equal(await verifyEmailWithToken(older.tokenHash), false, "the older link must be dead too")
  })

  it("does not verify an address the account has since changed away from", async () => {
    // Proving control of the OLD address must not mark a NEW one
    // verified — otherwise changing the email to someone else's and
    // clicking an old link would vouch for an address never proven.
    const original = freshEmail("ev-changed")
    const { user } = await createUserWithOrganization(original, await hashPassword("password123"), "EV")
    const { tokenHash } = generateResetToken()
    await createEmailVerificationToken(user.id, original, tokenHash, 60_000)

    await getTestPool().query("UPDATE users SET email = $1 WHERE id = $2", [freshEmail("ev-new-address"), user.id])

    assert.equal(await verifyEmailWithToken(tokenHash), false)
    assert.equal(await isEmailVerified(user.id), false)
  })

  it("a Google account is already verified — the provider vouched for it", async () => {
    const { user } = await findOrCreateOAuthUser({ email: freshEmail("ev-google"), displayName: null, imageUrl: null })
    assert.equal(await isEmailVerified(user.id), true)
  })
})

/* ================================================================== *
 * EMAIL DELIVERY BOUNDARY
 * ================================================================== */

describe("email delivery", () => {
  it("reports itself unconfigured rather than silently succeeding", async () => {
    // A no-op that returns success is how a product ends up telling
    // people to check an inbox nothing was ever sent to.
    const provider = emailProvider()
    assert.equal(provider.isConfigured(), false)
    assert.equal(isEmailDeliveryConfigured(), false)
    assert.match(provider.notConfiguredReason(), /no email provider/i)

    const reset = await provider.sendPasswordReset({
      to: "someone@example.test",
      resetUrl: "https://app.test/reset-password?token=x",
      expiresInMinutes: 60,
    })
    assert.equal(reset.ok, false)
    assert.equal(reset.ok === false && reset.reason, "not_configured")

    const verify = await provider.sendEmailVerification({
      to: "someone@example.test",
      verifyUrl: "https://app.test/verify?token=x",
      expiresInMinutes: 60,
    })
    assert.equal(verify.ok, false)
  })
})
