import "server-only"

/* ================================================================== *
 * WEB SEARCH TOOL — real, keyless, no simulation.
 *
 * Provider: the public npm registry search API
 * (registry.npmjs.org/-/v1/search). It is genuinely public, requires
 * no API key, and — unlike Google/Bing/a generic search API — is
 * reachable from this environment's network egress policy, which
 * allowlists registry.npmjs.org but blocks general web hosts.
 *
 * This is an honest, working default, not a permanent design choice:
 * the ToolDefinition contract below is the same one a Google/Bing/
 * Tavily-backed implementation would satisfy, so swapping providers
 * once a search API key + allowlisted host are available is a
 * same-shaped, isolated change — see SEARCH_PROVIDER below.
 * ================================================================== */

import type { SourceRecord, ToolActionResult, ToolDefinition } from "@/lib/agent/types"

const NPM_SEARCH_URL = "https://registry.npmjs.org/-/v1/search"

interface NpmSearchResponse {
  total: number
  objects: {
    package: {
      name: string
      description?: string
      date: string
      links: { npm?: string; homepage?: string; repository?: string }
      publisher?: { username: string }
    }
    score: { final: number }
  }[]
}

export interface WebSearchInput {
  query: string
  limit?: number
}

export interface WebSearchOutput {
  results: SourceRecord[]
  provider: string
}

/** The real registry API's own documented constraint (ERR_TEXT_LENGTH:
 * "'text' must be between 2 and 64 characters") — not a WhiteHabbit
 * decision. A caller-supplied query (a Worker's mission, an operator's
 * free-text objective, a Product's onboarding-derived mission) can
 * easily run longer than that, so it is trimmed here, once, at the
 * real boundary that actually enforces the limit — trimmed at a word
 * boundary where possible so the query stays a real phrase, not a
 * hard-cut fragment. */
const NPM_TEXT_MAX = 64

function clampQuery(query: string): string {
  const trimmed = query.trim()
  if (trimmed.length <= NPM_TEXT_MAX) return trimmed
  const cut = trimmed.slice(0, NPM_TEXT_MAX)
  const lastSpace = cut.lastIndexOf(" ")
  return (lastSpace > NPM_TEXT_MAX * 0.5 ? cut.slice(0, lastSpace) : cut).trim()
}

export async function webSearch(input: WebSearchInput): Promise<ToolActionResult<WebSearchOutput>> {
  const started = Date.now()
  const limit = Math.min(20, input.limit ?? 10)
  const query = clampQuery(input.query)
  const url = `${NPM_SEARCH_URL}?text=${encodeURIComponent(query)}&size=${limit}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) {
      return { ok: false, errorCode: "provider_error", error: `npm registry search returned ${res.status}`, durationMs: Date.now() - started }
    }
    const json = (await res.json()) as NpmSearchResponse
    const results: SourceRecord[] = json.objects.map((o) => ({
      title: o.package.name,
      url: o.package.links.npm || o.package.links.homepage || `https://www.npmjs.com/package/${o.package.name}`,
      provider: "npm registry",
      snippet: o.package.description,
    }))
    return { ok: true, data: { results, provider: "npm registry (registry.npmjs.org)" }, durationMs: Date.now() - started }
  } catch (err) {
    return {
      ok: false,
      errorCode: "provider_error",
      error: err instanceof Error ? err.message : "Web search request failed",
      durationMs: Date.now() - started,
    }
  }
}

export const webSearchTool: ToolDefinition = {
  id: "tool_web_search",
  name: "Web Search",
  provider: "npm registry",
  description: "Searches the public npm registry for real, current package activity as a proxy for what's trending.",
  isConnected: () => true, // keyless, no credential required
  actions: [
    {
      id: "search",
      label: "Search",
      permission: "read",
      riskLevel: "low",
      run: async (input: WebSearchInput) => webSearch(input),
    },
  ],
}
