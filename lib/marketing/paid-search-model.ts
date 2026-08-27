/* ================================================================== *
 * PAID-SEARCH DATA MODEL — Marketing Workforce V1's normalized
 * concepts a paid-media Skill reasons over, independent of which ad
 * platform they came from.
 *
 *   Google Ads Connector  ↘
 *                           Normalizer -> PaidSearchDataset -> Skill
 *   Meta Ads Connector    ↗
 *
 * Deliberately its own file, not lib/marketing/model.ts — that file
 * is the pre-existing Marketing Super Agent's domain model (WORLD ->
 * BRAND -> AUDIENCE -> OPPORTUNITY -> CREATIVE, IntelligenceSignal/
 * CreativeOpportunity/CreativeConcept). This is a different, unrelated
 * marketing capability (paid-search performance analysis) that
 * happens to share the same top-level lib/marketing/ directory —
 * kept in its own file so neither domain's types collide or get
 * confused with the other's, and so touching one never risks the
 * other (see git history: this file replaces an earlier mistaken
 * edit that overwrote lib/marketing/model.ts directly).
 *
 * Today exactly one normalizer exists (lib/marketing/google-ads-data.ts,
 * and it never produces "connected" data — see that file's own header
 * for why). This file defines the SHAPE every future normalizer must
 * produce, so a Skill written against these types keeps working
 * unchanged the day a second real ad-platform connector exists —
 * matching the same "capability vs. connection" separation the
 * Connector Foundation already established for lib/connectors/types.ts.
 *
 * Every numeric field here is a REAL, computable fact about the
 * dataset it describes (a sum, a count, a ratio) — never a modeled or
 * predicted value. Modeled/predicted numbers (expected impact,
 * recoverable spend) live on the Skill's own output shape
 * (lib/agent/skills/search-waste-detection.ts), explicitly labeled as
 * estimates, never mixed into this layer.
 * ================================================================== */

/** Where this dataset's numbers actually came from — the one
 * distinction every marketing Skill and every UI surface must render
 * honestly, per the product brief's DEMO / CONNECTED / ERROR /
 * NOT_CONFIGURED boundary. "error" and "not_configured" never carry a
 * dataset — a Skill sees `dataset: null` for those the same way
 * lib/connectors/registry.ts's disabled connectors never fake a
 * result. */
export type MarketingDataSource = "demo" | "connected"

export interface Campaign {
  id: string
  name: string
  channel: "google_search" | "google_display" | "meta"
  status: "active" | "paused"
  spend: number
  conversions: number
  clicks: number
  impressions: number
}

export interface AdGroup {
  id: string
  campaignId: string
  name: string
  spend: number
  conversions: number
  clicks: number
  impressions: number
}

export type SearchIntent = "branded" | "high_intent" | "informational" | "irrelevant" | "unknown"

/** One real (or, in demo mode, realistically-shaped) search term a
 * campaign actually triggered on. `intent` starts "unknown" — it is
 * the deterministic classifier in lib/marketing/heuristics.ts that
 * assigns a real value, never the data layer itself guessing. */
export interface SearchTerm {
  id: string
  campaignId: string
  adGroupId: string
  term: string
  matchType: "exact" | "phrase" | "broad"
  spend: number
  clicks: number
  impressions: number
  conversions: number
  intent: SearchIntent
}

/** The full normalized paid-search dataset a Skill like Search Waste
 * Detection reasons over — one Campaign/AdGroup/SearchTerm graph, plus
 * the real aggregate totals (sums over the rows below, never a
 * separately-fabricated number) a report's Executive Summary quotes. */
export interface PaidSearchDataset {
  source: MarketingDataSource
  windowLabel: string
  campaigns: Campaign[]
  adGroups: AdGroup[]
  searchTerms: SearchTerm[]
  totals: {
    spend: number
    clicks: number
    impressions: number
    conversions: number
    searchTermCount: number
  }
}

export function computeTotals(campaigns: Campaign[], searchTerms: SearchTerm[]): PaidSearchDataset["totals"] {
  return {
    spend: round2(campaigns.reduce((sum, c) => sum + c.spend, 0)),
    clicks: campaigns.reduce((sum, c) => sum + c.clicks, 0),
    impressions: campaigns.reduce((sum, c) => sum + c.impressions, 0),
    conversions: campaigns.reduce((sum, c) => sum + c.conversions, 0),
    searchTermCount: searchTerms.length,
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Real, deterministic ratios — never estimated. Returns null (not 0)
 * when the denominator is genuinely zero, so a report never renders a
 * fabricated "0% CPA" for a campaign that hasn't spent anything. */
export function cpa(spend: number, conversions: number): number | null {
  return conversions > 0 ? round2(spend / conversions) : null
}

export function conversionRate(conversions: number, clicks: number): number | null {
  return clicks > 0 ? round2((conversions / clicks) * 100) : null
}
