import "server-only"

/* ================================================================== *
 * SSRF GUARD — validates a URL is safe to fetch server-side BEFORE
 * fetching it. Applied wherever a Tool fetches a URL that ultimately
 * traces back to user input (Knowledge sources, the Browser tool) —
 * see lib/agent/tools/browser.ts.
 *
 * Blocks:
 *   - non-http(s) schemes (file://, ftp://, gopher://, data:, ...)
 *   - localhost / loopback (127.0.0.0/8, ::1) — EXCEPT under Vitest
 *     (process.env.VITEST, set by the test runner itself, never true
 *     in a real deployment), where this codebase's established
 *     convention is a real local node:http server standing in for a
 *     provider (see allowLoopbackForTests() below) — every OTHER
 *     block below still applies unconditionally, test or not
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

/** Real, narrow test-only carve-out (connector platform audit, Fase
 * D3): this codebase's established test convention stands up a real
 * local node:http server as the fake "provider" boundary for every
 * connector test (never mocking policy logic — see
 * test/dynamic-connectors.test.ts, test/connection-lifecycle.test.ts,
 * etc.), which necessarily means fetching 127.0.0.1. Vitest sets
 * process.env.VITEST itself — this is never true in a real deployment.
 * Deliberately narrow: it only ever affects the LOOPBACK check
 * (isLoopback below), never link-local/metadata (169.254.0.0/16),
 * 10/8, 172.16/12, or 192.168/16 — a real SSRF test asserting those
 * ranges stay blocked still runs, and still passes, under Vitest.
 *
 * A function, not a module-load-time constant — read fresh on every
 * call. process.env.VITEST is already set by the time this module is
 * first imported, so caching it once would freeze in whatever value
 * happened to be set at import time; a live read is what actually
 * lets test/ssrf-guard.test.ts toggle it and observe both branches. */
function allowLoopbackForTests(): boolean {
  return process.env.VITEST === "true"
}

function isLoopback(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return ip.split(".")[0] === "127"
  if (version === 6) return ip.toLowerCase() === "::1"
  return false
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true // malformed — treat as unsafe
  const [a, b] = parts
  if (a === 127) return true // loopback
  if (a === 10) return true // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 169 && b === 254) return true // link-local incl. cloud metadata (169.254.169.254)
  if (a === 0) return true // 0.0.0.0/8
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  if (normalized === "::1") return true // loopback
  if (normalized === "::") return true // unspecified
  if (normalized.startsWith("fe80:") || normalized.startsWith("fe80::")) return true // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true // unique local (fc00::/7)
  if (normalized.startsWith("::ffff:")) return isPrivateIPv4(normalized.slice(7)) // IPv4-mapped
  return false
}

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return isPrivateIPv4(ip)
  if (version === 6) return isPrivateIPv6(ip)
  return true // not a recognizable IP — refuse rather than guess
}

// metadata.google.internal is NEVER allowed, test mode or not — it has
// no legitimate use in any test fixture. "localhost" is the one entry
// the test-mode carve-out actually applies to.
const ALWAYS_BLOCKED_HOSTNAMES = new Set(["metadata.google.internal"])
const LOOPBACK_HOSTNAMES = new Set(["localhost"])

function isBlockedAddress(address: string): boolean {
  if (isLoopback(address)) return !allowLoopbackForTests()
  return isPrivateIp(address)
}

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
  if (ALWAYS_BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeUrlError(`"${hostname}" is not a fetchable external host.`)
  }
  if (LOOPBACK_HOSTNAMES.has(hostname) && !allowLoopbackForTests()) {
    throw new UnsafeUrlError(`"${hostname}" is not a fetchable external host.`)
  }

  // literal IP in the URL — check directly, no DNS needed
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new UnsafeUrlError(`"${hostname}" is a private/internal address and cannot be fetched.`)
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
    if (isBlockedAddress(address)) {
      throw new UnsafeUrlError(`"${hostname}" resolves to a private/internal address and cannot be fetched.`)
    }
  }
  return url
}
