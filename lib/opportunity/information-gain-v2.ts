import "server-only"

/* ================================================================== *
 * INFORMATION GAIN V2 (§23-24, ADR-027) — a richer, explainable model
 * layered on top of the v1 deterministic score (lib/opportunity/
 * information-gain.ts, unchanged and still used by the fast discovery-
 * time scoring path — see ADR-027 for why v1 stays the default there).
 * V2 adds the brief's named components, each honestly Known/Estimated/
 * Unavailable — never a fabricated number where real data doesn't
 * exist yet (§40). Available on demand (POST /api/v1/opportunities/
 * :id/information-gain) for a deeper look before committing to CREATE.
 * ================================================================== */

export type ComponentStatus = "known" | "unavailable"

export interface InformationGainComponent {
  score: number | null // 0-100, null when status is 'unavailable'
  status: ComponentStatus
  detail: string
}

export interface InformationGainV2Input {
  relatedEntityCount: number
  siblingEntityCount: number
  structuredDataEvidenceCount: number
  hasLocalEvidence: boolean
  hasMarketLink: boolean
  marketMetricObservationCount: number
  hasRoleLink: boolean
  roleHasRealFields: boolean
  externalDataObservationCount: number
  hasComputedDataObservation: boolean
  evidenceCount: number
  evidenceAvgConfidence: number | null
  evidenceVerifiedRatio: number | null
  mostRecentEvidenceAgeMs: number | null
  researchGapCount: number | null
  researchSourceCount: number | null
}

export interface InformationGainV2Result {
  score: number
  components: Record<string, InformationGainComponent>
  evidence: string[]
  missingRequirements: string[]
  recommendations: string[]
}

const FRESHNESS_EXCELLENT_MS = 30 * 24 * 60 * 60_000 // 30 days
const FRESHNESS_STALE_MS = 180 * 24 * 60 * 60_000 // 180 days

function scoreFreshness(ageMs: number | null): InformationGainComponent {
  if (ageMs == null) return { score: null, status: "unavailable", detail: "No evidence with a real retrieval timestamp exists yet." }
  if (ageMs <= FRESHNESS_EXCELLENT_MS) return { score: 100, status: "known", detail: "Most recent evidence is under 30 days old." }
  if (ageMs >= FRESHNESS_STALE_MS) return { score: 20, status: "known", detail: "Most recent evidence is over 180 days old — real, but stale." }
  const pct = 1 - (ageMs - FRESHNESS_EXCELLENT_MS) / (FRESHNESS_STALE_MS - FRESHNESS_EXCELLENT_MS)
  return { score: Math.round(20 + pct * 80), status: "known", detail: `Most recent evidence is ${Math.round(ageMs / 86_400_000)} days old.` }
}

export function computeInformationGainV2(input: InformationGainV2Input): InformationGainV2Result {
  const components: Record<string, InformationGainComponent> = {}

  components.originalData = input.externalDataObservationCount > 0
    ? { score: Math.min(100, input.externalDataObservationCount * 10), status: "known", detail: `${input.externalDataObservationCount} real external data observation(s) linked.` }
    : { score: null, status: "unavailable", detail: "No external data source has been ingested for this opportunity yet." }

  components.localSpecificity = input.hasLocalEvidence || input.hasMarketLink
    ? { score: input.hasLocalEvidence && input.hasMarketLink ? 100 : 60, status: "known", detail: "Real local/market-specific data is linked." }
    : { score: 0, status: "known", detail: "No local or market-specific data is linked." }

  components.freshness = scoreFreshness(input.mostRecentEvidenceAgeMs)

  components.evidenceQuality =
    input.evidenceCount > 0
      ? { score: Math.round(((input.evidenceAvgConfidence ?? 0) * 0.6 + (input.evidenceVerifiedRatio ?? 0) * 0.4) * 100), status: "known", detail: `${input.evidenceCount} evidence record(s), avg confidence ${(input.evidenceAvgConfidence ?? 0).toFixed(2)}.` }
      : { score: null, status: "unavailable", detail: "No evidence records exist for this opportunity yet." }

  components.entityDepth = { score: Math.min(100, input.relatedEntityCount * 20), status: "known", detail: `${input.relatedEntityCount} related entities in the Knowledge Graph.` }

  components.marketDepth =
    input.hasMarketLink
      ? { score: Math.min(100, input.marketMetricObservationCount * 15), status: "known", detail: `${input.marketMetricObservationCount} real market metric observation(s).` }
      : { score: null, status: "unavailable", detail: "No market is linked to this opportunity yet." }

  components.roleSpecificity = input.hasRoleLink
    ? { score: input.roleHasRealFields ? 100 : 40, status: "known", detail: input.roleHasRealFields ? "A role with real questions/pain points/KPIs is linked." : "A role is linked but has no real fields populated yet." }
    : { score: null, status: "unavailable", detail: "No role is linked to this opportunity yet." }

  components.uniqueCalculation = input.hasComputedDataObservation
    ? { score: 100, status: "known", detail: "A real computed/derived data observation is available — this can genuinely power a calculator or unique statistic." }
    : { score: null, status: "unavailable", detail: "No computed/derived data observation exists yet — never fabricated." }

  components.uniqueComparison = input.siblingEntityCount > 0
    ? { score: Math.min(100, input.siblingEntityCount * 25), status: "known", detail: `${input.siblingEntityCount} comparable entities enable a real comparison.` }
    : { score: 0, status: "known", detail: "No comparable entities exist yet." }

  components.proprietaryData = input.externalDataObservationCount > 0
    ? { score: 100, status: "known", detail: "Real, tenant-ingested external data exists for this opportunity." }
    : { score: 0, status: "known", detail: "No tenant-proprietary external data has been ingested." }

  components.firstPartyData = input.structuredDataEvidenceCount > 0
    ? { score: 100, status: "known", detail: `${input.structuredDataEvidenceCount} first-party structured-data fact(s) from the tenant's own site.` }
    : { score: 0, status: "known", detail: "No first-party structured data exists for this entity." }

  components.researchDepth =
    input.researchGapCount != null && input.researchSourceCount != null
      ? { score: Math.min(100, input.researchSourceCount * 15 + Math.min(30, input.researchGapCount * 10)), status: "known", detail: `Deep Research found ${input.researchSourceCount} real source(s) and ${input.researchGapCount} identified gap(s).` }
      : { score: null, status: "unavailable", detail: "No Deep Research artifact exists for this opportunity yet." }

  const known = Object.values(components).filter((c) => c.status === "known" && c.score != null)
  const score = known.length ? Math.round(known.reduce((sum, c) => sum + (c.score ?? 0), 0) / known.length) : 0

  const evidence = Object.entries(components).filter(([, c]) => c.status === "known").map(([k, c]) => `${k}: ${c.detail}`)
  const missingRequirements = Object.entries(components).filter(([, c]) => c.status === "unavailable").map(([k, c]) => `${k}: ${c.detail}`)

  const recommendations: string[] = []
  if (components.evidenceQuality.status === "unavailable") recommendations.push("RESEARCH — gather real evidence before generating a page.")
  if (components.freshness.status === "known" && (components.freshness.score ?? 100) < 40) recommendations.push("Refresh stale evidence before relying on it.")
  if (components.originalData.status === "unavailable" && components.marketDepth.status === "unavailable") recommendations.push("CREATE_DATA_ASSET — no original or market data exists; consider ingesting a real external dataset.")
  if (score < 40) recommendations.push("WAIT or MERGE — Information Gain is too low to justify a new page yet.")

  return { score, components, evidence, missingRequirements, recommendations }
}
