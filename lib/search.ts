import "server-only"

/* ================================================================== *
 * GLOBAL SEARCH (Phase 8 §21) — a real, tenant-scoped, bounded ILIKE
 * search across the object types the Command Palette needs to jump
 * to: Entities, Opportunities, Pages, Decisions, and Workers. Never a
 * fetch-everything-then-filter-in-the-browser search: every query is
 * already `WHERE org_id = $1 AND ... ILIKE $2 LIMIT $3` at the
 * database, and a blank/short query returns nothing rather than
 * scanning the whole table.
 *
 * Not a full-text index — this codebase has none, and building one is
 * standalone infrastructure work, not something to slip in under a
 * search-box UI. ILIKE against indexed org_id/project_id columns plus
 * a real result cap is the honest, correct-at-today's-scale choice;
 * see ADR risk log for the real follow-up once volume asks for it.
 * ================================================================== */

import { query } from "@/lib/db/client"

export type SearchResultType = "entity" | "opportunity" | "page" | "decision" | "worker"

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle: string | null
  href: string
}

const PER_TYPE_LIMIT = 6

export async function globalSearch(orgId: string, projectId: string | null, q: string): Promise<SearchResult[]> {
  const term = q.trim()
  if (term.length < 2) return []
  const like = `%${term}%`

  const [entities, opportunities, pages, decisions, workers] = await Promise.all([
    projectId
      ? query<{ id: string; name: string; entity_type: string }>(
          `SELECT id, name, entity_type FROM entities WHERE org_id = $1 AND project_id = $2 AND name ILIKE $3 ORDER BY updated_at DESC LIMIT $4`,
          [orgId, projectId, like, PER_TYPE_LIMIT],
        )
      : Promise.resolve([]),
    projectId
      ? query<{ id: string; title: string; status: string }>(
          `SELECT id, title, status FROM opportunities WHERE org_id = $1 AND project_id = $2 AND (title ILIKE $3 OR topic ILIKE $3) ORDER BY created_at DESC LIMIT $4`,
          [orgId, projectId, like, PER_TYPE_LIMIT],
        )
      : Promise.resolve([]),
    projectId
      ? query<{ id: string; title: string | null; slug: string; status: string }>(
          `SELECT id, title, slug, status FROM pages WHERE org_id = $1 AND project_id = $2 AND (title ILIKE $3 OR slug ILIKE $3) ORDER BY created_at DESC LIMIT $4`,
          [orgId, projectId, like, PER_TYPE_LIMIT],
        )
      : Promise.resolve([]),
    projectId
      ? query<{ id: string; action: string; reason: string; status: string }>(
          `SELECT id, action, reason, status FROM intelligence_decisions WHERE org_id = $1 AND project_id = $2 AND (reason ILIKE $3 OR action ILIKE $3) ORDER BY created_at DESC LIMIT $4`,
          [orgId, projectId, like, PER_TYPE_LIMIT],
        )
      : Promise.resolve([]),
    query<{ id: string; name: string; status: string }>(
      `SELECT id, name, status FROM workers WHERE org_id = $1 AND name ILIKE $2 ORDER BY updated_at DESC LIMIT $3`,
      [orgId, like, PER_TYPE_LIMIT],
    ),
  ])

  // Only /workforce/:id is a real per-record detail route today — link
  // the rest to their real list page rather than a query param no page
  // reads yet (never promise a deep-link/highlight that doesn't happen).
  const results: SearchResult[] = [
    ...entities.map((e): SearchResult => ({ type: "entity", id: e.id, title: e.name, subtitle: e.entity_type, href: `/knowledge` })),
    ...opportunities.map((o): SearchResult => ({ type: "opportunity", id: o.id, title: o.title, subtitle: `Opportunity · ${o.status}`, href: `/opportunities` })),
    ...pages.map((p): SearchResult => ({ type: "page", id: p.id, title: p.title ?? p.slug, subtitle: `Page · ${p.status}`, href: `/opportunities` })),
    ...decisions.map((d): SearchResult => ({ type: "decision", id: d.id, title: `${d.action.replaceAll("_", " ")}: ${d.reason}`.slice(0, 90), subtitle: `Decision · ${d.status}`, href: `/intelligence/decisions` })),
    ...workers.map((w): SearchResult => ({ type: "worker", id: w.id, title: w.name, subtitle: `Worker · ${w.status}`, href: `/workforce/${w.id}` })),
  ]

  return results
}
