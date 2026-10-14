/* ================================================================== *
 * THE ADDRESS POLICY — boundaries, equivalent spellings, fail-closed.
 *
 * THE TWO DEFECTS THIS FILE EXISTS FOR. The classifier used to read
 * the address's TEXT rather than its value:
 *
 *   1. `fe80::/10` was written as startsWith("fe80:"), which covers
 *      1/64 of the range. fe90::1, feaf::1 and febf::1 are link-local
 *      and were ACCEPTED.
 *   2. "::1" was refused and "0:0:0:0:0:0:0:1" — the same host —
 *      was ACCEPTED.
 *
 * WHY THIS TESTS THE CLASSIFIER DIRECTLY. Defect 2 hid for as long as
 * it did because `new URL("http://[0:0:0:0:0:0:0:1]/")` normalises the
 * literal before the guard ever sees it: the guard looked correct
 * through a URL and was not. So every case here is put to
 * isNonPublicIp() itself, and the cases that matter are ALSO put
 * through resolveSafeUrl() to prove the two agree.
 *
 * WHY THE EXPECTED POLICY IS DUPLICATED HERE. EXPECTED_BLOCKED below
 * is a deliberate, independent copy of the table in ssrf-guard.ts.
 * Generating the matrix from the production table would make the test
 * a tautology — remove a range and the "expectation" would move with
 * it. Two copies mean a mutation of either one fails a test, which is
 * the point (AGENTS.md §8).
 *
 * The reference containment check is also deliberately a DIFFERENT
 * algorithm: BigInt arithmetic here, a byte-wise mask in the guard. An
 * off-by-one in one of them does not reproduce in the other.
 *
 * Pure: no database, no network, no timers. The one integration case
 * at the end uses a recording transport and asserts it is never
 * reached.
 * ================================================================== */

import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  assertSafeUrl,
  BLOCKED_PREFIXES,
  isNonPublicIp,
  MAX_RESOLVED_ADDRESSES,
  resolveSafeUrl,
  UnsafeUrlError,
  UNENFORCED_PREFIX_CANDIDATES,
  type AddressResolver,
} from "@/lib/security/ssrf-guard"
import { safeFetch, SafeFetchError, type Transport } from "@/lib/security/safe-fetch"

/* ================================================================== *
 * THE EXPECTED POLICY — an independent copy. Keep in sync DELIBERATELY.
 * ================================================================== */

const EXPECTED_BLOCKED_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
] as const

const EXPECTED_BLOCKED_V6 = [
  "::/96",
  "::ffff:0:0:0/96",
  "64:ff9b::/96",
  "64:ff9b:1::/48",
  "100::/64",
  "2001::/32",
  "2001:2::/48",
  "2001:20::/28",
  "2001:db8::/32",
  "2002::/16",
  "fc00::/7",
  "fe80::/10",
  "fec0::/10",
  "ff00::/8",
] as const

const EXPECTED_BLOCKED = [...EXPECTED_BLOCKED_V4, ...EXPECTED_BLOCKED_V6]

/* ================================================================== *
 * REFERENCE IMPLEMENTATION — bit strings, not byte masks.
 *
 * Deliberately a DIFFERENT algorithm from the guard's: containment is
 * decided here by comparing the first `bits` characters of a binary
 * STRING, where the guard compares whole bytes and then one masked
 * byte. An off-by-one in either does not reproduce in the other.
 *
 * No BigInt: this repository targets ES6, where BigInt literals do not
 * compile. Address arithmetic is octet-wise with a carry.
 * ================================================================== */

type Family = 4 | 6
interface Ref {
  octets: number[]
  family: Family
}

function refParse(text: string): Ref {
  if (!text.includes(":")) {
    const parts = text.split(".")
    assert.equal(parts.length, 4, `fixture is not a dotted quad: ${text}`)
    return { octets: parts.map(Number), family: 4 }
  }
  const compressed = text.indexOf("::")
  const expand = (segment: string): number[] => {
    if (segment === "") return []
    const out: number[] = []
    for (const item of segment.split(":")) {
      if (item.includes(".")) {
        out.push(...item.split(".").map(Number))
      } else {
        const v = parseInt(item, 16)
        out.push(v >> 8, v & 0xff)
      }
    }
    return out
  }
  const head = expand(compressed === -1 ? text : text.slice(0, compressed))
  const tail = compressed === -1 ? [] : expand(text.slice(compressed + 2))
  const fill = 16 - head.length - tail.length
  assert.ok(fill >= 0, `fixture has too many groups: ${text}`)
  const octets = [...head, ...new Array<number>(fill).fill(0), ...tail]
  assert.equal(octets.length, 16, `fixture is not 16 octets: ${text}`)
  return { octets, family: 6 }
}

function refFormat(octets: number[], family: Family): string {
  if (family === 4) return octets.join(".")
  // Deliberately the EXPANDED form: every generated IPv6 fixture is
  // therefore a non-canonical spelling, which is exactly the shape
  // defect 2 let through.
  const parts: string[] = []
  for (let i = 0; i < 16; i += 2) {
    parts.push((((octets[i] << 8) | octets[i + 1]) >>> 0).toString(16).padStart(4, "0"))
  }
  return parts.join(":")
}

/** The address as a binary string — the reference's whole trick. */
const refBits = (octets: number[]): string => octets.map((o) => o.toString(2).padStart(8, "0")).join("")

/** Octet-wise add (delta may be negative). null when it leaves the
 *  address space entirely, which is how 0.0.0.0/8 and ::/96 report
 *  having no address below them. */
function refOffset(octets: number[], delta: number): number[] | null {
  const out = octets.slice()
  let carry = delta
  for (let i = out.length - 1; i >= 0 && carry !== 0; i--) {
    const sum = out[i] + carry
    const mod = ((sum % 256) + 256) % 256
    carry = (sum - mod) / 256
    out[i] = mod
  }
  return carry === 0 ? out : null
}

interface RefPrefix {
  cidr: string
  family: Family
  octets: number[]
  bits: number
  width: number
}

const withHostBits = (p: RefPrefix, value: 0 | 1): number[] => {
  const out = p.octets.slice()
  for (let bit = p.bits; bit < p.width; bit++) {
    const index = bit >> 3
    const mask = 1 << (7 - (bit & 7))
    out[index] = value === 1 ? out[index] | mask : out[index] & ~mask
  }
  return out
}

function refPrefix(cidr: string): RefPrefix {
  const slash = cidr.lastIndexOf("/")
  const bits = Number(cidr.slice(slash + 1))
  const { octets, family } = refParse(cidr.slice(0, slash))
  const p: RefPrefix = { cidr, family, octets, bits, width: octets.length * 8 }
  assert.deepEqual(withHostBits(p, 0), octets, `${cidr} is not written as its own network address`)
  return p
}

const REF_PREFIXES = EXPECTED_BLOCKED.map(refPrefix)

const refFirst = (p: RefPrefix): number[] => withHostBits(p, 0)
const refLast = (p: RefPrefix): number[] => withHostBits(p, 1)

const refContains = (p: RefPrefix, r: Ref): boolean =>
  r.family === p.family && refBits(r.octets).slice(0, p.bits) === refBits(p.octets).slice(0, p.bits)

/** Blocked according to the INDEPENDENT copy of the policy. */
function refBlocked(address: string): boolean {
  const r = refParse(address)
  return REF_PREFIXES.some((p) => refContains(p, r))
}

/* ================================================================== *
 * 1. THE TABLE ITSELF
 * ================================================================== */

describe("the enforced table is the table that was reviewed", () => {
  it("contains exactly the approved prefixes, and no others", () => {
    const enforced = BLOCKED_PREFIXES.map((p) => p.cidr).sort()
    assert.deepEqual(
      enforced,
      [...EXPECTED_BLOCKED].sort(),
      "the guard's table and this file's copy of the policy have diverged — reconcile deliberately, do not sync blindly",
    )
  })

  it("records a reason for every prefix, so the next reader can audit it", () => {
    for (const p of BLOCKED_PREFIXES) {
      assert.ok(p.why.length > 10, `${p.cidr} has no usable justification`)
    }
  })

  it("does NOT block special-purpose prefixes that are globally reachable", () => {
    // The criterion is "not globally reachable", not "special". These
    // three are special AND reachable, so refusing them would be a
    // false positive with no security value.
    for (const reachable of ["192.31.196.1", "192.52.193.1", "192.175.48.1"]) {
      assert.equal(isNonPublicIp(reachable), false, `${reachable} is globally reachable and must stay fetchable`)
    }
  })

  it("covers prefixes that do not end on a byte boundary — where a mask error hides", () => {
    const nonAligned = EXPECTED_BLOCKED.filter((c) => Number(c.slice(c.lastIndexOf("/") + 1)) % 8 !== 0)
    assert.deepEqual(
      [...nonAligned].sort(),
      [
        "100.64.0.0/10",
        "172.16.0.0/12",
        "198.18.0.0/15",
        "2001:20::/28",
        "224.0.0.0/4",
        "240.0.0.0/4",
        "fc00::/7",
        "fe80::/10",
        "fec0::/10",
      ].sort(),
      "the set of non-byte-aligned prefixes changed; their boundaries are the ones most worth re-reading",
    )
    assert.ok(nonAligned.length >= 9)
  })
})

/* ================================================================== *
 * 2. THE BOUNDARY MATRIX — generated for EVERY prefix
 * ================================================================== */

describe("every prefix is refused from its first address to its last", () => {
  for (const p of REF_PREFIXES) {
    it(`${p.cidr} — first, last, and both immediate neighbours`, () => {
      const first = refFormat(refFirst(p), p.family)
      const last = refFormat(refLast(p), p.family)

      assert.equal(isNonPublicIp(first), true, `${first} is the first address of ${p.cidr}`)
      assert.equal(isNonPublicIp(last), true, `${last} is the last address of ${p.cidr}`)

      // Just below the prefix. refOffset returns null where there is
      // no such address (0.0.0.0/8 and ::/96 start at zero).
      const belowOctets = refOffset(refFirst(p), -1)
      if (belowOctets !== null) {
        const below = refFormat(belowOctets, p.family)
        assert.equal(refContains(p, refParse(below)), false, "fixture error: the neighbour is inside the prefix")
        assert.equal(
          isNonPublicIp(below),
          refBlocked(below),
          `${below} sits just below ${p.cidr}; the guard and the reference policy disagree about it`,
        )
      }

      // Just above. For 224.0.0.0/4, fe80::/10 and fec0::/10 the next
      // address is the FIRST address of another blocked prefix —
      // refBlocked knows that, so the assertion stays exact instead of
      // being relaxed to "accepted".
      const aboveOctets = refOffset(refLast(p), 1)
      if (aboveOctets !== null) {
        const above = refFormat(aboveOctets, p.family)
        assert.equal(refContains(p, refParse(above)), false, "fixture error: the neighbour is inside the prefix")
        assert.equal(
          isNonPublicIp(above),
          refBlocked(above),
          `${above} sits just above ${p.cidr}; the guard and the reference policy disagree about it`,
        )
      }
    })
  }

  it("agrees with the reference policy on a swept sample, not just on boundaries", () => {
    // A boundary test can pass with an inverted mask. This sweeps
    // inside each prefix and around it.
    let inside = 0
    let outside = 0
    for (const p of REF_PREFIXES) {
      const interior: number[][] = [refFirst(p), refLast(p)]
      // The address with only the TOP host bit set: the upper half of
      // the prefix, which an inverted mask gets wrong.
      if (p.bits < p.width) {
        const mid = refFirst(p)
        mid[p.bits >> 3] |= 1 << (7 - (p.bits & 7))
        interior.push(mid)
      }
      for (const delta of [1, 2, 255, 256, 65_535]) {
        const up = refOffset(refFirst(p), delta)
        if (up !== null && refContains(p, { octets: up, family: p.family })) interior.push(up)
        const down = refOffset(refLast(p), -delta)
        if (down !== null && refContains(p, { octets: down, family: p.family })) interior.push(down)
      }
      for (const octets of interior) {
        const text = refFormat(octets, p.family)
        assert.equal(isNonPublicIp(text), true, `${text} is inside ${p.cidr}`)
        inside += 1
      }
      for (const delta of [2, 3, 256, 65_536]) {
        for (const candidate of [refOffset(refFirst(p), -delta), refOffset(refLast(p), delta)]) {
          if (candidate === null) continue
          const text = refFormat(candidate, p.family)
          assert.equal(isNonPublicIp(text), refBlocked(text), `disagreement near ${p.cidr} at ${text}`)
          outside += 1
        }
      }
    }
    assert.ok(inside > 300, `the sweep must actually sweep inside the prefixes (checked ${inside})`)
    assert.ok(outside > 180, `and around them (checked ${outside})`)
  })
})

/* ================================================================== *
 * 3. EQUIVALENT SPELLINGS — defect 2, directly
 * ================================================================== */

describe("one address reaches one decision, however it is written", () => {
  const BLOCKED_SPELLINGS: [string, string[]][] = [
    [
      "IPv6 loopback",
      ["::1", "0:0:0:0:0:0:0:1", "0000:0000:0000:0000:0000:0000:0000:0001", "::0:0:1", "0::1", "::1%eth0"],
    ],
    ["IPv6 unspecified", ["::", "0:0:0:0:0:0:0:0", "0000:0000:0000:0000:0000:0000:0000:0000", "0::0"]],
    [
      "IPv4-mapped loopback",
      ["::ffff:127.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:127.0.0.1", "0:0:0:0:0:ffff:7f00:1", "::FFFF:127.0.0.1"],
    ],
    [
      "IPv4-mapped cloud metadata",
      ["::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "0:0:0:0:0:ffff:169.254.169.254", "::0:ffff:169.254.169.254"],
    ],
    ["IPv4-mapped RFC1918", ["::ffff:10.0.0.1", "::ffff:a00:1", "::ffff:192.168.1.1", "::ffff:c0a8:101"]],
    ["IPv4-compatible loopback", ["::127.0.0.1", "::7f00:1", "0:0:0:0:0:0:7f00:1"]],
    ["IPv4-compatible metadata", ["::169.254.169.254", "::a9fe:a9fe"]],
    ["link-local, full /10", ["fe80::1", "fe90::1", "fea0::1", "feaf::1", "febf::1", "FE80::1", "fe80::1%eth0"]],
    ["unique local", ["fc00::1", "fd00::1", "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "FC00::1"]],
    ["multicast", ["ff02::1", "ff05::1:3", "224.0.0.1", "239.255.255.250", "::ffff:224.0.0.1"]],
  ]

  for (const [label, spellings] of BLOCKED_SPELLINGS) {
    it(`${label} — all ${spellings.length} spellings are refused`, () => {
      for (const s of spellings) {
        assert.equal(isNonPublicIp(s), true, `${s} (${label}) was accepted`)
      }
    })
  }

  it("the IPv4-mapped prefix is canonicalised, not pattern-matched", () => {
    // ::ffff:<public v4> must stay ACCEPTED, or "canonicalise" would
    // just be a second way of saying "block anything starting ::ffff".
    assert.equal(isNonPublicIp("::ffff:93.184.216.34"), false, "a mapped PUBLIC address must not be refused")
    assert.equal(isNonPublicIp("::ffff:5db8:d822"), false, "same address, hex spelling")
    assert.equal(isNonPublicIp("::ffff:127.0.0.1"), true)
  })

  it("a public address is not refused for being written unusually", () => {
    /* FOUR DISTINCT spellings of ONE public address. An earlier version
     * of this list repeated the first form as its third entry, so it
     * claimed three forms and exercised two — the 3.2-B audit caught
     * that. The replacements are a legal uppercase form and the
     * dotted-tail form of the same 128 bits (0x25c8 = 37.200,
     * 0x1946 = 25.70). */
    for (const s of [
      "2606:2800:220:1:248:1893:25c8:1946",
      "2606:2800:0220:0001:0248:1893:25c8:1946",
      "2606:2800:220:1:248:1893:25C8:1946",
      "2606:2800:220:1:248:1893:37.200.25.70",
    ]) {
      assert.equal(isNonPublicIp(s), false, `${s} is public and must stay fetchable`)
    }
  })
})

/* ================================================================== *
 * 4. CONTROLS
 * ================================================================== */

describe("controls", () => {
  it("positive: real public destinations stay fetchable", () => {
    for (const ip of [
      "93.184.216.34",
      "23.192.228.84",
      "1.1.1.1",
      "8.8.8.8",
      "100.63.255.255", // just below CGNAT
      "100.128.0.0", // just above CGNAT
      "126.255.255.255", // just below loopback/8
      "128.0.0.0", // just above loopback/8
      "172.15.255.255", // just below 172.16/12
      "172.32.0.0", // just above 172.16/12
      "198.17.255.255", // just below benchmarking/15
      "198.20.0.0", // just above benchmarking/15
      "223.255.255.255", // just below multicast/4
      "2606:2800:220:1:248:1893:25c8:1946",
      "2a00:1450:4001:80b::200e",
      "1:2:3:4:5:6:93.184.216.34", // a dotted tail with no "::" is a legal form
      "fe7f:ffff:ffff:ffff:ffff:ffff:ffff:ffff", // just below fe80::/10
      "fbff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", // just below fc00::/7
      "fe00::1", // between fc00::/7 and fe80::/10
      "2001:1::1", // just above Teredo /32
      "2003::1", // just above 6to4 /16
    ]) {
      assert.equal(isNonPublicIp(ip), false, `${ip} must remain fetchable`)
    }
  })

  it("negative: loopback, private, link-local, ULA, multicast and metadata are refused", () => {
    for (const ip of [
      "127.0.0.1",
      "127.1.1.1",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "169.254.0.1",
      "0.0.0.0",
      "::1",
      "::",
      "fe80::1",
      "fc00::1",
      "fd00::1",
      "ff02::1",
      "224.0.0.1",
      "255.255.255.255",
      "100.64.0.1",
    ]) {
      assert.equal(isNonPublicIp(ip), true, `${ip} must be refused`)
    }
  })
})

/* ================================================================== *
 * 5. FAIL CLOSED
 * ================================================================== */

describe("anything that does not parse is refused, never guessed at", () => {
  it("refuses non-strings from a hostile resolver", () => {
    for (const value of [null, undefined, 42, {}, [], true, Symbol("x"), 127.1, NaN]) {
      assert.equal(isNonPublicIp(value), true, `${String(value)} was not refused`)
    }
  })

  it("refuses the empty string and whitespace, rather than trimming into an acceptance", () => {
    for (const value of ["", " ", "\t", "\n", " 93.184.216.34", "93.184.216.34 ", " 93.184.216.34 "]) {
      assert.equal(isNonPublicIp(value), true, `${JSON.stringify(value)} was not refused`)
    }
  })

  it("refuses alternative IPv4 notations instead of interpreting them", () => {
    // Were any of these interpreted, this module and the OS resolver
    // could disagree about which host a string names.
    for (const value of [
      "127.000.000.001",
      "0177.0.0.1",
      "0x7f.0.0.1",
      "2130706433",
      "127.1",
      "127.0.1",
      "1.2.3",
      "1.2.3.4.5",
      "1.2.3.04",
      "256.0.0.1",
      "999.999.999.999",
      "-1.0.0.1",
      "1.2.3.4:80",
    ]) {
      assert.equal(isNonPublicIp(value), true, `${value} was not refused`)
    }
  })

  it("refuses malformed IPv6, including the bracketed form", () => {
    for (const value of [
      "[::1]",
      "[::1]:80",
      ":::1",
      "1::2::3",
      "fe80:",
      "::ffff:",
      "12345::1",
      "g::1",
      "1:2:3:4:5:6:7:8:9",
      "1:2:3:4:5:6:7",
      "::1.2.3",
      "::1.2.3.4.5",
      "1.2.3.4::1",
      "::ffff:127.0.0.1.5",
    ]) {
      assert.equal(isNonPublicIp(value), true, `${value} was not refused`)
    }
  })

  it("handles a zone identifier, and refuses a malformed one", () => {
    // node:net's isIP accepts "fe80::1%eth0", so the classifier must
    // not be the thing that chokes on it.
    assert.equal(isNonPublicIp("fe80::1%eth0"), true, "a zoned link-local address is still link-local")
    assert.equal(isNonPublicIp("febf::1%0"), true, "zoned, and inside the /10")
    assert.equal(isNonPublicIp("2606:2800:220:1:248:1893:25c8:1946%eth0"), false, "a zone alone does not make it private")
    for (const malformed of ["fe80::1%", "fe80::1%%eth0", "%eth0", "fe80::1%eth0%1"]) {
      assert.equal(isNonPublicIp(malformed), true, `${malformed} must be refused`)
    }
  })

  it("is not fooled by case", () => {
    assert.equal(isNonPublicIp("FE80::1"), true)
    assert.equal(isNonPublicIp("FD00::1"), true)
    assert.equal(isNonPublicIp("2001:DB8::1"), true)
  })
})

/* ================================================================== *
 * 6. THE CLASSIFIER AND THE GUARD AGREE
 * ================================================================== */

describe("isNonPublicIp and resolveSafeUrl reach the same decision", () => {
  const answering = (address: string): AddressResolver => async () => [
    { address, family: address.includes(":") ? 6 : 4 },
  ]

  /* Every spelling that USED to be a bypass, plus controls. The URL
   * literal path and the DNS path are checked separately because the
   * WHATWG URL parser normalises literals — that normalisation is what
   * hid the defect, so it must not be the only thing tested. */
  const CASES: [string, boolean][] = [
    ["0:0:0:0:0:0:0:1", true],
    ["0000:0000:0000:0000:0000:0000:0000:0001", true],
    ["0:0:0:0:0:0:0:0", true],
    ["0:0:0:0:0:ffff:127.0.0.1", true],
    ["::0:ffff:169.254.169.254", true],
    ["::127.0.0.1", true],
    ["::169.254.169.254", true],
    ["fe90::1", true],
    ["feaf::1", true],
    ["febf::1", true],
    ["fec0::1", true],
    ["ff02::1", true],
    ["224.0.0.1", true],
    ["239.255.255.250", true],
    ["100.64.0.1", true],
    ["192.0.2.1", true],
    ["198.51.100.1", true],
    ["203.0.113.1", true],
    ["198.18.0.1", true],
    ["240.0.0.1", true],
    ["255.255.255.255", true],
    ["2002:7f00:1::1", true],
    ["64:ff9b::7f00:1", true],
    ["2001:0:1234::1", true],
    ["2001:db8::1", true],
    ["2001:20::1", true],
    ["100::1", true],
    ["93.184.216.34", false],
    ["2606:2800:220:1:248:1893:25c8:1946", false],
    ["100.63.255.255", false],
    ["192.31.196.1", false],
  ]

  for (const [address, blocked] of CASES) {
    it(`${address} — classifier, DNS answer and URL literal all say ${blocked ? "refuse" : "allow"}`, async () => {
      assert.equal(isNonPublicIp(address), blocked, "the classifier disagrees")

      // As a DNS answer: no normalisation anywhere, so this is the
      // path the equivalent-spelling defect was reachable through.
      const viaDns = resolveSafeUrl("http://probe.example/x", { resolver: answering(address) })
      if (blocked) await assert.rejects(() => viaDns, UnsafeUrlError, `${address} was accepted as a DNS answer`)
      else await viaDns

      // As a URL literal. The parser may rewrite the spelling; the
      // DECISION must still match.
      const host = address.includes(":") ? `[${address}]` : address
      const viaLiteral = resolveSafeUrl(`http://${host}/x`)
      if (blocked) await assert.rejects(() => viaLiteral, UnsafeUrlError, `${address} was accepted as a URL literal`)
      else await viaLiteral
    })
  }

  it("refuses when only ONE of several answers is forbidden", async () => {
    const mixed: AddressResolver = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "0:0:0:0:0:0:0:1", family: 6 },
    ]
    await assert.rejects(
      () => resolveSafeUrl("http://probe.example/x", { resolver: mixed }),
      UnsafeUrlError,
      "one forbidden answer must refuse the whole hostname",
    )
  })
})

/* ================================================================== *
 * 7. CONTRACTS PRESERVED
 * ================================================================== */

describe("the public contract is unchanged by this remediation", () => {
  it("assertSafeUrl still takes a string and returns the URL", async () => {
    const url = await assertSafeUrl("https://93.184.216.34/page?q=1")
    assert.ok(url instanceof URL)
    assert.equal(url.hostname, "93.184.216.34")
    assert.equal(url.protocol, "https:")
  })

  it("the eight-address limit is untouched", () => {
    assert.equal(MAX_RESOLVED_ADDRESSES, 8)
  })

  it("still performs NO resolution for an IP literal", async () => {
    let called = false
    const resolver: AddressResolver = async () => {
      called = true
      return []
    }
    await resolveSafeUrl("http://93.184.216.34/x", { resolver })
    assert.equal(called, false, "a literal must not reach DNS")
  })

  it("still refuses a non-http(s) scheme before anything else", async () => {
    await assert.rejects(() => resolveSafeUrl("file:///etc/passwd"), UnsafeUrlError)
  })

  it("names no address in the message a stranger sees", async () => {
    await assert.rejects(
      () => resolveSafeUrl("http://probe.example/x", { resolver: async () => [{ address: "100.64.0.1", family: 4 }] }),
      (err: unknown) => {
        assert.ok(err instanceof UnsafeUrlError)
        assert.doesNotMatch(err.message, /100\.64\.0\.1/, "the resolved address leaked into the message")
        return true
      },
    )
  })
})

/* ================================================================== *
 * 8. BEFORE THE NETWORK, NOT AFTER
 * ================================================================== */

describe("a DNS answer in a forbidden range is refused before any request", () => {
  for (const address of ["0:0:0:0:0:0:0:1", "::127.0.0.1", "fe90::1", "100.64.0.1", "203.0.113.1", "224.0.0.1"]) {
    it(`${address} — the transport is never reached`, async () => {
      const attempts: string[] = []
      const transport: Transport = async (request) => {
        attempts.push(request.address)
        return { status: 200, headers: {}, body: Buffer.alloc(0) }
      }
      await assert.rejects(
        () =>
          safeFetch("http://probe.example/x", {
            timeoutMs: 1000,
            maxBytes: 1000,
            resolver: async () => [{ address, family: address.includes(":") ? 6 : 4 }],
            transport,
          }),
        (err: unknown) => {
          assert.match(String((err as { code?: string }).code), /blocked/)
          return true
        },
      )
      assert.deepEqual(attempts, [], "a forbidden address must not reach a socket at all")
    })
  }

  it("a redirect into a newly covered range is refused on the hop that aims there", async () => {
    const attempts: string[] = []
    const transport: Transport = async (request) => {
      attempts.push(request.url.toString())
      if (request.url.pathname === "/start") {
        return { status: 302, headers: { location: "http://100.64.0.1/internal" }, body: Buffer.alloc(0) }
      }
      return { status: 200, headers: {}, body: Buffer.alloc(0) }
    }
    /* The assertion used to be a bare assert.rejects with no predicate,
     * so a timeout would have satisfied it. The 3.2-B audit flagged
     * that; the contract is specific and is now checked as such. */
    await assert.rejects(
      () => safeFetch("http://93.184.216.34/start", { timeoutMs: 1000, maxBytes: 1000, transport }),
      (err: unknown) => {
        assert.ok(err instanceof SafeFetchError, `expected a SafeFetchError, got ${String(err)}`)
        assert.equal(err.code, "blocked", "a refused redirect target is 'blocked', not some other failure")
        assert.doesNotMatch(err.userMessage, /100\.64\.0\.1/, "the refused target must not reach the caller")
        return true
      },
    )
    assert.deepEqual(attempts, ["http://93.184.216.34/start"], "only the public hop may be attempted")
  })
})

/* ================================================================== *
 * 9. THE RESOLVER'S ANSWER IS UNTRUSTED IN SHAPE, NOT ONLY IN VALUE
 *
 * WHAT THE 3.2-B AUDIT FOUND (B-1). A resolver answering `null`, or an
 * array holding `[null]`, used to reach `addresses.length` or a
 * destructuring pattern and raise a TypeError. Fail-closed — nothing
 * ever connected — but the error left the module's contract, and
 * saveUrl, which converts only UnsafeUrlError, turned a 400 into a
 * 500.
 *
 * Each case below is asserted at BOTH levels, because they have
 * different contracts: UnsafeUrlError from the guard,
 * SafeFetchError(code: "blocked") from safeFetch. A refusal that
 * arrives as "invalid_url" is wrong too, not merely untidy — it is how
 * the defect showed itself.
 *
 * Also asserted, for every case: the transport is never reached, and
 * the resolver is called exactly ONCE. A refusal must not cost a
 * second lookup.
 *
 * NOT duplicated here: that a DNS error's text stays out of the
 * user-facing message. tests/security/safe-fetch.test.ts ("20. fails
 * without leaking detail when a hostname does not resolve") owns that,
 * and asserts both halves — userMessage clean, detail preserved.
 * ================================================================== */

describe("a malformed resolver answer refuses, and does so in contract", () => {
  const PUBLIC = "93.184.216.34"
  const eightPublic = () => Array.from({ length: MAX_RESOLVED_ADDRESSES }, (_, i) => ({ address: `93.184.216.${i + 1}`, family: 4 }))

  /** A resolver plus a call counter, so "no additional resolution" is
   *  observed rather than assumed. */
  const counting = (answer: () => unknown) => {
    const calls = { n: 0 }
    const resolver = (async () => {
      calls.n += 1
      return answer()
    }) as unknown as AddressResolver
    return { calls, resolver }
  }

  const recording = () => {
    const attempts: string[] = []
    const transport: Transport = async (request) => {
      attempts.push(request.address)
      return { status: 200, headers: { "content-type": "text/html" }, body: Buffer.alloc(0) }
    }
    return { attempts, transport }
  }

  /* label, what the resolver answers, and why it must be refused. */
  const REFUSED: [string, () => unknown][] = [
    ["null instead of an array", () => null],
    ["undefined instead of an array", () => undefined],
    ["a string instead of an array", () => PUBLIC],
    ["an object instead of an array", () => ({ address: PUBLIC, family: 4 })],
    ["an array holding null", () => [null]],
    ["an array holding undefined", () => [undefined]],
    ["an array holding a number", () => [42]],
    ["an array holding a bare address string", () => [PUBLIC]],
    ["an array holding a function", () => [() => PUBLIC]],
    ["an object with no address field", () => [{ family: 4 }]],
    ["an object whose address is not a string", () => [{ address: 2130706433, family: 4 }]],
    ["an object whose address only coerces to one", () => [{ address: { toString: () => PUBLIC }, family: 4 }]],
    ["a public address followed by an invalid item", () => [{ address: PUBLIC, family: 4 }, null]],
    ["a public address followed by an item with no address", () => [{ address: PUBLIC, family: 4 }, {}]],
    [
      "seven public addresses with a private one last",
      () => [...eightPublic().slice(0, 7), { address: "127.0.0.1", family: 4 }],
    ],
    [
      "the full limit of public addresses with a private one last",
      () => [...eightPublic(), { address: "10.0.0.1", family: 4 }],
    ],
    ["one address over the limit", () => Array.from({ length: MAX_RESOLVED_ADDRESSES + 1 }, (_, i) => ({ address: `93.184.216.${i + 1}`, family: 4 }))],
    ["no addresses at all", () => []],
  ]

  for (const [label, answer] of REFUSED) {
    it(`${label} — UnsafeUrlError from the guard, "blocked" from safeFetch, nothing connected`, async () => {
      // ---- the guard's contract
      const g = counting(answer)
      await assert.rejects(
        () => resolveSafeUrl("http://probe.example/x", { resolver: g.resolver }),
        (err: unknown) => {
          assert.ok(
            err instanceof UnsafeUrlError,
            `expected UnsafeUrlError, got ${err instanceof Error ? err.name : typeof err}: ${String(err)}`,
          )
          assert.doesNotMatch(err.message, /127\.0\.0\.1|10\.0\.0\.1|2130706433/, "a refused address reached the message")
          return true
        },
      )
      assert.equal(g.calls.n, 1, "a refusal must not cost a second lookup")

      // ---- safeFetch's contract, and the socket
      const f = counting(answer)
      const { attempts, transport } = recording()
      await assert.rejects(
        () => safeFetch("http://probe.example/x", { timeoutMs: 1000, maxBytes: 1000, resolver: f.resolver, transport }),
        (err: unknown) => {
          assert.ok(err instanceof SafeFetchError, `expected SafeFetchError, got ${String(err)}`)
          assert.equal(err.code, "blocked", "an unsafe resolver answer is 'blocked', never 'invalid_url'")
          assert.doesNotMatch(err.userMessage, /127\.0\.0\.1|10\.0\.0\.1|probe\.example/, "detail leaked to the caller")
          return true
        },
      )
      assert.deepEqual(attempts, [], "nothing may reach a socket")
      assert.equal(f.calls.n, 1, "one resolution per hop, even when it refuses")
    })
  }

  it("a resolver that throws is still an UnsafeUrlError, with the cause kept for the log", async () => {
    const g = counting(() => {
      throw new Error("getaddrinfo ENOTFOUND internal-billing.corp")
    })
    await assert.rejects(
      () => resolveSafeUrl("http://probe.example/x", { resolver: g.resolver }),
      (err: unknown) => {
        assert.ok(err instanceof UnsafeUrlError)
        assert.doesNotMatch(err.message, /ENOTFOUND|internal-billing/, "the DNS error leaked into the message")
        assert.ok(err.cause instanceof Error, "the cause must survive for the server log")
        assert.match((err.cause as Error).message, /ENOTFOUND/)
        return true
      },
    )
    const { attempts, transport } = recording()
    const f = counting(() => {
      throw new Error("getaddrinfo ENOTFOUND internal-billing.corp")
    })
    await assert.rejects(
      () => safeFetch("http://probe.example/x", { timeoutMs: 1000, maxBytes: 1000, resolver: f.resolver, transport }),
      (err: unknown) => {
        assert.ok(err instanceof SafeFetchError)
        assert.equal(err.code, "blocked")
        return true
      },
    )
    assert.deepEqual(attempts, [])
  })

  it("the positive control: eight valid public addresses are accepted and the first is pinned", async () => {
    // Without this, a guard that refused every resolver answer would
    // satisfy every assertion above.
    const g = counting(eightPublic)
    const safe = await resolveSafeUrl("http://probe.example/x", { resolver: g.resolver })
    assert.equal(safe.addresses.length, MAX_RESOLVED_ADDRESSES, "all eight are returned, having all been validated")
    assert.equal(safe.addresses[0].address, "93.184.216.1")
    assert.equal(g.calls.n, 1)

    const f = counting(eightPublic)
    const { attempts, transport } = recording()
    const res = await safeFetch("http://probe.example/x", {
      timeoutMs: 1000,
      maxBytes: 1000,
      resolver: f.resolver,
      transport,
    })
    assert.equal(res.status, 200)
    assert.deepEqual(attempts, ["93.184.216.1"], "the socket uses the first validated answer")
  })

  it("an unexpected programming error is NOT relabelled as an unsafe URL", async () => {
    // The fix must not be a broad catch. A defect in a caller's own
    // resolver code is a bug to surface, not a URL to refuse — and the
    // ONLY throw the guard wraps is the resolver's own rejection,
    // which the test above covers. Here the resolver returns an array
    // whose item getter throws while the SHAPE check reads it.
    const exploding = [
      Object.defineProperty({}, "address", {
        get() {
          throw new RangeError("a bug in the caller, not an unsafe address")
        },
      }),
    ]
    await assert.rejects(
      () => resolveSafeUrl("http://probe.example/x", { resolver: (async () => exploding) as unknown as AddressResolver }),
      (err: unknown) => {
        assert.ok(err instanceof RangeError, `a caller's bug must surface as itself, got ${String(err)}`)
        assert.ok(!(err instanceof UnsafeUrlError), "it must not be disguised as an unsafe URL")
        return true
      },
    )
  })
})

/* ================================================================== *
 * 10. THE ONE PREFIX THAT IS NOT ENFORCED
 * ================================================================== */

describe("3fff::/20 is a candidate, not a policy", () => {
  it("is recorded as unenforced, with its reason", () => {
    const cidrs = UNENFORCED_PREFIX_CANDIDATES.map(([cidr]) => cidr)
    assert.deepEqual(cidrs, ["3fff::/20"])
    assert.match(UNENFORCED_PREFIX_CANDIDATES[0][1], /unverified/i)
  })

  it("is NOT in the enforced table", () => {
    assert.equal(
      BLOCKED_PREFIXES.some((p) => p.cidr === "3fff::/20"),
      false,
      "3fff::/20 moved into the enforced table — that is a deliberate decision; update this test and the limitation note",
    )
  })

  it("is therefore still accepted, which is the honest current state", () => {
    // Believed to be documentation space (RFC 9637), which would make
    // it a correct entry. The IANA registries are not reachable from
    // this environment, so the premise is unverified and the prefix is
    // not enforced. This assertion exists so that fact cannot rot into
    // an unexamined comment.
    assert.equal(isNonPublicIp("3fff::1"), false)
    assert.equal(isNonPublicIp("3fff:ffff::1"), false)
  })
})
