import "server-only"

/* ================================================================== *
 * BROWSER / PAGE EXTRACTION TOOL — a real HTTP fetch + text extraction.
 *
 * open(url) really requests the page; extract(html) really strips it
 * to readable text. It will only succeed against hosts this
 * environment's egress policy allows (registry.npmjs.org, pypi.org,
 * etc.) — anything else fails with a real network error, which is
 * reported truthfully rather than papered over. In a normal
 * deployment (no egress allowlist), the exact same code reaches any
 * public URL.
 *
 * ---- WHY safeFetch AND NOT assertSafeUrl + fetch -------------------
 *
 * This tool used to call assertSafeUrl(url) and then fetch(url). Both
 * steps resolve the hostname, independently. The guard validated the
 * answer to ITS query; fetch() then made its own query and connected
 * to whatever came back. A resolver under an attacker's control
 * answers public to the first and private to the second, and the
 * check is bypassed without ever having been wrong — the validated
 * address was simply not the connected one.
 *
 * safeFetch closes that by construction: it resolves once, validates
 * every address through the same shared guard, and hands the socket a
 * lookup hook pinned to an approved address. The Host header and TLS
 * SNI still carry the hostname, so virtual hosting and certificates
 * work normally. See lib/security/safe-fetch.ts.
 *
 * Redirects stay REFUSED here (maxRedirects: 0), which is what
 * redirect: "error" did before. safeFetch would revalidate every hop
 * safely, but following them is a product decision this tool has not
 * made, and this change is a security fix rather than a feature.
 *
 * A byte cap is new. The old code read an unbounded res.text() into
 * memory in order to keep the first 6000 characters; a very large
 * response was a denial of service against the worker.
 * ================================================================== */

import type { ToolActionResult, ToolDefinition } from "@/lib/agent/types"
import { logger } from "@/lib/observability/logger"
import { safeFetch, SafeFetchError, type SafeFetchOptions } from "@/lib/security/safe-fetch"

/** Matches the timeout the previous AbortSignal.timeout enforced. */
const FETCH_TIMEOUT_MS = 15_000

/** extractText keeps 6000 characters; this bounds what is read to get
 * them. Generous for a real page, fatal to a payload bomb. Same cap
 * Knowledge ingestion uses. */
const MAX_BYTES = 5_000_000

const FETCH_HEADERS = { accept: "text/html" }

export interface OpenPageInput {
  url: string
}

export interface OpenPageOutput {
  url: string
  title: string
  text: string
  fetchedAt: number
}

export interface OpenPageDeps {
  /** Test seam only. The SSRF guard and the address pin both run
   * inside safeFetch and OUTSIDE the transport, so substituting this
   * removes the socket and cannot weaken a single check. */
  transport?: SafeFetchOptions["transport"]
}

function extractText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : ""
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
  const text = withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
  return { title, text: text.slice(0, 6000) }
}

export async function openPage(
  input: OpenPageInput,
  deps: OpenPageDeps = {},
): Promise<ToolActionResult<OpenPageOutput>> {
  const started = Date.now()
  try {
    // input.url is Worker-configuration-controlled (Knowledge sources,
    // and any future user-supplied URL), so it stays untrusted all the
    // way down to the socket — which is the point of going through here.
    const res = await safeFetch(input.url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_BYTES,
      headers: FETCH_HEADERS,
      maxRedirects: 0,
      transport: deps.transport,
    })
    const { title, text } = extractText(res.body.toString("utf8"))
    return {
      ok: true,
      data: { url: res.finalUrl, title, text, fetchedAt: Date.now() },
      durationMs: Date.now() - started,
    }
  } catch (err) {
    if (err instanceof SafeFetchError) {
      // WHY the refusal happened — which range, which DNS error, which
      // redirect target — is an oracle for mapping an internal network.
      // It goes to the log and never to the caller.
      logger.warn("browser_open_refused", { code: err.code, detail: err.detail })
      return { ok: false, error: err.userMessage, durationMs: Date.now() - started }
    }
    logger.error("browser_open_error", { message: err instanceof Error ? err.message : String(err) })
    return { ok: false, error: "We couldn't reach that page.", durationMs: Date.now() - started }
  }
}

export const browserTool: ToolDefinition = {
  id: "tool_browser",
  name: "Browser",
  provider: "HTTP fetch",
  description: "Opens a real URL and extracts its page text for analysis.",
  isConnected: () => true,
  actions: [
    {
      id: "open",
      label: "Open page",
      permission: "read",
      riskLevel: "low",
      run: async (input: OpenPageInput) => openPage(input),
    },
  ],
}
