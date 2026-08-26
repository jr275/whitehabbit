import "server-only"

/* ================================================================== *
 * SEARCH CONSOLE NORMALIZATION (§13) — deterministic where possible:
 * intent classification is a real, rule-based function (no fabricated
 * confidence); entity matching is real substring matching against this
 * project's ALREADY-KNOWN canonical entities — never a fabricated new
 * entity invented from a query string. A query that matches no known
 * entity simply gets entityId: null (§40 — honest "no match", never a
 * guess).
 * ================================================================== */

import { listCanonicalEntities } from "@/lib/knowledge/repo"
import { observeQuery, type Query } from "../queries"
import { getOrCreateMarket } from "../markets"

/** Real, deterministic — the project's own known market names (if any
 * were registered via lib/intelligence/markets.ts) matched against the
 * query text. Unlike entity matching, a market has no other detection
 * signal in this codebase yet, so this only ever matches an
 * ALREADY-REGISTERED market by name — it never invents a geography
 * from a query string it doesn't recognize. */
async function matchKnownMarket(orgId: string, projectId: string, text: string): Promise<string | null> {
  const { listMarkets } = await import("../markets")
  const markets = await listMarkets(orgId, projectId)
  const lower = text.toLowerCase()
  const match = markets.find((m) => lower.includes(m.name.toLowerCase()))
  return match?.id ?? null
}

export async function normalizeSearchQuery(orgId: string, projectId: string, queryText: string, source = "search_console"): Promise<Query> {
  const entities = await listCanonicalEntities(orgId, projectId, { limit: 1000 })
  const lower = queryText.toLowerCase()
  // longest-name-first so "barra da tijuca" wins over a shorter partial
  // match like "tijuca" if both happen to be registered entities.
  const matchedEntity = [...entities].sort((a, b) => b.name.length - a.name.length).find((e) => lower.includes(e.name.toLowerCase()))
  const marketId = await matchKnownMarket(orgId, projectId, queryText)

  return observeQuery({ orgId, projectId, text: queryText, entityId: matchedEntity?.id ?? null, marketId, source })
}

/** Registers a market by name if the caller already knows the real
 * geography a query maps to (e.g. from a project's onboarding
 * config) — never inferred automatically from free text. */
export async function registerMarket(orgId: string, projectId: string, name: string, geography?: string): Promise<void> {
  await getOrCreateMarket(orgId, projectId, name, geography ?? null)
}
