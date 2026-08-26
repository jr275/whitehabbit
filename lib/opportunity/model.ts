/* ================================================================== *
 * OPPORTUNITY ENGINE — domain types. See docs/adr/ADR-006, ADR-015,
 * docs/architecture/domain-model.md.
 *
 * Every *Score field is `number | null` — `null` means "not yet
 * computed," never a guessed/default value (docs/adr/ADR-005). A
 * consumer must render `null` as "not available," never as 0.
 * ================================================================== */

export type OpportunityStatus =
  | "discovered"
  | "qualified"
  | "approved"
  | "rejected"
  | "generating"
  | "published"
  | "monitoring"
  | "stale"
  | "merged"

export interface OpportunityScoreComponents {
  /** % of this run's identified opportunities that cite a real source — computed today. */
  sourceGroundingScore: number | null
  /** % of this run's identified opportunities with a full (>=3 section) outline — computed today. */
  outlineCompletenessScore: number | null
  /** This specific opportunity's own LLM-stated confidence (0-100) — computed today. */
  confidenceScore: number | null
  /** Reserved — requires Search Console (§32). Not computed in this revision. */
  demandScore: number | null
  /** Reserved — requires a trend data source (§31). Not computed in this revision. */
  trendScore: number | null
  /** Reserved — requires tenant-defined business-value weighting on real demand data. Not computed in this revision. */
  businessValueScore: number | null
  /** Reserved — requires SERP/competition data. Not computed in this revision. */
  competitionScore: number | null
  /** Reserved — requires a real authority/backlink signal. Not computed in this revision. */
  authorityGapScore: number | null
  /** Reserved — requires a real InformationGainService (§19, ADR-015); gates generation when present. Not computed in this revision. */
  informationGainScore: number | null
  /** Reserved — requires AI-visibility tracking (§33). Not computed in this revision. */
  citationPotentialScore: number | null
  /** Reserved — requires existing-page corpus comparison (§69). Not computed in this revision. */
  cannibalizationRiskScore: number | null
}

export interface Opportunity extends OpportunityScoreComponents {
  id: string
  orgId: string
  projectId: string
  sourceExecutionId: string
  sourceOutputId: string
  primaryEntityId: string | null
  title: string
  topic: string
  targetIntent: string | null
  outline: string[]
  status: OpportunityStatus
  finalScore: number | null
  scoreNotes: string | null
  reviewedBy: string | null
  reviewedAt: number | null
  createdAt: number
  updatedAt: number
}
