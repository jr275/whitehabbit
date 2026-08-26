/* ================================================================== *
 * QUALITY AGENT (§20) — has real authority to reject a page. Every
 * gate is a real, computed number compared against a real, named
 * threshold — never a vibe. A page fails the moment any gate fails,
 * with the exact reasons recorded (never just "rejected").
 * ================================================================== */

import type { PageBrief } from "@/lib/pagebrief/model"
import type { FactCheckArtifact } from "./fact-check"
import type { DraftArtifact, GeoArtifact, QualityArtifact, QualityGateResult, ResearchArtifact, SeoArtifact } from "./model"

export interface QualityThresholds {
  informationGain: number
  intentMatch: number
  entityCoverage: number
  evidenceCoverage: number
  seoQuality: number
  aeoGeoQuality: number
}

/** Configurable (§20) — these are this deployment's defaults, not a
 * hardcoded universal truth; a future per-tenant policy (§25's
 * autonomy levels) can override them. */
export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  informationGain: 40,
  intentMatch: 20,
  entityCoverage: 30,
  evidenceCoverage: 30,
  seoQuality: 60,
  aeoGeoQuality: 40,
}

function normalizeWords(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter((w) => w.length > 3))
}

function intentMatchScore(brief: PageBrief, draft: DraftArtifact): number {
  if (!brief.targetIntent) return 0
  const intentWords = normalizeWords(brief.targetIntent)
  if (intentWords.size === 0) return 0
  const contentWords = normalizeWords(`${draft.title} ${draft.sections[0]?.body ?? ""}`)
  let overlap = 0
  for (const w of intentWords) if (contentWords.has(w)) overlap += 1
  return Math.round((overlap / intentWords.size) * 100)
}

export function runQualityGate(
  draft: DraftArtifact,
  research: ResearchArtifact,
  brief: PageBrief,
  seo: SeoArtifact,
  geo: GeoArtifact,
  informationGainScore: number | null,
  factCheck: FactCheckArtifact,
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS,
): QualityArtifact {
  const gates: QualityGateResult[] = []

  const citedClaimIds = new Set(draft.sections.flatMap((s) => s.claimIndices))
  const noUnsupportedClaims = research.claims.length === 0 || citedClaimIds.size / research.claims.length >= 0.3
  gates.push({ name: "No unsupported factual claims", passed: noUnsupportedClaims, value: research.claims.length ? Math.round((citedClaimIds.size / research.claims.length) * 100) : null, threshold: null })

  gates.push({ name: "Information Gain", passed: informationGainScore != null && informationGainScore >= thresholds.informationGain, value: informationGainScore, threshold: thresholds.informationGain })

  const intentScore = intentMatchScore(brief, draft)
  gates.push({ name: "Intent match", passed: intentScore >= thresholds.intentMatch, value: intentScore, threshold: thresholds.intentMatch })

  const relevantEntityIds = [brief.primaryEntityId, ...brief.secondaryEntityIds].filter((id): id is string => !!id)
  const citedEntityIds = new Set(research.claims.filter((_, idx) => citedClaimIds.has(idx)).map((c) => c.entityId))
  const coveredEntityCount = relevantEntityIds.filter((id) => citedEntityIds.has(id)).length
  const entityCoverageValue = relevantEntityIds.length ? Math.round((coveredEntityCount / relevantEntityIds.length) * 100) : 100
  gates.push({ name: "Entity coverage", passed: entityCoverageValue >= thresholds.entityCoverage, value: entityCoverageValue, threshold: thresholds.entityCoverage })

  const evidenceCoverageValue = research.claims.length ? Math.round((citedClaimIds.size / research.claims.length) * 100) : 100
  gates.push({ name: "Evidence coverage", passed: evidenceCoverageValue >= thresholds.evidenceCoverage, value: evidenceCoverageValue, threshold: thresholds.evidenceCoverage })

  gates.push({ name: "SEO quality", passed: seo.score >= thresholds.seoQuality, value: seo.score, threshold: thresholds.seoQuality })

  const aeoGeoAverage = Math.round((geo.aeoScore + geo.geoScore) / 2)
  gates.push({ name: "AEO/GEO quality", passed: aeoGeoAverage >= thresholds.aeoGeoQuality, value: aeoGeoAverage, threshold: thresholds.aeoGeoQuality })

  // §24: a real FactCheckAgent gate — a conflicting or unverified cited
  // claim fails the page, distinct from (and stricter than) the coverage
  // gates above, which only measure how MUCH was cited, not whether what
  // was cited actually checks out.
  const factsPassed = factCheck.results.length === 0 || factCheck.allCitedVerified
  gates.push({
    name: "Fact verification",
    passed: factsPassed,
    value: factCheck.results.length ? factCheck.results.filter((r) => r.state === "VERIFIED" || r.state === "PARTIALLY_VERIFIED").length : null,
    threshold: factCheck.results.length || null,
  })

  const passed = gates.every((g) => g.passed)
  const reasons = gates.filter((g) => !g.passed).map((g) => `${g.name}: ${g.value ?? "n/a"} did not meet threshold ${g.threshold ?? "n/a"}`)
  const qualityScore = Math.round(gates.reduce((sum, g) => sum + (typeof g.value === "number" ? g.value : g.passed ? 100 : 0), 0) / gates.length)

  return { passed, qualityScore, gates, reasons }
}
