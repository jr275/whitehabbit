import "server-only"

/* ================================================================== *
 * PAGE INTELLIGENCE FEEDBACK (§32) — real snapshots of a page's score
 * components over time. Search/AI-visibility fields are NULL (never
 * fabricated as 0) whenever no real Search Console/AI Visibility data
 * exists yet for that page — an honest "unavailable", not a silent
 * zero that could be misread as "no traffic."
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query } from "@/lib/db/client"
import { getPage } from "@/lib/pages/repo"
import { listPageObservations } from "./search-console/repo"
import { listCitationsForPage } from "./ai-visibility/repo"

export type PageScoreMilestone = "pre_publish" | "day_30" | "day_60" | "day_90" | "manual"

export interface PageScoreSnapshot {
  id: string
  orgId: string
  pageId: string
  takenAt: number
  milestone: PageScoreMilestone
  technicalSeoScore: number | null
  entityCoverageScore: number | null
  informationGainScore: number | null
  intentMatchScore: number | null
  aeoScore: number | null
  geoScore: number | null
  evidenceScore: number | null
  freshnessScore: number | null
  internalLinksCount: number | null
  businessValueScore: number | null
  searchClicks: number | null
  searchImpressions: number | null
  aiVisibilityMentions: number | null
}

/** Real: reads the page's OWN already-computed scores (seo/aeo/geo/
 * informationGain — Phase 3/4 real fields, never re-estimated here),
 * plus real search/AI-visibility counts where a matching property/
 * citation exists. Never fabricates a number for a dimension with no
 * real source yet. */
export async function takePageScoreSnapshot(orgId: string, pageId: string, milestone: PageScoreMilestone, propertyId?: string | null): Promise<PageScoreSnapshot> {
  const page = await getPage(pageId, orgId)
  if (!page) throw new Error(`Page ${pageId} not found for this organization.`)

  let searchClicks: number | null = null
  let searchImpressions: number | null = null
  if (propertyId && page.canonicalUrl) {
    const obs = await listPageObservations(propertyId, orgId, 500)
    const matching = obs.filter((o) => o.pageUrl === page.canonicalUrl)
    if (matching.length > 0) {
      searchClicks = matching.reduce((sum, o) => sum + o.clicks, 0)
      searchImpressions = matching.reduce((sum, o) => sum + o.impressions, 0)
    }
  }

  const citations = await listCitationsForPage(orgId, pageId)
  const aiVisibilityMentions = citations.length > 0 ? citations.length : null

  const id = `pss_${randomUUID()}`
  const now = Date.now()
  await query(
    `INSERT INTO page_score_snapshots (id, org_id, page_id, taken_at, milestone, technical_seo_score, entity_coverage_score, information_gain_score, intent_match_score, aeo_score, geo_score, evidence_score, freshness_score, internal_links_count, business_value_score, search_clicks, search_impressions, ai_visibility_mentions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      id,
      orgId,
      pageId,
      now,
      milestone,
      page.seoScore,
      null, // entity_coverage_score is opportunity-level today (Phase 3), not yet mirrored onto Page — honest NULL rather than a copy that could drift
      page.informationGainScore,
      null, // intent_match_score: no real intent-match computation exists for a published page yet
      page.aeoScore,
      page.geoScore,
      null, // evidence_score: no real page-level evidence-quality rollup exists yet (see lib/opportunity/information-gain-v2.ts for the opportunity-level equivalent)
      null, // freshness_score: computed the same way information-gain-v2's freshness component is, but not yet wired to a page's own evidence — real future work
      null, // internal_links_count: lib/internal-links/* creates real links but doesn't yet expose a per-page count query — real future work, not fabricated here
      null, // business_value_score: no real page-level business-value model exists yet (only the opportunity-level heuristic, ADR-006)
      searchClicks,
      searchImpressions,
      aiVisibilityMentions,
    ],
  )
  return {
    id,
    orgId,
    pageId,
    takenAt: now,
    milestone,
    technicalSeoScore: page.seoScore,
    entityCoverageScore: null,
    informationGainScore: page.informationGainScore,
    intentMatchScore: null,
    aeoScore: page.aeoScore,
    geoScore: page.geoScore,
    evidenceScore: null,
    freshnessScore: null,
    internalLinksCount: null,
    businessValueScore: null,
    searchClicks,
    searchImpressions,
    aiVisibilityMentions,
  }
}

interface SnapshotRow {
  id: string
  org_id: string
  page_id: string
  taken_at: string
  milestone: PageScoreMilestone
  technical_seo_score: number | null
  entity_coverage_score: number | null
  information_gain_score: number | null
  intent_match_score: number | null
  aeo_score: number | null
  geo_score: number | null
  evidence_score: number | null
  freshness_score: number | null
  internal_links_count: number | null
  business_value_score: number | null
  search_clicks: number | null
  search_impressions: number | null
  ai_visibility_mentions: number | null
}

function rowToSnapshot(r: SnapshotRow): PageScoreSnapshot {
  return {
    id: r.id,
    orgId: r.org_id,
    pageId: r.page_id,
    takenAt: Number(r.taken_at),
    milestone: r.milestone,
    technicalSeoScore: r.technical_seo_score,
    entityCoverageScore: r.entity_coverage_score,
    informationGainScore: r.information_gain_score,
    intentMatchScore: r.intent_match_score,
    aeoScore: r.aeo_score,
    geoScore: r.geo_score,
    evidenceScore: r.evidence_score,
    freshnessScore: r.freshness_score,
    internalLinksCount: r.internal_links_count,
    businessValueScore: r.business_value_score,
    searchClicks: r.search_clicks,
    searchImpressions: r.search_impressions,
    aiVisibilityMentions: r.ai_visibility_mentions,
  }
}

export async function listPageScoreSnapshots(orgId: string, pageId: string): Promise<PageScoreSnapshot[]> {
  const rows = await query<SnapshotRow>("SELECT * FROM page_score_snapshots WHERE org_id = $1 AND page_id = $2 ORDER BY taken_at ASC", [orgId, pageId])
  return rows.map(rowToSnapshot)
}
