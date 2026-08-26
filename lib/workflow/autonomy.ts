/* ================================================================== *
 * AUTONOMY POLICY (§13) — evaluated by the backend only. An LLM never
 * decides its own permission; this is a pure, deterministic function
 * over real, already-computed facts (quality/information-gain scores,
 * risk level) — never a prompt asking the model "should you publish?".
 * ================================================================== */

export type AutonomyLevel = "LEVEL_0" | "LEVEL_1" | "LEVEL_2" | "LEVEL_3" | "LEVEL_4"

export interface AutonomyThresholds {
  minInformationGain: number
  minQuality: number
  maxRisk: "low" | "medium" | "high" | "critical"
}

export const DEFAULT_AUTONOMY_THRESHOLDS: AutonomyThresholds = {
  minInformationGain: 60,
  minQuality: 70,
  maxRisk: "low",
}

export interface PublishDecisionInput {
  autonomyLevel: AutonomyLevel
  informationGainScore: number | null
  qualityScore: number | null
  riskLevel: "low" | "medium" | "high" | "critical"
  factsVerified: boolean
  schemaValid: boolean
}

export interface PublishDecision {
  autoPublishAllowed: boolean
  reasons: string[]
}

const RISK_RANK: Record<PublishDecisionInput["riskLevel"], number> = { low: 0, medium: 1, high: 2, critical: 3 }

/** LEVEL_0/1: a human always publishes — AI only ever drafts.
 * LEVEL_2: AI may publish, but only content the platform itself has
 *   already classified low-risk (no separate threshold check — the
 *   classification itself is the gate).
 * LEVEL_3: AI may publish if information_gain/quality clear real
 *   thresholds AND risk is at or below the configured ceiling AND
 *   facts are verified AND schema is valid — every condition named,
 *   every failure explained (never a silent "no").
 * LEVEL_4: fully autonomous with monitoring — same real checks as
 *   LEVEL_3 today (this codebase has no separate "monitoring" signal
 *   yet to justify a materially looser gate — see docs/architecture/
 *   risks.md). */
export function evaluatePublishAutonomy(input: PublishDecisionInput, thresholds: AutonomyThresholds = DEFAULT_AUTONOMY_THRESHOLDS): PublishDecision {
  const reasons: string[] = []

  if (input.autonomyLevel === "LEVEL_0" || input.autonomyLevel === "LEVEL_1") {
    return { autoPublishAllowed: false, reasons: [`${input.autonomyLevel} requires human approval for every publication.`] }
  }

  if (input.autonomyLevel === "LEVEL_2") {
    if (input.riskLevel !== "low") {
      return { autoPublishAllowed: false, reasons: [`LEVEL_2 only auto-publishes low-risk content; this content is classified ${input.riskLevel}.`] }
    }
    return { autoPublishAllowed: true, reasons: ["LEVEL_2: content is classified low-risk."] }
  }

  // LEVEL_3 / LEVEL_4
  if (input.informationGainScore == null || input.informationGainScore < thresholds.minInformationGain) {
    reasons.push(`Information Gain ${input.informationGainScore ?? "unavailable"} does not meet the required ${thresholds.minInformationGain}.`)
  }
  if (input.qualityScore == null || input.qualityScore < thresholds.minQuality) {
    reasons.push(`Quality score ${input.qualityScore ?? "unavailable"} does not meet the required ${thresholds.minQuality}.`)
  }
  if (RISK_RANK[input.riskLevel] > RISK_RANK[thresholds.maxRisk]) {
    reasons.push(`Risk level "${input.riskLevel}" exceeds the allowed ceiling "${thresholds.maxRisk}".`)
  }
  if (!input.factsVerified) reasons.push("Not every factual claim is verified.")
  if (!input.schemaValid) reasons.push("Generated schema (JSON-LD) failed validation.")

  return { autoPublishAllowed: reasons.length === 0, reasons: reasons.length ? reasons : [`${input.autonomyLevel}: all autonomous-publish conditions met.`] }
}
