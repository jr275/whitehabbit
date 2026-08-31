import { describe, expect, it } from "vitest"
import { assertSafeUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard"

/* ================================================================== *
 * SSRF REGRESSION SUITE
 *
 * Ingestion asks the server to make an HTTP request to an address a
 * stranger chose, so this file is written as an attacker's checklist
 * rather than as illustrative coverage. Every entry below was actually
 * attempted against the guard; the ones marked with a comment were
 * REACHABLE before this suite existed.
 * ================================================================== */

const blocked = async (url: string) => {
  await expect(assertSafeUrl(url), url).rejects.toBeInstanceOf(UnsafeUrlError)
}

describe("SSRF guard — loopback and link-local", () => {
  it.each([
    ["hostname", "http://localhost/"],
    ["hostname with port", "http://localhost:8080/admin"],
    ["dotted quad", "http://127.0.0.1/"],
    ["whole 127/8", "http://127.99.88.77/"],
    ["IPv6 loopback", "http://[::1]/"],
    ["IPv6 loopback, expanded", "http://[0::1]/"],
    ["IPv4-mapped IPv6", "http://[::ffff:127.0.0.1]/"],
    ["IPv4-mapped IPv6, hex tail", "http://[::ffff:7f00:1]/"],
    ["unspecified v4", "http://0.0.0.0/"],
    ["unspecified v6", "http://[::]/"],
    ["cloud metadata", "http://169.254.169.254/latest/meta-data/iam/"],
    ["link-local v4", "http://169.254.1.1/"],
    ["google metadata by name", "http://metadata.google.internal/"],
  ])("blocks %s", async (_label, url) => { await blocked(url) })
})

describe("SSRF guard — numeric spellings of a loopback address", () => {
  /* WHATWG URL normalizes all of these to 127.0.0.1 before the guard
   * ever sees them, which is why they are refused. These tests exist
   * so that a future change of URL parser cannot silently reopen the
   * bypass. */
  it.each([
    ["decimal", "http://2130706433/"],
    ["octal", "http://0177.0.0.1/"],
    ["hex", "http://0x7f000001/"],
    ["dotted hex", "http://0x7f.0x0.0x0.0x1/"],
    ["short form", "http://127.1/"],
    ["zero padded", "http://127.000.000.001/"],
  ])("blocks %s", async (_label, url) => { await blocked(url) })
})

describe("SSRF guard — private and non-public ranges", () => {
  it.each([
    ["10/8", "http://10.0.0.1/"],
    ["172.16/12 low", "http://172.16.0.1/"],
    ["172.16/12 high", "http://172.31.255.254/"],
    ["192.168/16", "http://192.168.1.1/"],
    // REGRESSION: reachable before this suite. RFC 6598 carrier-grade
    // NAT — cloud platforms route real internal services here.
    ["CGNAT 100.64/10 low", "http://100.64.0.1/"],
    ["CGNAT 100.64/10 high", "http://100.127.255.254/"],
    // REGRESSION: IETF protocol assignments / benchmarking ranges.
    ["IETF 192.0.0/24", "http://192.0.0.8/"],
    ["benchmarking 198.18/15", "http://198.18.0.1/"],
    ["benchmarking 198.19/16", "http://198.19.255.254/"],
    // REGRESSION: multicast, reserved and broadcast.
    ["multicast 224/4", "http://224.0.0.1/"],
    ["reserved 240/4", "http://240.0.0.1/"],
    ["broadcast", "http://255.255.255.255/"],
    ["documentation 192.0.2/24", "http://192.0.2.1/"],
    ["documentation 203.0.113/24", "http://203.0.113.1/"],
  ])("blocks %s", async (_label, url) => { await blocked(url) })

  it("still allows a genuinely public address", async () => {
    await expect(assertSafeUrl("http://100.63.255.255/")).resolves.toBeInstanceOf(URL) // just below CGNAT
    await expect(assertSafeUrl("http://128.0.0.1/")).resolves.toBeInstanceOf(URL)
  })
})

describe("SSRF guard — IPv6 ranges", () => {
  it.each([
    ["unique local fc00::/7", "http://[fc00::1]/"],
    ["unique local fd00::/8", "http://[fd00::1]/"],
    ["link-local fe80::", "http://[fe80::1]/"],
    // REGRESSION: fe80::/10 spans fe80–febf, but the check only
    // matched the literal text "fe80:", so these were reachable.
    ["link-local fe90::", "http://[fe90::1]/"],
    ["link-local feaf::", "http://[feaf::1]/"],
    ["link-local febf::", "http://[febf::1]/"],
    // REGRESSION: deprecated site-local, still routed on some networks.
    ["site-local fec0::", "http://[fec0::1]/"],
    // REGRESSION: a private IPv4 smuggled inside an apparently-public
    // IPv6 address. 2002:7f00:0001:: is 6to4 for 127.0.0.1.
    ["6to4 wrapping loopback", "http://[2002:7f00:0001::]/"],
    ["6to4 wrapping 10/8", "http://[2002:0a00:0001::]/"],
    ["6to4 wrapping metadata", "http://[2002:a9fe:a9fe::]/"],
    ["NAT64 wrapping loopback", "http://[64:ff9b::7f00:1]/"],
    ["NAT64 wrapping metadata", "http://[64:ff9b::a9fe:a9fe]/"],
  ])("blocks %s", async (_label, url) => { await blocked(url) })

  it("allows a public IPv6 address", async () => {
    await expect(assertSafeUrl("http://[2606:4700:4700::1111]/")).resolves.toBeInstanceOf(URL)
    // 6to4 wrapping a genuinely public v4 is itself public
    await expect(assertSafeUrl("http://[2002:0808:0808::]/")).resolves.toBeInstanceOf(URL)
  })
})

describe("SSRF guard — URL shape", () => {
  it.each([
    ["file", "file:///etc/passwd"],
    ["ftp", "ftp://example.com/x"],
    ["gopher", "gopher://127.0.0.1/"],
    ["data", "data:text/html,<script>alert(1)</script>"],
    ["javascript", "javascript:fetch('http://169.254.169.254')"],
    ["dict", "dict://127.0.0.1:11211/"],
  ])("blocks the %s scheme", async (_label, url) => { await blocked(url) })

  it("blocks credentials pointing at an internal host", async () => {
    // userinfo is a classic way to make a URL LOOK like it targets a
    // public host in a UI while actually targeting the last @-segment.
    await blocked("http://user:pw@127.0.0.1/")
    await blocked("http://a@b@127.0.0.1/")
    await blocked("http://github.com@127.0.0.1/")
  })

  it("blocks an internal host on a non-standard port", async () => {
    await blocked("http://127.0.0.1:22/")
    await blocked("http://10.0.0.1:6379/")   // redis
    await blocked("http://127.0.0.1:11211/") // memcached
  })

  it("rejects malformed input rather than guessing", async () => {
    for (const bad of ["", "   ", "http://", "not a url", "http://[::"]) {
      await blocked(bad)
    }
  })

  it("blocks a hostname that does not resolve", async () => {
    await blocked("http://this-host-does-not-exist.invalid/")
  })
})
