import "server-only"

/* ================================================================== *
 * SSRF GUARD — validates a URL is safe to fetch server-side BEFORE
 * fetching it. Applied wherever a Tool fetches a URL that ultimately
 * traces back to user input (Knowledge sources, the Browser tool) —
 * see lib/agent/tools/browser.ts.
 *
 * Blocks:
 *   - non-http(s) schemes (file://, ftp://, gopher://, data:, ...)
 *   - localhost / loopback (127.0.0.0/8, ::1)
 *   - link-local (169.254.0.0/16, fe80::/10) — includes the cloud
 *     metadata endpoint (169.254.169.254)
 *   - private ranges (10/8, 172.16/12, 192.168/16, fc00::/7)
 *   - the unspecified address (0.0.0.0, ::)
 *
 * Resolves the hostname via real DNS and checks the RESOLVED address,
 * not just the literal hostname string — a hostname that looks public
 * but resolves to a private IP (DNS rebinding) is blocked too.
 * ================================================================== */

import { isIP } from "node:net"
import { lookup } from "node:dns/promises"

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsafeUrlError"
  }
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true // malformed — treat as unsafe
  const [a, b] = parts
  if (a === 127) return true // loopback 127.0.0.0/8
  if (a === 10) return true // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 169 && b === 254) return true // link-local incl. cloud metadata (169.254.169.254)
  if (a === 0) return true // 0.0.0.0/8 "this network"
  // 100.64.0.0/10 — RFC 6598 carrier-grade NAT / shared address space.
  // Not "public" in any useful sense: cloud platforms route real
  // internal services here (container networks, node-local agents), so
  // it is exactly as reachable-and-sensitive as RFC 1918 space.
  if (a === 100 && b >= 64 && b <= 127) return true
  // 192.0.0.0/24 — IETF protocol assignments (includes NAT64 discovery)
  if (a === 192 && b === 0 && parts[2] === 0) return true
  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 — documentation ranges
  if (a === 192 && b === 0 && parts[2] === 2) return true
  if (a === 198 && b === 51 && parts[2] === 100) return true
  if (a === 203 && b === 0 && parts[2] === 113) return true
  // 198.18.0.0/15 — benchmarking; frequently wired to internal test rigs
  if (a === 198 && (b === 18 || b === 19)) return true
  // 224.0.0.0/4 multicast and 240.0.0.0/4 reserved (255.255.255.255
  // broadcast falls inside 240/4). Nothing legitimate to fetch, and
  // multicast in particular is a way to reach things not addressable
  // by unicast.
  if (a >= 224) return true
  return false
}

/** Reads the first 16-bit group of an IPv6 address as a number, so a
 * range can be tested by prefix arithmetic rather than by string
 * prefix matching — which is what let fe90:: through a check that was
 * only looking for the literal text "fe80:". */
function firstHextet(ip: string): number {
  const head = ip.split(":")[0]
  if (head === "") return 0 // address began with "::"
  const value = Number.parseInt(head, 16)
  return Number.isNaN(value) ? -1 : value
}

/** Extracts the IPv4 address embedded in a 6to4 (2002::/16) or NAT64
 * (64:ff9b::/96) address, so a private v4 cannot be smuggled inside an
 * apparently-public v6 address. */
function embeddedIPv4(ip: string): string | null {
  const groups = ip.split(":")
  const hexToQuad = (hi: string, lo: string): string | null => {
    const a = Number.parseInt(hi, 16)
    const b = Number.parseInt(lo, 16)
    if (Number.isNaN(a) || Number.isNaN(b)) return null
    return `${(a >> 8) & 0xff}.${a & 0xff}.${(b >> 8) & 0xff}.${b & 0xff}`
  }
  // 6to4: 2002:AABB:CCDD::/48 encodes AA.BB.CC.DD
  if (firstHextet(ip) === 0x2002 && groups.length >= 3) return hexToQuad(groups[1], groups[2])
  // NAT64 well-known prefix: 64:ff9b::AABB:CCDD
  if (firstHextet(ip) === 0x64 && groups[1]?.toLowerCase() === "ff9b") {
    const tail = groups.filter(Boolean).slice(2)
    if (tail.length >= 2) return hexToQuad(tail[tail.length - 2], tail[tail.length - 1])
    // dotted-quad tail form, e.g. 64:ff9b::127.0.0.1
    const dotted = groups[groups.length - 1]
    if (dotted?.includes(".")) return dotted
  }
  return null
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  if (normalized === "::1") return true // loopback
  if (normalized === "::") return true // unspecified
  if (normalized.startsWith("::ffff:")) {
    // IPv4-mapped. The tail may be dotted-quad (::ffff:127.0.0.1) or
    // hex (::ffff:7f00:1); the hex form fails isPrivateIPv4's shape
    // check, which fails closed.
    return isPrivateIPv4(normalized.slice(7))
  }

  const head = firstHextet(normalized)
  if (head < 0) return true // unparseable — fail closed
  // fe80::/10 is fe80–febf. The previous check matched only the
  // literal text "fe80:", so fe90:: and febf:: were reachable.
  if (head >= 0xfe80 && head <= 0xfebf) return true
  // fec0::/10 — deprecated site-local, still routed on some networks
  if (head >= 0xfec0 && head <= 0xfeff) return true
  // fc00::/7 — unique local
  if (head >= 0xfc00 && head <= 0xfdff) return true
  // ::/8 — the unspecified block, plus the deprecated IPv4-compatible
  // range. Nothing routable lives here.
  if (head === 0) return true

  const embedded = embeddedIPv4(normalized)
  if (embedded) return isPrivateIPv4(embedded)

  return false
}

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return isPrivateIPv4(ip)
  if (version === 6) return isPrivateIPv6(ip)
  return true // not a recognizable IP — refuse rather than guess
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"])

/** Throws UnsafeUrlError if the URL must not be fetched server-side.
 * Call this immediately before every outbound fetch of a URL that
 * originates from user/Worker-configuration input. */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
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
    if (isPrivateIp(hostname)) throw new UnsafeUrlError(`"${hostname}" is a private/internal address and cannot be fetched.`)
    return url
  }

  // resolve the real address(es) and check those — defeats DNS
  // rebinding (a public-looking hostname resolving to a private IP)
  let addresses: { address: string }[]
  try {
    addresses = await lookup(hostname, { all: true })
  } catch {
    throw new UnsafeUrlError(`Could not resolve "${hostname}".`)
  }
  if (addresses.length === 0) throw new UnsafeUrlError(`"${hostname}" did not resolve to any address.`)
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new UnsafeUrlError(`"${hostname}" resolves to a private/internal address and cannot be fetched.`)
    }
  }
  return url
}
