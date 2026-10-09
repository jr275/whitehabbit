/* ================================================================== *
 * A DEPLOYMENT THAT CANNOT AUTHENTICATE MUST NOT BLAME THE PERSON.
 *
 * Auth.js collapses every authorize() failure into one
 * `CredentialsSignin`, so sign-in could not distinguish a wrong
 * password from a server with no database — and the message it chose
 * accused the person. These cover the readiness report that lets the
 * form choose correctly, and the one property that must never slip:
 * it reports WHETHER a secret is set, never anything about its value.
 * ================================================================== */

import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { authReadiness, canAuthenticate, notConfiguredMessage } from "@/lib/auth-features"

const KEYS = [
  "DATABASE_URL",
  "NEON_DATABASE_URL",
  "POSTGRES_URL",
  "NEON_DATABASE_URL_UNPOOLED",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
] as const

const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))

function env(set: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k]
  for (const [k, v] of Object.entries(set)) process.env[k] = v
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe("authReadiness", () => {
  it("reports both halves present when they are", () => {
    env({ DATABASE_URL: "postgres://x", AUTH_SECRET: "s" })
    assert.deepEqual(authReadiness(), { database: true, sessionSecret: true })
    assert.equal(canAuthenticate(), true)
  })

  it("accepts the database under every name a platform may have set", () => {
    // Vercel + Neon write these, not DATABASE_URL. Reading only the
    // canonical name would report a correctly-configured deployment
    // as broken.
    for (const key of ["NEON_DATABASE_URL", "POSTGRES_URL", "NEON_DATABASE_URL_UNPOOLED"] as const) {
      env({ [key]: "postgres://x", AUTH_SECRET: "s" })
      assert.equal(authReadiness().database, true, `${key} should count as a database`)
    }
  })

  it("accepts NEXTAUTH_SECRET as well as AUTH_SECRET", () => {
    env({ DATABASE_URL: "postgres://x", NEXTAUTH_SECRET: "s" })
    assert.equal(authReadiness().sessionSecret, true)
  })

  it("reports a missing database", () => {
    env({ AUTH_SECRET: "s" })
    assert.deepEqual(authReadiness(), { database: false, sessionSecret: true })
    assert.equal(canAuthenticate(), false)
  })

  it("reports a missing session secret", () => {
    env({ DATABASE_URL: "postgres://x" })
    assert.deepEqual(authReadiness(), { database: true, sessionSecret: false })
    assert.equal(canAuthenticate(), false)
  })
})

describe("notConfiguredMessage", () => {
  it("is null when the deployment can authenticate, so the form says 'incorrect password'", () => {
    env({ DATABASE_URL: "postgres://x", AUTH_SECRET: "s" })
    assert.equal(notConfiguredMessage(), null)
  })

  it("names the database when that is what is missing", () => {
    env({ AUTH_SECRET: "s" })
    const message = notConfiguredMessage()
    assert.match(String(message), /DATABASE_URL/)
    assert.doesNotMatch(String(message), /password/i, "must not blame the person's credentials")
  })

  it("names the session secret when that is what is missing", () => {
    env({ DATABASE_URL: "postgres://x" })
    const message = notConfiguredMessage()
    assert.match(String(message), /AUTH_SECRET/)
    assert.doesNotMatch(String(message), /password/i)
  })

  it("names both when neither is set", () => {
    env({})
    const message = String(notConfiguredMessage())
    assert.match(message, /DATABASE_URL/)
    assert.match(message, /AUTH_SECRET/)
  })
})

describe("the readiness report is not a disclosure", () => {
  it("carries no secret value and no secret length — booleans only", () => {
    const secret = "super-secret-value-9876543210"
    env({ DATABASE_URL: "postgres://user:pw@host/db", AUTH_SECRET: secret })

    const serialized = JSON.stringify(authReadiness())
    assert.doesNotMatch(serialized, /super-secret/)
    assert.doesNotMatch(serialized, /postgres:\/\//)
    assert.doesNotMatch(serialized, new RegExp(String(secret.length)))
    assert.deepEqual(Object.values(authReadiness()).map((v) => typeof v), ["boolean", "boolean"])
  })
})
