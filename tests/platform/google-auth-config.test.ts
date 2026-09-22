/* ================================================================== *
 * GOOGLE OAUTH VISIBILITY — a setting that could silently do nothing.
 *
 * The bug this guards was not in the predicate; it was in WHEN the
 * predicate ran. lib/auth.ts answered "is Google configured?" in a
 * module-level const, and because /login and /signup were prerendered,
 * that meant at BUILD time. The answer was baked into login.rsc as
 * `"googleEnabled":false`, and setting GOOGLE_CLIENT_ID in production
 * changed nothing — no error, no log, just a button that never
 * appeared.
 *
 * So there are two things to hold: the predicate itself, which a unit
 * test can check, and the rendering mode, which it cannot. The second
 * is asserted from the page sources — the technique this repo already
 * uses for files that import next/server (see tests/knowledge/
 * tick.test.ts's header). It is weaker than execution and it is the
 * only thing standing between this fix and its silent reversal: drop
 * `force-dynamic` and every unit test here still passes.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { googleAuthConfigured, isVerifiedOAuthEmail } from "@/lib/auth-features"

describe("googleAuthConfigured", () => {
  it("is true only when BOTH credentials are present", () => {
    assert.equal(googleAuthConfigured({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }), true)
    assert.equal(googleAuthConfigured({ GOOGLE_CLIENT_ID: "id" }), false)
    assert.equal(googleAuthConfigured({ GOOGLE_CLIENT_SECRET: "secret" }), false)
    assert.equal(googleAuthConfigured({}), false)
  })

  it("treats an empty string as unset", () => {
    // A platform that renders a missing variable as "" would otherwise
    // show a button that cannot work.
    assert.equal(googleAuthConfigured({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "secret" }), false)
    assert.equal(googleAuthConfigured({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "" }), false)
  })

  it("reads the environment on every call, not once", () => {
    const env: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string } = {}
    assert.equal(googleAuthConfigured(env), false)
    env.GOOGLE_CLIENT_ID = "id"
    env.GOOGLE_CLIENT_SECRET = "secret"
    assert.equal(googleAuthConfigured(env), true, "the answer must follow the environment")
  })

  it("defaults to the real process environment", () => {
    // No argument is the production call shape; it must not throw.
    assert.equal(typeof googleAuthConfigured(), "boolean")
  })
})

describe("the auth pages must render per request", () => {
  const pages = ["app/login/page.tsx", "app/signup/page.tsx"]

  for (const page of pages) {
    const source = readFileSync(join(process.cwd(), page), "utf8")

    it(`${page} opts out of prerendering`, () => {
      // Without this the page calls googleAuthConfigured() at build
      // time and freezes the answer, which is the entire bug.
      assert.match(source, /export const dynamic = "force-dynamic"/)
    })

    it(`${page} reads the flag per request`, () => {
      assert.match(source, /googleAuthConfigured\(\)/, "the flag must be CALLED, not imported as a value")
    })

    it(`${page} does not import the build-time constant or Auth.js`, () => {
      // Importing @/lib/auth also drags NextAuth and the database
      // layer into the page's graph, which lib/auth-features exists to
      // avoid.
      assert.doesNotMatch(source, /from "@\/lib\/auth"/)
      assert.doesNotMatch(source, /isGoogleConfigured/)
    })
  }
})

/* ================================================================== *
 * OAUTH IDENTITY TRUST — isVerifiedOAuthEmail
 *
 * lib/auth.ts registers Google with allowDangerousEmailAccountLinking,
 * so the email claim is the ENTIRE proof that this Google identity may
 * take over an existing Whitehabbit account — including one whose real
 * owner has a password and has never used Google.
 *
 * That makes `email_verified` load-bearing, and makes the permissive
 * reading of a missing claim an account-takeover path rather than a
 * convenience. These tests pin the strict reading in place.
 * ================================================================== */

describe("isVerifiedOAuthEmail", () => {
  it("accepts an address the provider says it verified", () => {
    assert.equal(isVerifiedOAuthEmail({ email: "person@example.com", email_verified: true }), true)
    // Some providers stringify the boolean.
    assert.equal(isVerifiedOAuthEmail({ email: "person@example.com", email_verified: "true" }), true)
  })

  it("refuses an address the provider says it did NOT verify", () => {
    assert.equal(isVerifiedOAuthEmail({ email: "victim@example.com", email_verified: false }), false)
    assert.equal(isVerifiedOAuthEmail({ email: "victim@example.com", email_verified: "false" }), false)
  })

  it("refuses a MISSING claim rather than assuming consent", () => {
    // The important one. An identity provider that will not say the
    // address is verified has not verified it, and this is the single
    // decision where guessing permissively hands over an account.
    assert.equal(isVerifiedOAuthEmail({ email: "victim@example.com" }), false)
    assert.equal(isVerifiedOAuthEmail({ email: "victim@example.com", email_verified: undefined }), false)
    assert.equal(isVerifiedOAuthEmail({ email: "victim@example.com", email_verified: null }), false)
  })

  it("is not fooled by a truthy non-boolean", () => {
    for (const truthy of [1, "yes", "1", {}, [], "TRUE", "True"]) {
      assert.equal(
        isVerifiedOAuthEmail({ email: "victim@example.com", email_verified: truthy }),
        false,
        `accepted ${JSON.stringify(truthy)} as verification`,
      )
    }
  })

  it("refuses a profile with no usable address at all", () => {
    assert.equal(isVerifiedOAuthEmail(null), false)
    assert.equal(isVerifiedOAuthEmail(undefined), false)
    assert.equal(isVerifiedOAuthEmail({}), false)
    assert.equal(isVerifiedOAuthEmail({ email_verified: true }), false)
    assert.equal(isVerifiedOAuthEmail({ email: "", email_verified: true }), false)
    assert.equal(isVerifiedOAuthEmail({ email: "   ", email_verified: true }), false)
    assert.equal(isVerifiedOAuthEmail({ email: 42, email_verified: true }), false)
  })
})
