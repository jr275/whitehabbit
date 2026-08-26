/* ================================================================== *
 * INFORMATION GAIN GATE (§24) — a core product rule: below the real
 * threshold, do not create a new page. Recommends a real next action
 * instead, computed from which components are actually missing —
 * never a generic "try again later".
 * ================================================================== */

import type { InformationGainV2Result } from "./information-gain-v2"

export type InformationGainGateAction = "CREATE" | "MERGE" | "ENRICH" | "WAIT" | "RESEARCH" | "CREATE_DATA_ASSET"

export interface InformationGainGateDecision {
  action: InformationGainGateAction
  allowed: boolean
  reason: string
}

export const DEFAULT_INFORMATION_GAIN_GATE_THRESHOLD = 40

export function evaluateInformationGainGate(
  result: InformationGainV2Result,
  hasExistingSimilarPage: boolean,
  threshold: number = DEFAULT_INFORMATION_GAIN_GATE_THRESHOLD,
): InformationGainGateDecision {
  if (result.score >= threshold) {
    return { action: "CREATE", allowed: true, reason: `Information Gain ${result.score} meets the threshold (${threshold}).` }
  }

  if (hasExistingSimilarPage) {
    return { action: "MERGE", allowed: false, reason: `Information Gain ${result.score} is below ${threshold}, and an equivalent page already exists — merge into it instead of creating a duplicate.` }
  }

  const missingEvidence = result.components.evidenceQuality?.status === "unavailable"
  const missingData = result.components.originalData?.status === "unavailable" && result.components.marketDepth?.status === "unavailable"
  const staleOnly = (result.components.freshness?.score ?? 100) < 40 && result.components.evidenceQuality?.status === "known"

  if (missingData) {
    return { action: "CREATE_DATA_ASSET", allowed: false, reason: `Information Gain ${result.score} is below ${threshold} — no original or market data exists. Ingest a real external dataset before creating a page.` }
  }
  if (missingEvidence) {
    return { action: "RESEARCH", allowed: false, reason: `Information Gain ${result.score} is below ${threshold} — no real evidence exists yet. Run Deep Research before creating a page.` }
  }
  if (staleOnly) {
    return { action: "ENRICH", allowed: false, reason: `Information Gain ${result.score} is below ${threshold} because existing evidence is stale — refresh it rather than starting from zero.` }
  }
  return { action: "WAIT", allowed: false, reason: `Information Gain ${result.score} is below ${threshold} and no single missing component explains why — wait for more signal before creating a page.` }
}
