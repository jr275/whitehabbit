import "server-only"

/* ================================================================== *
 * SSRF GUARD — validates a URL is safe to fetch server-side BEFORE
 * fetching it. Applied wherever a Tool fetches a URL that ultimately
 * traces back to user input (Knowledge sources, the Browser tool) —
 * see lib/agent/tools/browser.ts.
 *
 * Blocks:
 *   - non-http(s) schemes (file://, ftp://, gopher://, data:, ...)
 *   - the hostnames in BLOCKED_HOSTNAMES
 *   - every address that is NOT GLOBALLY REACHABLE, decided
 *     numerically against the CIDR table below (loopback, RFC 1918,
 *     link-local and the cloud metadata endpoint, CGNAT, multicast,
 *     documentation and benchmarking space, broadcast, ULA, ...)
 *   - two prefixes that ARE reachable but encapsulate a destination
 *     this check does not decode (6to4, NAT64/Teredo)
 *
 * It does NOT block special-purpose prefixes that are globally
 * reachable; see the table's own notes.
 *
 * Resolves the hostname via real DNS and checks the RESOLVED address,
 * not just the literal hostname string — a hostname that looks public
 * but resolves to a private IP (DNS rebinding) is blocked too.
 *
 * ---- WHY RESOLUTION IS RETURNED, NOT JUST PERFORMED ---------------
 *
 * resolveSafeUrl hands back the addresses it validated. That exists
 * for one reason: a caller that needs to CONNECT must use the same
 * answer that was validated. Before this, safe-fetch.ts validated
 * here and then resolved the hostname a SECOND time to pin its
 * socket — two lookups per hop, where only the second one governed
 * the connection. The pin made that safe (the second answer was
 * validated too), but it was redundant work and, worse, it made the
 * "resolve exactly once" guarantee untestable: a test could only
 * count its own injected resolver, never the real lookup underneath.
 *
 * assertSafeUrl keeps its original Promise<URL> contract and is now a
 * thin wrapper, so callers that only need validation are unchanged.
 *
 * ---- THE RESOLVER SEAM --------------------------------------------
 *
 * `resolver` is a function parameter with a real-DNS default. It is
 * reachable only from code, never from a request: nothing in the HTTP
 * path constructs it, and there is no env var that selects it. A test
 * can therefore control DNS exactly, and production cannot be made to
 * use a test resolver by anything a caller sends.
 *
 * It also cannot be used to BYPASS validation: whatever a resolver
 * returns is validated here, by the same rules, before being
 * returned. A hostile resolver can only cause a refusal.
 * ================================================================== */

import { isIP } from "node:net"
import { lookup } from "node:dns/promises"

export class UnsafeUrlError extends Error {
  /** The underlying failure, when there was one (a DNS error, say).
   *  Kept for server-side logging; `message` is what a stranger may
   *  see and never carries it. */
  readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = "UnsafeUrlError"
    this.cause = cause
  }
}

/* ---- THE ADDRESS POLICY -------------------------------------------
 *
 * WHAT WAS WRONG BEFORE. The classifier decomposed the address's TEXT
 * — `split(".")`, `startsWith(...)`, string equality — instead of its
 * numeric value. Two defects followed:
 *
 *   1. A prefix written as a string is not a prefix. `fe80::/10`
 *      became startsWith("fe80:"), which covers 1/64 of the range:
 *      fe90::1, feaf::1 and febf::1 are link-local and were accepted.
 *
 *   2. String equality is not address equality. "::1" was refused
 *      while "0:0:0:0:0:0:0:1" — the same host — was accepted. As a
 *      URL literal the WHATWG parser normalised that away, which
 *      MASKED the defect; as a DNS answer there is no normalisation,
 *      and "::127.0.0.1" (a form glibc's inet_ntop really emits) was
 *      accepted on both paths.
 *
 * WHAT IT DOES NOW. Parse the address to bytes once, canonicalise the
 * IPv4-mapped form to its IPv4 bytes, and compare numerically against
 * a table of CIDR prefixes. Equivalent spellings therefore reach the
 * same decision by construction rather than by coincidence.
 *
 * THE TABLES ARE NOT "PRIVATE RANGES", AND NOT EXACTLY "NOT GLOBALLY
 * REACHABLE" EITHER. The criterion is narrower than the first and
 * wider than the second, because this module guards ONE thing: an
 * outbound HTTP fetch of a user-supplied URL. A prefix is refused when
 * it is a destination such a fetch has no business reaching —
 *
 *   - local or private to this host or network (loopback, RFC 1918,
 *     link-local and the cloud metadata endpoint, ULA, CGNAT);
 *   - reserved, unallocated, deprecated or set aside for documentation
 *     and benchmarking, where no real page lives;
 *   - not a unicast host at all (multicast, broadcast, the unspecified
 *     address) — a group is not an HTTP origin;
 *   - a tunnel or translation prefix that encapsulates some OTHER
 *     destination which this check does not decode (6to4, NAT64,
 *     Teredo, IPv4-translatable).
 *
 * Two consequences of saying it that way, both deliberate:
 *
 *   A FEW REFUSED ADDRESSES ARE ROUTABLE. 192.0.0.0/24 and
 *   224.0.0.0/4 are refused whole, and each contains sub-ranges that
 *   are reachable on the public internet. They are protocol endpoints
 *   and multicast groups, never pages, so refusing them costs nothing
 *   a fetcher wants. Their own entries below say so.
 *
 *   SPECIAL-PURPOSE IS NOT ENOUGH TO REFUSE. 192.31.196.0/24
 *   (AS112-v4), 192.52.193.0/24 (AMT) and 192.175.48.0/24 (direct
 *   delegation AS112) are special AND ordinary unicast destinations,
 *   so they are deliberately absent and stay fetchable.
 *
 * PROVENANCE OF THE RFC REFERENCES BELOW. They are cited from the
 * authors' knowledge of the registries and documents named. They were
 * NOT confirmed against a primary source: iana.org is unreachable from
 * the environment this was written in. Read them as the stated reason
 * for each decision, not as a verified classification — and see
 * UNENFORCED_PREFIX_CANDIDATES for the one prefix where that
 * distinction changed the outcome.
 *
 * FAIL CLOSED. Anything that does not parse to bytes is refused.
 * That is deliberate and load-bearing: a hostile resolver answering
 * null, a number, or a form this parser does not accept gets a
 * refusal, never the benefit of the doubt.
 */

/** One CIDR prefix, compiled to bytes once at module load. */
interface CompiledPrefix {
  readonly cidr: string
  /** Why it is refused. Kept next to the prefix so the next reader can
   *  audit the decision without leaving the file. */
  readonly why: string
  readonly family: 4 | 6
  readonly bytes: Uint8Array
  readonly bits: number
}

/**
 * Strict dotted quad. Leading zeros, hex, octal and the one-, two- and
 * three-part shorthands are REFUSED rather than interpreted: "0177.0.0.1"
 * and "127.000.000.001" return null, which the caller turns into a
 * refusal. Accepting them would mean this module and the OS resolver
 * could disagree about which host a string names.
 */
function parseIpv4(text: string): Uint8Array | null {
  const parts = text.split(".")
  if (parts.length !== 4) return null
  const bytes = new Uint8Array(4)
  for (let i = 0; i < 4; i++) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(parts[i])) return null
    const value = Number(parts[i])
    if (value > 255) return null
    bytes[i] = value
  }
  return bytes
}

/**
 * IPv6 to 16 bytes, accepting every form RFC 4291 §2.2 defines: full,
 * "::"-compressed, and a trailing dotted quad. A zone identifier
 * ("fe80::1%eth0") is stripped — node:net's isIP accepts one, so the
 * classifier must not be the thing that chokes on it — but an empty or
 * repeated zone is refused.
 */
function parseIpv6(text: string): Uint8Array | null {
  let body = text
  const percent = body.indexOf("%")
  if (percent !== -1) {
    const zone = body.slice(percent + 1)
    if (zone.length === 0 || zone.includes("%")) return null
    body = body.slice(0, percent)
  }
  if (body.length === 0) return null

  const compressed = body.indexOf("::")
  if (compressed !== body.lastIndexOf("::")) return null // "1::2::3"

  const headText = compressed === -1 ? body : body.slice(0, compressed)
  const tailText = compressed === -1 ? null : body.slice(compressed + 2)

  /**
   * A ":"-separated run of hextets.
   *
   * A dotted quad (counting as two hextets) is allowed ONLY as the
   * final element of the WHOLE address — not merely the last item of
   * its own segment. Getting that wrong accepted "1.2.3.4::1", whose
   * bytes then looked like a public address.
   */
  const hextetsOf = (segment: string, isFinalSegment: boolean): number[] | null => {
    if (segment === "") return []
    const items = segment.split(":")
    const out: number[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.includes(".")) {
        if (!isFinalSegment || i !== items.length - 1) return null
        const quad = parseIpv4(item)
        if (quad === null) return null
        out.push((quad[0] << 8) | quad[1], (quad[2] << 8) | quad[3])
        continue
      }
      if (!/^[0-9a-f]{1,4}$/.test(item)) return null
      out.push(parseInt(item, 16))
    }
    return out
  }

  // Without "::" the head IS the whole address; with it, the tail ends it.
  const head = hextetsOf(headText, tailText === null)
  const tail = tailText === null ? [] : hextetsOf(tailText, true)
  if (head === null || tail === null) return null

  let hextets: number[]
  if (tailText === null) {
    if (head.length !== 8) return null
    hextets = head
  } else {
    // "::" stands for AT LEAST one zero group.
    const fill = 8 - head.length - tail.length
    if (fill < 1) return null
    hextets = [...head, ...new Array<number>(fill).fill(0), ...tail]
  }

  const bytes = new Uint8Array(16)
  for (let i = 0; i < 8; i++) {
    bytes[i * 2] = hextets[i] >> 8
    bytes[i * 2 + 1] = hextets[i] & 0xff
  }
  return bytes
}

/** ::ffff:0:0/96 — the IPv4-mapped prefix, as its first 12 bytes. */
const IPV4_MAPPED_PREFIX = Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff)

/**
 * An address as comparable bytes.
 *
 * IPv4-MAPPED IS CANONICALISED, NOT PATTERN-MATCHED. ::ffff:127.0.0.1,
 * ::ffff:7f00:1 and 0:0:0:0:0:ffff:127.0.0.1 are one host written
 * three ways; all three arrive here as the four bytes 127.0.0.1 and
 * are then judged by the IPv4 table. The old code handled only the
 * first spelling, because it matched the literal text "::ffff:".
 *
 * Whitespace is NOT trimmed: " 93.184.216.34 " does not parse, so it
 * is refused. Trimming would turn a refusal into an acceptance.
 */
function toComparableBytes(raw: string): { bytes: Uint8Array; family: 4 | 6 } | null {
  const text = raw.toLowerCase()
  if (text.includes(":")) {
    const v6 = parseIpv6(text)
    if (v6 === null) return null
    for (let i = 0; i < IPV4_MAPPED_PREFIX.length; i++) {
      if (v6[i] !== IPV4_MAPPED_PREFIX[i]) return { bytes: v6, family: 6 }
    }
    return { bytes: v6.slice(12), family: 4 }
  }
  const v4 = parseIpv4(text)
  return v4 === null ? null : { bytes: v4, family: 4 }
}

/* IPv4 prefixes that are refused, with the reason for each. */
const BLOCKED_IPV4: ReadonlyArray<readonly [string, string]> = [
  ["0.0.0.0/8", '"this network" (RFC 1122) — a source placeholder, never a destination'],
  ["10.0.0.0/8", "private (RFC 1918)"],
  ["100.64.0.0/10", "shared address space / CGNAT (RFC 6598) — carrier and cloud-internal addressing"],
  ["127.0.0.0/8", "loopback (RFC 1122) — this machine"],
  ["169.254.0.0/16", "link-local (RFC 3927) — includes the cloud metadata endpoint 169.254.169.254"],
  ["172.16.0.0/12", "private (RFC 1918)"],
  [
    "192.0.0.0/24",
    "IETF protocol assignments (RFC 6890). Refused WHOLE, although a few /32s inside it are routable — " +
      "192.0.0.9 (PCP anycast) and 192.0.0.10 (NAT64/ALG anycast) among them. Those are protocol " +
      "endpoints spoken to by other protocols, never pages an HTTP fetch should retrieve, so the /24 is " +
      "refused rather than carved up",
  ],
  ["192.0.2.0/24", "TEST-NET-1 (RFC 5737) — documentation only, not globally reachable"],
  ["192.88.99.0/24", "6to4 relay anycast, deprecated (RFC 7526)"],
  ["192.168.0.0/16", "private (RFC 1918)"],
  ["198.18.0.0/15", "benchmarking (RFC 2544) — not globally reachable"],
  ["198.51.100.0/24", "TEST-NET-2 (RFC 5737) — documentation only"],
  ["203.0.113.0/24", "TEST-NET-3 (RFC 5737) — documentation only"],
  [
    "224.0.0.0/4",
    "multicast (RFC 5771) — a group, not a host, so it is not an HTTP origin. Refused WHOLE, including " +
      "the parts that are routable between networks (232.0.0.0/8 source-specific, 233.0.0.0/8 GLOP): " +
      "reachability is not the point, a TCP connection to a multicast group is",
  ],
  ["240.0.0.0/4", "reserved for future use (RFC 1112); contains 255.255.255.255, the limited broadcast address"],
]

/* IPv6 prefixes that are refused, with the reason for each.
 *
 * ::ffff:0:0/96 (IPv4-mapped) is deliberately ABSENT: it is
 * canonicalised to IPv4 above and judged by the table over there, so
 * listing it here too would create a second, divergable definition. */
const BLOCKED_IPV6: ReadonlyArray<readonly [string, string]> = [
  [
    "::/96",
    "IPv4-compatible, deprecated (RFC 4291 §2.5.5.1) and not routed. Refused WHOLESALE rather than " +
      "delegated to the IPv4 table: the whole /96 is unreachable, so there is no legitimate destination " +
      "inside it to preserve. This subsumes ::/128 and ::1/128 in every spelling",
  ],
  ["::ffff:0:0:0/96", "IPv4-translatable (RFC 6145) — a translation prefix, not a host"],
  ["64:ff9b::/96", "NAT64 well-known prefix (RFC 6052) — embeds an IPv4 destination this check does not decode"],
  ["64:ff9b:1::/48", "NAT64 local-use prefix (RFC 8215)"],
  ["100::/64", "discard-only (RFC 6666)"],
  ["2001::/32", "Teredo (RFC 4380) — tunnelled, embeds an endpoint this check does not decode"],
  ["2001:2::/48", "benchmarking (RFC 5180)"],
  ["2001:20::/28", "ORCHIDv2 (RFC 7343) — cryptographic identifiers, not routable"],
  ["2001:db8::/32", "documentation (RFC 3849)"],
  ["2002::/16", "6to4 (RFC 3056) — embeds an IPv4 destination this check does not decode"],
  ["fc00::/7", "unique local (RFC 4193)"],
  ["fe80::/10", "link-local (RFC 4291 §2.5.6) — the FULL /10, not only the fe80: spelling"],
  ["fec0::/10", "site-local, deprecated (RFC 3879)"],
  ["ff00::/8", "multicast (RFC 4291 §2.7)"],
]

/**
 * Prefixes considered and NOT enforced, because the premise could not
 * be verified from this environment.
 *
 * 3fff::/20 is believed to be documentation space (RFC 9637), which
 * would make it a correct entry above. The IANA registries are not
 * reachable from here — www.iana.org is refused by this environment's
 * proxy and there is no outbound DNS — so the premise is unconfirmed.
 * Enforcing an unverified prefix risks refusing real public space, so
 * it stays here, named, rather than silently inside the table or
 * silently absent. tests/security/ip-policy.test.ts asserts it is NOT
 * enforced, so adopting it has to be a deliberate edit.
 */
export const UNENFORCED_PREFIX_CANDIDATES: ReadonlyArray<readonly [string, string]> = [
  ["3fff::/20", "documentation (RFC 9637) — unverified from this environment; see §limitation"],
]

function compilePrefix(entry: readonly [string, string], expected: 4 | 6): CompiledPrefix {
  const [cidr, why] = entry
  const slash = cidr.lastIndexOf("/")
  const bits = Number(cidr.slice(slash + 1))
  const parsed = slash === -1 ? null : toComparableBytes(cidr.slice(0, slash))
  if (
    parsed === null ||
    parsed.family !== expected ||
    !Number.isInteger(bits) ||
    bits < 0 ||
    bits > parsed.bytes.length * 8
  ) {
    // A malformed table entry is a programming mistake, and a silently
    // skipped one would be a silently unblocked range. Fail at module
    // load instead.
    throw new Error(`ssrf-guard: malformed blocked prefix "${cidr}"`)
  }
  return { cidr, why, family: expected, bytes: parsed.bytes, bits }
}

const BLOCKED_PREFIX_TABLE: ReadonlyArray<CompiledPrefix> = [
  ...BLOCKED_IPV4.map((e) => compilePrefix(e, 4)),
  ...BLOCKED_IPV6.map((e) => compilePrefix(e, 6)),
]

/** The policy, readable from a test so the boundary matrix is generated
 *  from the same table the guard enforces rather than a copy of it. */
export const BLOCKED_PREFIXES: ReadonlyArray<{ cidr: string; why: string; family: 4 | 6 }> =
  BLOCKED_PREFIX_TABLE.map(({ cidr, why, family }) => ({ cidr, why, family }))

/** Numeric prefix containment: whole bytes, then the partial byte. */
function withinPrefix(address: Uint8Array, prefix: CompiledPrefix): boolean {
  if (address.length !== prefix.bytes.length) return false
  const wholeBytes = prefix.bits >> 3
  for (let i = 0; i < wholeBytes; i++) {
    if (address[i] !== prefix.bytes[i]) return false
  }
  const remainingBits = prefix.bits & 7
  if (remainingBits === 0) return true
  const mask = (0xff << (8 - remainingBits)) & 0xff
  return (address[wholeBytes] & mask) === (prefix.bytes[wholeBytes] & mask)
}

/**
 * True when this address must not be fetched: it is not globally
 * reachable, it encapsulates a destination this check cannot inspect,
 * or it does not parse at all.
 *
 * Exported so tests can exercise it DIRECTLY. That matters: reaching
 * it only through `new URL()` hides real behaviour, because the URL
 * parser normalises IPv6 literals before the classifier sees them —
 * which is exactly how the equivalent-spelling defect stayed hidden.
 *
 * Takes `unknown` on purpose. The addresses come from a resolver,
 * which is a seam; a non-string is refused here rather than coerced
 * into something that might look public.
 */
export function isNonPublicIp(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.length === 0) return true
  const parsed = toComparableBytes(raw)
  if (parsed === null) return true
  for (const prefix of BLOCKED_PREFIX_TABLE) {
    if (prefix.family === parsed.family && withinPrefix(parsed.bytes, prefix)) return true
  }
  return false
}

/** One address, as DNS answered. */
export interface ResolvedAddress {
  address: string
  family: number
}

/** How a hostname becomes addresses. Injectable so a test can control
 *  DNS; it cannot weaken anything, because every address it returns is
 *  validated by the rules below before it is handed back. */
export type AddressResolver = (hostname: string) => Promise<ResolvedAddress[]>

/** How many addresses of one hostname are considered. A hostname
 *  answering with hundreds of records is not a page we need to read.
 *  Enforced here so every consumer inherits it rather than each one
 *  re-imposing it. */
export const MAX_RESOLVED_ADDRESSES = 8

const defaultResolver: AddressResolver = async (hostname) => {
  const answers = await lookup(hostname, { all: true })
  return answers.map((a) => ({ address: a.address, family: a.family }))
}

/** A URL that passed every check, with the addresses that were
 *  validated. A caller that connects MUST use one of these. */
export interface SafeUrl {
  url: URL
  addresses: ResolvedAddress[]
}

export interface SafeUrlOptions {
  /** Test seam. Defaults to real DNS. Never settable from a request. */
  resolver?: AddressResolver
  maxAddresses?: number
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"])

/**
 * Validate a URL and return the addresses that were validated.
 *
 * Order matters and is unchanged: parse, scheme, blocked names, IP
 * literal, then DNS and every answer. A literal performs NO
 * resolution — the resolver is not called at all — so there is no
 * window to close for one.
 */
export async function resolveSafeUrl(rawUrl: string, options: SafeUrlOptions = {}): Promise<SafeUrl> {
  const resolve = options.resolver ?? defaultResolver
  const maxAddresses = options.maxAddresses ?? MAX_RESOLVED_ADDRESSES

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new UnsafeUrlError(`"${rawUrl}" is not a valid URL.`)
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError(`Only http/https URLs may be fetched (got "${url.protocol}").`)
  }

  // url.hostname keeps the [brackets] for an IPv6 literal
  // (new URL("http://[::1]/").hostname === "[::1]") — strip them so the
  // literal-IP check below actually recognizes it, rather than falling
  // through to a DNS lookup of the literal string "[::1]".
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeUrlError(`"${hostname}" is not a fetchable external host.`)
  }

  // literal IP in the URL — check directly, no DNS needed
  if (isIP(hostname)) {
    if (isNonPublicIp(hostname)) {
      throw new UnsafeUrlError(`"${hostname}" is a private/internal address and cannot be fetched.`)
    }
    return { url, addresses: [{ address: hostname, family: isIP(hostname) }] }
  }

  /* ---- the resolver's answer is UNTRUSTED IN SHAPE, not only in value.
   *
   * The 3.2-B audit found this: a resolver answering `null`, or an
   * array holding `[null]`, reached `addresses.length` or a
   * destructuring pattern and raised a TypeError instead of an
   * UnsafeUrlError. The outcome was still fail-closed — no connection
   * was ever made — but the error left this module's contract, and
   * saveUrl, which converts only UnsafeUrlError, turned it into a 500
   * where a 400 was correct.
   *
   * So the answer is received as `unknown` and its SHAPE is checked
   * before any property of it is read. There is deliberately NO broad
   * catch around this: a genuine programming error anywhere below must
   * still propagate as itself rather than be relabelled "unsafe URL".
   * Only the resolver's own rejection is wrapped, which is the
   * pre-existing DNS-failure contract. */
  let answered: unknown
  try {
    answered = await resolve(hostname)
  } catch (err) {
    // The cause is kept on the error so a caller can log it; the
    // message a stranger sees stays generic.
    throw new UnsafeUrlError(`Could not resolve "${hostname}".`, err)
  }
  if (!Array.isArray(answered)) {
    throw new UnsafeUrlError(`"${hostname}" did not resolve to a usable answer.`)
  }
  if (answered.length === 0) throw new UnsafeUrlError(`"${hostname}" did not resolve to any address.`)
  if (answered.length > maxAddresses) {
    throw new UnsafeUrlError(`"${hostname}" returned ${answered.length} addresses, over the ${maxAddresses} limit.`)
  }

  // Every item is checked before ANY of them is accepted, so a
  // forbidden address hidden behind seven public ones still refuses the
  // whole hostname.
  const addresses: ResolvedAddress[] = []
  for (const answer of answered) {
    // Structure first: a null, undefined, primitive or function item is
    // refused WITHOUT reading a property off it.
    if (answer === null || typeof answer !== "object") {
      throw new UnsafeUrlError(`"${hostname}" resolved to a malformed answer.`)
    }
    // Then the value. Passed straight through, NOT String()-coerced:
    // isNonPublicIp takes `unknown` and refuses anything that is not a
    // string it can parse, so an item with no address, or a numeric
    // one, gets a refusal rather than a coercion.
    if (isNonPublicIp((answer as { address?: unknown }).address)) {
      throw new UnsafeUrlError(`"${hostname}" resolves to a private/internal address and cannot be fetched.`)
    }
    addresses.push(answer as ResolvedAddress)
  }
  return { url, addresses }
}

/** Throws UnsafeUrlError if the URL must not be fetched server-side.
 * Call this immediately before every outbound fetch of a URL that
 * originates from user/Worker-configuration input.
 *
 * Unchanged contract: a URL in, a validated URL out. Callers that also
 * need the addresses — anything that pins a socket — use
 * resolveSafeUrl instead. */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  return (await resolveSafeUrl(rawUrl)).url
}
