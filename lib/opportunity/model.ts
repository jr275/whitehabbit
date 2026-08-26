/* ================================================================== *
 * OPPORTUNITY ENGINE — domain types. See docs/adr/ADR-006, ADR-015,
 * ADR-016, docs/architecture/domain-model.md.
 *
 * Every *Score field is `number | null` — `null` means "not yet
 * computed," never a guessed/default value (docs/adr/ADR-005). A
 * consumer must render `null` as "not available," never as 0. See
 * scoring.ts's classifyScoreComponent() for the Known/Estimated/
 * Unavailable classification the UI must show (§11).
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

/** Real, deterministic gap types the discovery pipeline (§10) can
 * produce — never fabricated categories, always derived from an
 * actual observed gap in the Knowledge Graph. */
export type OpportunityType = "entity_coverage_gap" | "market_gap" | "question_gap" | "comparison" | "supporting_content" | "hub" | "spoke" | "trend_driven"

export interface OpportunityScoreComponents {
  /** % of this run's identified opportunities that cite a real source — computed for skill-sourced opportunities only. */
  sourceGroundingScore: number | null
  /** % of this run's identified opportunities with a full (>=3 section) outline — computed for skill-sourced opportunities only. */
  outlineCompletenessScore: number | null
  /** This specific opportunity's own stated confidence (0-100) — computed today. */
  confidenceScore: number | null
  /** Real, computed from evidence + relationship counts for the primary entity (§11) — "Known" whenever a primary entity exists. */
  entityCoverageScore: number | null
  /** Reserved — requires Search Console (§32). Not computed in this revision. */
  demandScore: number | null
  /** Reserved — requires a trend data source (§31). Not computed in this revision. */
  trendScore: number | null
  /** A real but heuristic (type-based) weighting — "Estimated", not a measured business metric. Computed for discovery-sourced opportunities. */
  businessValueScore: number | null
  /** Reserved — requires SERP/competition data. Not computed in this revision. */
  competitionScore: number | null
  /** Reserved — requires a real authority/backlink signal. Not computed in this revision. */
  authorityGapScore: number | null
  /** A real, deterministic InformationGainService result (§12, §19 — amends ADR-015). "Known" for discovery-sourced opportunities. */
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
  sourceExecutionId: string | null
  sourceOutputId: string | null
  sourceAgentRunId: string | null
  websiteId: string | null
  opportunityType: OpportunityType | null
  primaryEntityId: string | null
  title: string
  topic: string
  targetIntent: string | null
  outline: string[]
  status: OpportunityStatus
  finalScore: number | null
  scoreNotes: string | null
  informationGainReasons: string[] | null
  reviewedBy: string | null
  reviewedAt: number | null
  createdAt: number
  updatedAt: number
}
