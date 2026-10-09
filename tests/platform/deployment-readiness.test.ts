/* ================================================================== *
 * A HALF-CONFIGURED DEPLOYMENT MUST NAME WHAT IS MISSING.
 *
 * Each check composed here already existed and was answerable only
 * where it was used, so a deployment missing two variables failed in
 * five unrelated places with five unrelated messages, none naming a
 * variable. These cover the composition — and the one property that
 * makes the result safe to put on a screen: it reports NAMES, never
 * values, lengths or prefixes.
 * ================================================================== */

import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { deploymentReadiness } from "@/lib/deployment-readiness"

const KEYS = [
  "DATABASE_URL",
  "NEON_DATABASE_URL",
  "POSTGRES_URL",
  "NEON_DATABASE_URL_UNPOOLED",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "GEMINI_API_KEY",
  "GEMINI_EMBEDDING_MODEL",
  "GEMINI_MODEL",
  "ANTHROPIC_API_KEY",
  "LLM_PROVIDER",
  "CRON_SECRET",
] as const

const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))

/** Assigning `undefined` to process.env stores the STRING "undefined",
 *  which is truthy — so a spread like `{ ...COMPLETE, X: undefined }`
 *  would silently leave X set and the test would assert nothing. An
 *  undefined value here means UNSET. */
function env(set: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const k of KEYS) delete process.env[k]
  for (const [k, v] of Object.entries(set)) {
    if (v !== undefined) process.env[k] = v
  }
}

/** Everything set, with Gemini as the text provider. */
const COMPLETE = {
  DATABASE_URL: "postgres://x",
  AUTH_SECRET: "s",
  GEMINI_API_KEY: "k",
  GEMINI_EMBEDDING_MODEL: "an-embedding-model",
  GEMINI_MODEL: "a-model",
  LLM_PROVIDER: "gemini",
  CRON_SECRET: "c",
} as const

function check(id: string) {
  return deploymentReadiness().checks.find((c) => c.id === id)!
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe("deploymentReadiness", () => {
  it("is ready when every piece is configured", () => {
    env(COMPLETE)
    const result = deploymentReadiness()
    assert.equal(result.ready, true)
    assert.ok(result.checks.every((c) => c.ok && c.missing.length === 0))
  })

  it("is not ready when any single piece is missing", () => {
    for (const key of ["DATABASE_URL", "AUTH_SECRET", "GEMINI_EMBEDDING_MODEL", "CRON_SECRET"] as const) {
      const partial = { ...COMPLETE } as Record<string, string>
      delete partial[key]
      env(partial)
      assert.equal(deploymentReadiness().ready, false, `missing ${key} should not be ready`)
    }
  })

  it("names BOTH embedding variables, not just the one checked first", () => {
    // The provider requires both. Naming one would send someone back
    // for a second round after the first redeploy.
    env({ ...COMPLETE, GEMINI_EMBEDDING_MODEL: undefined })
    assert.deepEqual(check("embeddings").missing, ["GEMINI_API_KEY", "GEMINI_EMBEDDING_MODEL"])
  })

  it("names the variables of the provider that is actually selected", () => {
    // LLM_PROVIDER decides which credential matters. Reporting the
    // other provider's variable would be a wrong instruction.
    env({ ...COMPLETE, LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: undefined })
    assert.ok(check("textModel").missing.includes("ANTHROPIC_API_KEY"))
    assert.ok(!check("textModel").missing.includes("GEMINI_MODEL"))

    env({ ...COMPLETE, GEMINI_MODEL: undefined })
    assert.ok(check("textModel").missing.includes("GEMINI_MODEL"))
    assert.ok(!check("textModel").missing.includes("ANTHROPIC_API_KEY"))
  })

  it("defaults the text provider to anthropic when LLM_PROVIDER is unset", () => {
    // Matches lib/ai/llm's own DEFAULT_PROVIDER_ID. A deployment
    // holding only a Gemini key is NOT configured until it says so,
    // and the check has to reflect that or it would report ready.
    env({ DATABASE_URL: "postgres://x", AUTH_SECRET: "s", GEMINI_API_KEY: "k", CRON_SECRET: "c" })
    assert.equal(check("textModel").ok, false)
    assert.ok(check("textModel").missing.includes("ANTHROPIC_API_KEY"))
    assert.ok(check("textModel").missing.includes("LLM_PROVIDER"))
  })

  it("reports an unrecognised provider as a provider problem", () => {
    env({ ...COMPLETE, LLM_PROVIDER: "not-a-provider" })
    assert.deepEqual(check("textModel").missing, ["LLM_PROVIDER"])
  })

  it("says what stops working, for every check", () => {
    env({})
    for (const c of deploymentReadiness().checks) {
      assert.ok(c.consequence.length > 0, `${c.id} should say what breaks`)
      assert.ok(c.label.length > 0)
    }
  })

  it("names nothing to set once a check passes", () => {
    env(COMPLETE)
    for (const c of deploymentReadiness().checks) assert.deepEqual(c.missing, [])
  })
})

describe("the report is not a disclosure", () => {
  it("carries no secret value, length or prefix", () => {
    // This is rendered on a screen a signed-in person can open. A
    // diagnosis that leaks what it is diagnosing is worse than none.
    const secret = "sk-super-secret-value-9876543210"
    env({
      DATABASE_URL: "postgres://user:hunter2@host/db",
      AUTH_SECRET: secret,
      GEMINI_API_KEY: secret,
      GEMINI_EMBEDDING_MODEL: "an-embedding-model",
      GEMINI_MODEL: "a-model",
      LLM_PROVIDER: "gemini",
      CRON_SECRET: secret,
    })

    const serialized = JSON.stringify(deploymentReadiness())
    assert.doesNotMatch(serialized, /super-secret/)
    assert.doesNotMatch(serialized, /hunter2/)
    assert.doesNotMatch(serialized, /postgres:\/\//)
    assert.doesNotMatch(serialized, new RegExp(String(secret.length)))
  })

  it("leaks nothing through the missing list either", () => {
    // The failure path is the one that formats most, so it is the one
    // most likely to interpolate a value by accident.
    env({})
    const serialized = JSON.stringify(deploymentReadiness())
    for (const c of deploymentReadiness().checks) {
      for (const name of c.missing) {
        assert.match(name, /^[A-Z][A-Z0-9_]*$/, `${name} should be a variable NAME, not a value`)
      }
    }
    assert.doesNotMatch(serialized, /=/, "a name=value pair would mean a value was included")
  })
})
