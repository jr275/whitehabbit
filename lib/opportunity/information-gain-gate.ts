/* ================================================================== *
 * INFORMATION GAIN GATE (§24) — a core product rule: below the real
 * threshold, do not create a new page. Recommends a real next action
 * instead, computed from which components are actually missing —
 * never a generic "try again later".
 * ================================================================== */

import type { InformationGainV2Result } from "./information-gain-v2"

export type InformationGainGateAction = "CREATE" | "REJECT" | "MERGE" | "ENRICH" | "WAIT" | "RESEARCH" | "CREATE_DATA_ASSET"

export interface InformationGainGateDecision {
  action: InformationGainGateAction
  allowed: boolean
  reason: string
}

// 35, not the rounder 40 originally guessed before this gate was ever
// wired into a real blocking path (Phase 6D): the first real
// opportunity ever run through it end to end — a real hub page for a
// small real business, with genuine entity depth, local specificity,
// first-party structured data, and real Deep Research — scored 38.
// A 40 threshold would categorically reject that legitimately-evidenced
// page with no real outcome data yet justifying such a strict bar.
// This is exactly the deterministic-first, calibrate-later posture
// this system commits to (§13/§14, ADR-034): revisit via
// ScoreCalibration once real Outcome data exists, not by guessing a
// second arbitrary number now.
export const DEFAULT_INFORMATION_GAIN_GATE_THRESHOLD = 35

export function evaluateInformationGainGate(
  result: InformationGainV2Result,
  hasExistingSimilarPage: boolean,
  threshold: number = DEFAULT_INFORMATION_GAIN_GATE_THRESHOLD,
  hasPrimarySubject = true,
): InformationGainGateDecision {
  if (result.score >= threshold) {
    return { action: "CREATE", allowed: true, reason: `Information Gain ${result.score} meets the threshold (${threshold}).` }
  }

  if (hasExistingSimilarPage) {
    return { action: "MERGE", allowed: false, reason: `Information Gain ${result.score} is below ${threshold}, and an equivalent page already exists — merge into it instead of creating a duplicate.` }
  }

  // Real, severe case (§5's REJECT action): this opportunity has no
  // real subject at all — no primary entity to gather evidence about,
  // so there is nothing to research, enrich, or wait for. Every other
  // component in InformationGainV2Result is unconditionally "known"
  // (possibly scoring 0) even with zero real signal, so this can only
  // be decided by the caller, which knows whether a real subject
  // exists — never inferred from the component set alone.
  if (!hasPrimarySubject) {
    return { action: "REJECT", allowed: false, reason: `Information Gain ${result.score} — this opportunity has no primary entity linked. There is no real subject to build a page from yet.` }
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
