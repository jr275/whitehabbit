import "server-only"

/* ================================================================== *
 * TAVILY SEARCH TOOL — a real, general-web search provider.
 *
 * This does NOT replace lib/agent/tools/web-search.ts. That tool is
 * keyless and backed by the npm registry, which is the one search-like
 * host this environment's egress policy allowlists; it stays as the
 * honest default for a deployment with no search credential.
 *
 * This is the other half of that story: when TAVILY_API_KEY is set and
 * api.tavily.com is reachable, this tool returns real, current web
 * pages — titles, URLs, and the provider's own extracted content —
 * which is what a research skill needs to cite something a reader can
 * actually open.
 *
 * Both satisfy the same ToolDefinition contract, so a worker chooses
 * one by which tool is registered on it, not by a branch in a skill.
 *
 * THE CREDENTIAL NEVER LEAVES THIS FILE. It is read from the server
 * environment at call time, written only into an Authorization header,
 * and every provider message that travels back out (into a log, an
 * execution row, or the UI) goes through sanitizeProviderMessage()
 * first. No code path puts the key into a URL, a result, or an error.
 * ================================================================== */

import type { SourceRecord, ToolActionResult, ToolDefinition } from "@/lib/agent/types"

const TAVILY_SEARCH_URL = "https://api.tavily.com/search"

/** Tavily's own documented ceiling for `max_results`. */
const MAX_RESULTS = 20
const DEFAULT_RESULTS = 8

const REQUEST_TIMEOUT_MS = 20_000

export interface TavilySearchInput {
  query: string
  limit?: number
}

/** A SourceRecord plus the provider's own relevance score, kept
 *  separate rather than folded into the record: `score` is Tavily's
 *  number on Tavily's scale, and nothing downstream may compare it
 *  against another provider's. */
export interface TavilySource extends SourceRecord {
  score?: number
}

export interface TavilySearchOutput {
  results: TavilySource[]
  provider: string
}

/* ---- the wire shape we actually read ------------------------------ */

interface TavilyResultRow {
  title?: unknown
  url?: unknown
  content?: unknown
  score?: unknown
}

interface TavilyResponseBody {
  results?: unknown
}

interface TavilyErrorBody {
  detail?: unknown
  error?: unknown
  message?: unknown
}

/* ---- credential handling ------------------------------------------ */

function apiKey(): string | undefined {
  return process.env.TAVILY_API_KEY || undefined
}

export function isTavilyConnected(): boolean {
  return !!apiKey()
}

export const TAVILY_NOT_CONNECTED_REASON = "Configure TAVILY_API_KEY for this deployment."

/** Defence in depth against ever echoing the credential outward.
 *
 *  Tavily's error bodies do not echo the key back — this is a backstop
 *  for the case where some future body does, plus a hard cap so a
 *  runaway HTML error page cannot become a 40KB "error message" on an
 *  execution row. `tvly-` is Tavily's documented key prefix. */
export function sanitizeProviderMessage(message: string): string {
  return message.replace(/tvly-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 300)
}

/** Pull a human-readable message out of whichever error shape came
 *  back, without ever returning the raw body wholesale. */
function providerMessage(body: TavilyErrorBody | null, status: number): string {
  const candidate = [body?.detail, body?.error, body?.message].find((v) => typeof v === "string" && v.trim())
  return sanitizeProviderMessage(typeof candidate === "string" ? candidate : `HTTP ${status}`)
}

/* ---- response parsing --------------------------------------------- */

/** A row is admissible only if it carries the two things a citation
 *  cannot be built without: something to call it, and somewhere to go.
 *  A row missing either is dropped rather than patched with a
 *  placeholder — a source a reader cannot open is not a source. */
function toSource(row: TavilyResultRow): TavilySource | null {
  const url = typeof row.url === "string" ? row.url.trim() : ""
  if (!url) return null
  const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : url
  const snippet = typeof row.content === "string" && row.content.trim() ? row.content.trim() : undefined
  const score = typeof row.score === "number" && Number.isFinite(row.score) ? row.score : undefined
  return { title, url, provider: "tavily", snippet, score }
}

/* ---- the call ------------------------------------------------------ */

export interface TavilySearchDeps {
  fetchImpl?: typeof fetch
}

export async function tavilySearch(input: TavilySearchInput, deps: TavilySearchDeps = {}): Promise<ToolActionResult<TavilySearchOutput>> {
  const started = Date.now()
  const fetchImpl = deps.fetchImpl ?? fetch

  const query = input.query?.trim() ?? ""
  if (!query) {
    return { ok: false, errorCode: "execution_error", error: "Tavily search requires a non-empty query.", durationMs: Date.now() - started }
  }

  const key = apiKey()
  if (!key) {
    // A missing credential is a deployment task, not a failed call —
    // `blocked` is the state the runtime maps to SkillBlockedError and
    // the UI renders as NOT CONFIGURED with the reason attached.
    return { ok: false, blocked: true, blockedReason: TAVILY_NOT_CONNECTED_REASON, durationMs: Date.now() - started }
  }

  const maxResults = Math.max(1, Math.min(MAX_RESULTS, Math.floor(input.limit ?? DEFAULT_RESULTS)))

  try {
    const res = await fetchImpl(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: "basic",
        // The skill synthesises from the sources itself; a second,
        // provider-written answer would be an ungrounded shortcut
        // sitting next to a grounded one.
        include_answer: false,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as TavilyErrorBody | null
      const message = providerMessage(body, res.status)

      // 401/403 mean the key we sent was rejected — separately
      // actionable from "the service is having a bad day", and the
      // distinction is what tells an operator to rotate a key rather
      // than retry.
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          errorCode: "invalid_credential",
          error: `Tavily rejected the configured API key (${res.status}): ${message}`,
          durationMs: Date.now() - started,
        }
      }
      return { ok: false, errorCode: "provider_error", error: `Tavily search returned ${res.status}: ${message}`, durationMs: Date.now() - started }
    }

    const json = (await res.json().catch(() => null)) as TavilyResponseBody | null
    if (!json || !Array.isArray(json.results)) {
      return { ok: false, errorCode: "provider_error", error: "Tavily returned a response without a results array.", durationMs: Date.now() - started }
    }

    const results = (json.results as TavilyResultRow[]).map(toSource).filter((s): s is TavilySource => s !== null)

    return {
      ok: true,
      data: { results, provider: "Tavily (api.tavily.com)" },
      durationMs: Date.now() - started,
    }
  } catch (err) {
    // AbortSignal.timeout rejects with a TimeoutError DOMException;
    // saying so plainly beats "the request failed" when the fix is a
    // different timeout or a reachable host.
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
    return {
      ok: false,
      errorCode: "provider_error",
      error: timedOut
        ? `Tavily search timed out after ${REQUEST_TIMEOUT_MS}ms.`
        : sanitizeProviderMessage(err instanceof Error ? err.message : "Tavily search request failed"),
      durationMs: Date.now() - started,
    }
  }
}

export const tavilySearchTool: ToolDefinition = {
  id: "tool_tavily_search",
  name: "Tavily Search",
  provider: "tavily",
  description: "Searches the live web through Tavily and returns real pages with their titles, URLs and extracted content.",
  isConnected: isTavilyConnected,
  get notConnectedReason() {
    return TAVILY_NOT_CONNECTED_REASON
  },
  actions: [
    {
      id: "search",
      label: "Search",
      permission: "read",
      riskLevel: "low",
      run: async (input: TavilySearchInput) => tavilySearch(input),
    },
  ],
}
