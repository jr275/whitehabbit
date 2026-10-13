/* ================================================================== *
 * THE TEST DATABASE GUARD — the one thing between a mistyped
 * environment variable and someone's real data.
 *
 * prepareDatabase() runs DROP SCHEMA public CASCADE. Everything here
 * exists because that statement is unrecoverable and the only thing
 * deciding whether it runs is a string comparison.
 *
 * WHAT THIS FILE PROVES THAT THE OLD ASSERTION DID NOT. The previous
 * check lived in tests/harness.test.ts and read:
 *
 *   assert.match(new URL(TEST_DATABASE_URL).pathname, /test/i)
 *
 * That compares the module's own default constant against a pattern the
 * default was written to satisfy. It is true by construction, passes
 * whatever the guard does, and would keep passing if the guard were
 * deleted outright.
 *
 * NO DATABASE IS TOUCHED HERE. Every target below is a fabricated
 * string, the destructive step is handed a counting fake, and no Pool
 * is ever constructed. A guard test that needs a live database to run
 * is a guard test that cannot run when it matters most.
 *
 * SUBSTRING MATCHING IS THE BUG THIS REPLACES. "latest" and "contest"
 * both contain "test" — the old rule accepted both. Identity is now
 * decided by equality against an allowlist.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  assertDisposableTarget,
  assertNoConflictingConfig,
  resetSchema,
  TEST_DATABASE_URL,
  UnsafeTestTargetError,
} from "../helpers/db"

/** The shape the suite's own default takes: allowlisted database on an
 *  allowlisted host. Credentials are fabricated. */
const PERMITTED = "postgres://postgres:postgres@127.0.0.1:5432/whitehabbit_test"

/** Records every statement it is handed, so a test can assert the
 *  count is zero. A thrown guard error does not prove the destructive
 *  statement went nowhere; this does. */
function countingRunner() {
  const calls: string[] = []
  return {
    calls,
    run: async (sql: string) => {
      calls.push(sql)
      return undefined
    },
  }
}

/* ---- identity, by equality and not by substring ---------------------- */

describe("the guard accepts only an allowlisted target", () => {
  it("accepts the allowlisted database on an allowlisted host", () => {
    assert.doesNotThrow(() => assertDisposableTarget(PERMITTED))
  })

  it("accepts the target this suite is actually configured with", () => {
    // If this fails, the suite is pointed somewhere the guard refuses —
    // which is the guard working, and worth seeing immediately.
    assert.doesNotThrow(() => assertDisposableTarget(TEST_DATABASE_URL))
  })

  it("refuses \"latest\", which the old substring rule accepted", () => {
    assert.throws(
      () => assertDisposableTarget("postgres://u:p@127.0.0.1:5432/latest"),
      (err: unknown) => {
        assert.ok(err instanceof UnsafeTestTargetError)
        assert.match(err.message, /latest/, "the rejected name is useful and not secret")
        return true
      },
    )
  })

  it("refuses \"contest\", likewise", () => {
    assert.throws(
      () => assertDisposableTarget("postgres://u:p@127.0.0.1:5432/contest"),
      UnsafeTestTargetError,
    )
  })

  it("refuses a name that merely starts with the allowlisted one", () => {
    // whitehabbit_testing passes any `includes`/`startsWith` rule.
    assert.throws(
      () => assertDisposableTarget("postgres://u:p@127.0.0.1:5432/whitehabbit_testing"),
      UnsafeTestTargetError,
    )
  })

  it("refuses the production-shaped name outright", () => {
    assert.throws(() => assertDisposableTarget("postgres://u:p@127.0.0.1:5432/neondb"), UnsafeTestTargetError)
  })
})

/* ---- the host matters as much as the name ---------------------------- */

describe("an allowlisted name on a foreign host is still refused", () => {
  it("refuses a remote host carrying the allowlisted database name", () => {
    // The name alone is not the target. This is the case where a copied
    // production URL happens to end in the right database name.
    assert.throws(
      () => assertDisposableTarget("postgres://u:p@db.example.com:5432/whitehabbit_test"),
      (err: unknown) => {
        assert.ok(err instanceof UnsafeTestTargetError)
        assert.match(err.message, /db\.example\.com/)
        return true
      },
    )
  })

  it("accepts localhost and the IPv6 loopback literal", () => {
    assert.doesNotThrow(() => assertDisposableTarget("postgres://u:p@localhost:5432/whitehabbit_test"))
    assert.doesNotThrow(() => assertDisposableTarget("postgres://u:p@[::1]:5432/whitehabbit_test"))
  })
})

/* ---- fail closed on every ambiguity ---------------------------------- */

describe("the guard fails closed when the target cannot be established", () => {
  it("refuses a URL it cannot parse", () => {
    assert.throws(() => assertDisposableTarget("not a url at all"), UnsafeTestTargetError)
  })

  it("refuses a URL that names no database", () => {
    assert.throws(() => assertDisposableTarget("postgres://u:p@127.0.0.1:5432/"), UnsafeTestTargetError)
  })

  it("refuses an unexpected scheme even with an allowlisted name and host", () => {
    assert.throws(
      () => assertDisposableTarget("https://127.0.0.1:5432/whitehabbit_test"),
      UnsafeTestTargetError,
    )
  })

  it("refuses an empty string", () => {
    assert.throws(() => assertDisposableTarget(""), UnsafeTestTargetError)
  })
})

/* ---- two configurations that disagree ------------------------------- */

describe("conflicting configuration is an ambiguity, not a preference", () => {
  it("refuses when the two configured targets differ", () => {
    assert.throws(
      () => assertNoConflictingConfig(PERMITTED, "postgres://u:p@127.0.0.1:5432/whitehabbit_dev"),
      UnsafeTestTargetError,
    )
  })

  it("accepts when they agree", () => {
    assert.doesNotThrow(() => assertNoConflictingConfig(PERMITTED, PERMITTED))
  })

  it("accepts when only the test target is configured", () => {
    assert.doesNotThrow(() => assertNoConflictingConfig(PERMITTED, undefined))
  })
})

/* ---- the negative that actually matters ------------------------------ */

describe("a refused target never reaches the destructive statement", () => {
  const refused = [
    ["an unallowlisted name", "postgres://u:p@127.0.0.1:5432/latest"],
    ["a foreign host", "postgres://u:p@db.example.com:5432/whitehabbit_test"],
    ["an unparseable URL", "not a url at all"],
    ["no database named", "postgres://u:p@127.0.0.1:5432/"],
    ["an unexpected scheme", "https://127.0.0.1:5432/whitehabbit_test"],
  ] as const

  for (const [label, target] of refused) {
    it(`issues no statement for ${label}`, async () => {
      const runner = countingRunner()
      await assert.rejects(() => resetSchema(target, runner.run), UnsafeTestTargetError)
      assert.equal(runner.calls.length, 0, "the DROP was handed to something — the guard did not gate it")
    })
  }

  it("issues exactly the reset for a permitted target", async () => {
    // The positive control: without it, a guard that refused everything
    // would pass every test above.
    const runner = countingRunner()
    await resetSchema(TEST_DATABASE_URL, runner.run)
    assert.equal(runner.calls.length, 1)
    assert.match(runner.calls[0], /DROP SCHEMA IF EXISTS public CASCADE/)
  })
})

/* ---- nothing leaks into the message ---------------------------------- */

describe("a refusal never carries the URL or its credentials", () => {
  const SECRET = "hunter2-not-a-real-password"
  const targets = [
    `postgres://admin:${SECRET}@db.example.com:5432/whitehabbit_test`,
    `postgres://admin:${SECRET}@127.0.0.1:5432/latest`,
    `https://admin:${SECRET}@127.0.0.1:5432/whitehabbit_test`,
  ]

  for (const target of targets) {
    it(`omits the password and the whole URL (${new URL(target).protocol}//…)`, () => {
      try {
        assertDisposableTarget(target)
        assert.fail("expected the guard to refuse this target")
      } catch (err) {
        assert.ok(err instanceof UnsafeTestTargetError)
        assert.doesNotMatch(err.message, new RegExp(SECRET), "the password reached the error message")
        assert.doesNotMatch(err.message, /postgres:\/\/|https:\/\//, "the whole URL reached the error message")
      }
    })
  }

  it("omits both targets when they conflict", () => {
    const a = `postgres://admin:${SECRET}@127.0.0.1:5432/whitehabbit_test`
    const b = `postgres://admin:${SECRET}@127.0.0.1:5432/whitehabbit_dev`
    try {
      assertNoConflictingConfig(a, b)
      assert.fail("expected the guard to refuse a conflict")
    } catch (err) {
      assert.ok(err instanceof UnsafeTestTargetError)
      assert.doesNotMatch((err as Error).message, new RegExp(SECRET))
      assert.doesNotMatch((err as Error).message, /postgres:\/\//)
    }
  })
})
