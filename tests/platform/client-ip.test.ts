/* ================================================================== *
 * TRUSTED CLIENT IP — lib/auth-features.ts
 *
 * clientIpFrom() decides the SUBJECT of every pre-session rate limit:
 * password reset, password forgot, and the unauthenticated
 * /api/knowledge/preview fetcher. If a client can choose that subject,
 * those limits do not exist — so these are security tests, not
 * formatting tests.
 *
 * The behaviour rests on one stated assumption about infrastructure:
 * TRUSTED_PROXY_HOPS proxies sit in front of this application, and the
 * entry that many positions from the RIGHT of X-Forwarded-For is the
 * one the outermost trusted proxy wrote. Every test below passes hops
 * explicitly, so the assumption is exercised rather than inherited
 * from whatever the environment happens to be set to.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { clientIpFrom, normalizeIp, trustedProxyHops } from "@/lib/auth-features"

/** A request carrying exactly the headers under test. */
function req(headers: Record<string, string> = {}): Request {
  return new Request("https://app.test/whatever", { headers })
}

/* ---- the attack this function exists to stop ---------------------- */

describe("spoofing", () => {
  it("ignores a forged address when a trusted proxy appended the real one", () => {
    // What an attacker sends: "x-forwarded-for: 6.6.6.6".
    // What arrives after one trusted proxy appends: "6.6.6.6, <real>".
    // The forgery is on the LEFT, which is exactly why the leftmost
    // entry must never be used.
    assert.equal(clientIpFrom(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.10" }), 1), "203.0.113.10")
  })

  it("gives an attacker ONE bucket, not a fresh bucket per request", () => {
    // The sharpest form of the bug: the old implementation returned
    // whatever text was in the header, so a different nonsense value
    // on each request minted a brand-new rate-limit key every time and
    // the limit never applied at all.
    const subjects = new Set<string>()
    for (let i = 0; i < 50; i += 1) {
      subjects.add(clientIpFrom(req({ "x-forwarded-for": `attacker-run-${i}, 203.0.113.10` }), 1))
    }
    assert.deepEqual([...subjects], ["203.0.113.10"], "50 forged headers must all land in one bucket")
  })

  it("never returns arbitrary header text as a rate-limit subject", () => {
    for (const forged of [
      "i-choose-my-own-bucket",
      "'; DROP TABLE rate_limit_counters; --",
      "999.999.999.999",
      "0x7f000001",
      "example.com",
      "x".repeat(500),
    ]) {
      const subject = clientIpFrom(req({ "x-forwarded-for": forged }), 1)
      assert.equal(subject, "unknown", `${forged.slice(0, 30)} must not become a subject`)
    }
  })

  it("cannot be widened by stuffing the chain with extra hops", () => {
    // Padding the chain moves the attacker's value further left, never
    // to the right of the proxy's entry.
    const stuffed = `${Array.from({ length: 20 }, (_, i) => `6.6.6.${i}`).join(", ")}, 203.0.113.10`
    assert.equal(clientIpFrom(req({ "x-forwarded-for": stuffed }), 1), "203.0.113.10")
  })

  it("cannot mint buckets by varying the port", () => {
    const a = clientIpFrom(req({ "x-forwarded-for": "1.1.1.1, 203.0.113.10:1111" }), 1)
    const b = clientIpFrom(req({ "x-forwarded-for": "1.1.1.1, 203.0.113.10:2222" }), 1)
    assert.equal(a, b, "a port is not identity")
    assert.equal(a, "203.0.113.10")
  })

  it("cannot mint buckets by varying IPv6 case", () => {
    const a = clientIpFrom(req({ "x-forwarded-for": "2001:DB8::1" }), 1)
    const b = clientIpFrom(req({ "x-forwarded-for": "2001:db8::1" }), 1)
    assert.equal(a, b)
  })
})

/* ---- the trust assumption itself ---------------------------------- */

describe("the trusted-hop assumption", () => {
  const chain = "6.6.6.6, 198.51.100.7, 203.0.113.10"

  it("takes the rightmost entry with one trusted proxy (the Vercel case)", () => {
    assert.equal(clientIpFrom(req({ "x-forwarded-for": chain }), 1), "203.0.113.10")
  })

  it("steps further left as more proxies are declared trusted", () => {
    assert.equal(clientIpFrom(req({ "x-forwarded-for": chain }), 2), "198.51.100.7")
    assert.equal(clientIpFrom(req({ "x-forwarded-for": chain }), 3), "6.6.6.6")
  })

  it("never walks off the left end of a chain shorter than expected", () => {
    // Fewer proxies ran than configured. The leftmost surviving entry
    // is the furthest we can go; it must not return undefined.
    assert.equal(clientIpFrom(req({ "x-forwarded-for": "203.0.113.10" }), 3), "203.0.113.10")
  })

  it("ignores the header entirely when NO proxy is trusted", () => {
    // The honest configuration for a deployment reached directly: every
    // entry is client-supplied, so none can be believed. One shared
    // bucket throttles an attacker along with everyone else, which is
    // the right way round — a forgeable bucket throttles nobody.
    assert.equal(clientIpFrom(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.10" }), 0), "unknown")
    assert.equal(clientIpFrom(req({ "x-real-ip": "203.0.113.10" }), 0), "unknown")
  })

  it("defaults to exactly one trusted proxy", () => {
    const saved = process.env.TRUSTED_PROXY_HOPS
    try {
      delete process.env.TRUSTED_PROXY_HOPS
      assert.equal(trustedProxyHops(), 1)

      process.env.TRUSTED_PROXY_HOPS = "2"
      assert.equal(trustedProxyHops(), 2)

      process.env.TRUSTED_PROXY_HOPS = "0"
      assert.equal(trustedProxyHops(), 0, "0 must be honoured — it is a real configuration")

      // A typo must not silently collapse every caller into one bucket.
      for (const bad of ["", "  ", "abc", "-1", "1.5", "99"]) {
        process.env.TRUSTED_PROXY_HOPS = bad
        assert.equal(trustedProxyHops(), 1, `${JSON.stringify(bad)} should fall back to the default`)
      }
    } finally {
      if (saved === undefined) delete process.env.TRUSTED_PROXY_HOPS
      else process.env.TRUSTED_PROXY_HOPS = saved
    }
  })
})

/* ---- header shapes ------------------------------------------------ */

describe("header handling", () => {
  it("returns a shared subject when there is no address at all", () => {
    assert.equal(clientIpFrom(req(), 1), "unknown")
    assert.equal(clientIpFrom(req({ "x-forwarded-for": "" }), 1), "unknown")
    assert.equal(clientIpFrom(req({ "x-forwarded-for": ", ," }), 1), "unknown")
    assert.equal(clientIpFrom(req({ "x-forwarded-for": "   " }), 1), "unknown")
  })

  it("handles a single-entry chain", () => {
    assert.equal(clientIpFrom(req({ "x-forwarded-for": "203.0.113.10" }), 1), "203.0.113.10")
  })

  it("tolerates whitespace and empty slots in the chain", () => {
    assert.equal(clientIpFrom(req({ "x-forwarded-for": "  6.6.6.6 ,, 203.0.113.10  " }), 1), "203.0.113.10")
  })

  it("skips unparseable entries rather than counting them as hops", () => {
    // A junk entry to the right must not shift the real address out of
    // position, or an attacker could push it out of reach.
    assert.equal(clientIpFrom(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.10, junk" }), 1), "203.0.113.10")
  })

  it("refuses an oversized header outright", () => {
    const huge = `${"1.1.1.1, ".repeat(200)}203.0.113.10`
    assert.ok(huge.length > 1024)
    assert.equal(clientIpFrom(req({ "x-forwarded-for": huge }), 1), "unknown")
  })

  it("falls back to x-real-ip only when the chain yields nothing", () => {
    assert.equal(clientIpFrom(req({ "x-real-ip": "203.0.113.10" }), 1), "203.0.113.10")
    assert.equal(clientIpFrom(req({ "x-forwarded-for": "junk", "x-real-ip": "203.0.113.10" }), 1), "203.0.113.10")
    // A usable chain wins: it is the source with a position to reason about.
    assert.equal(
      clientIpFrom(req({ "x-forwarded-for": "6.6.6.6, 198.51.100.7", "x-real-ip": "203.0.113.10" }), 1),
      "198.51.100.7",
    )
  })

  it("validates x-real-ip too", () => {
    assert.equal(clientIpFrom(req({ "x-real-ip": "not-an-ip" }), 1), "unknown")
  })
})

/* ---- address forms ------------------------------------------------ */

describe("normalizeIp", () => {
  it("accepts IPv4 and rejects out-of-range octets", () => {
    assert.equal(normalizeIp("203.0.113.10"), "203.0.113.10")
    assert.equal(normalizeIp("0.0.0.0"), "0.0.0.0")
    assert.equal(normalizeIp("255.255.255.255"), "255.255.255.255")
    assert.equal(normalizeIp("256.0.0.1"), null)
    assert.equal(normalizeIp("1.2.3"), null)
    assert.equal(normalizeIp("1.2.3.4.5"), null)
  })

  it("accepts IPv6 in its real forms", () => {
    assert.equal(normalizeIp("2001:db8::1"), "2001:db8::1")
    assert.equal(normalizeIp("::1"), "::1", "loopback, the dev case")
    assert.equal(normalizeIp("::ffff:203.0.113.10"), "::ffff:203.0.113.10", "IPv4-mapped")
    assert.equal(normalizeIp("2001:0db8:0000:0000:0000:0000:0000:0001"), "2001:0db8:0000:0000:0000:0000:0000:0001")
    assert.equal(normalizeIp("gggg::1"), null)
    assert.equal(normalizeIp("2001:db8::1::2"), null, "double compression is invalid")
  })

  it("strips ports and brackets", () => {
    assert.equal(normalizeIp("203.0.113.10:1234"), "203.0.113.10")
    assert.equal(normalizeIp("[2001:db8::1]:443"), "2001:db8::1")
    assert.equal(normalizeIp("[2001:db8::1]"), "2001:db8::1")
  })

  it("rejects everything that is not an address", () => {
    for (const bad of ["", "   ", "unknown", "localhost", "example.com", "x".repeat(100), "1.2.3.4/24"]) {
      assert.equal(normalizeIp(bad), null, `${JSON.stringify(bad)} was accepted`)
    }
  })
})
