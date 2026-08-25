import "server-only"

/* ================================================================== *
 * SAFE FETCH — the one hardened outbound-HTTP entry point for any
 * caller whose URL originates from org/user configuration (a Custom
 * REST Connector's baseUrl, an MCP server's endpointUrl) rather than
 * from this codebase's own hardcoded provider URLs. Combines three
 * real protections that existed separately or not at all before this
 * module (connector platform audit, Fase D3):
 *
 *   1. assertSafeUrl() (lib/security/ssrf-guard.ts) — already real,
 *      already used by the Browser tool, just not by the dynamic-
 *      connector call sites this module now serves too.
 *   2. redirect: "error" — never silently follow a redirect. A
 *      provider that redirects legitimately (e.g. http -> https) will
 *      surface as a real, honest failure rather than this code
 *      quietly re-fetching a second URL assertSafeUrl() never saw.
 *      Same choice lib/agent/tools/browser.ts's openPage() already
 *      makes — reused, not reinvented.
 *   3. A real response-size cap, enforced by reading the body stream
 *      incrementally (never trusting a Content-Length header alone —
 *      a malicious/misconfigured server can omit or lie about it).
 *
 * Static provider adapters (Salesforce, Slack, Google Analytics) are
 * NOT required to route through this — their base URLs are fixed,
 * reviewed, hardcoded strings, not organization input. This module
 * exists specifically for the org-configurable case.
 * ================================================================== */

import { assertSafeUrl } from "./ssrf-guard"

export const DEFAULT_MAX_RESPONSE_BYTES = 5_000_000 // 5MB — generous for a real JSON REST API response, small enough to bound memory use per call

export class ResponseTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Response exceeded the ${maxBytes}-byte limit — aborted before reading the rest.`)
    this.name = "ResponseTooLargeError"
  }
}

/** Validates the URL (SSRF guard) and performs the real fetch with
 * redirects refused outright. Throws UnsafeUrlError (from the guard)
 * before any network call for an unsafe URL — never a silent skip. */
export async function safeFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  const url = await assertSafeUrl(rawUrl)
  return fetch(url, { ...init, redirect: "error" })
}

/** Reads a Response body as text, aborting (never buffering past the
 * cap) if it exceeds maxBytes — real protection against a malicious or
 * misconfigured endpoint returning an unbounded response, not just a
 * Content-Length check (which a server can omit or misreport). */
export async function readBoundedText(res: Response, maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES): Promise<string> {
  const declaredLength = res.headers.get("content-length")
  if (declaredLength && Number(declaredLength) > maxBytes) throw new ResponseTooLargeError(maxBytes)

  if (!res.body) return await res.text()

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new ResponseTooLargeError(maxBytes)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8")
}

/** The common shape every dynamic-connector caller actually needs:
 * safe fetch + bounded read + real JSON-or-text parsing by
 * content-type, matching the exact pattern lib/connectors/custom-
 * rest.ts and lib/connectors/mcp-client.ts each used to hand-roll. */
export async function safeFetchJson<T = unknown>(rawUrl: string, init: RequestInit = {}, maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES): Promise<{ res: Response; data: T | string | null }> {
  const res = await safeFetch(rawUrl, init)
  const text = await readBoundedText(res, maxBytes)
  const contentType = res.headers.get("content-type") ?? ""
  if (!text) return { res, data: null }
  if (contentType.includes("application/json")) {
    try {
      return { res, data: JSON.parse(text) as T }
    } catch {
      return { res, data: null }
    }
  }
  return { res, data: text }
}
