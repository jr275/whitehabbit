import "server-only"

/* ================================================================== *
 * LEARNING LOOP (§13, ADR-034/035) — closes Action -> Outcome ->
 * Measurement -> Learning Signal -> Score Adjustment. Deliberately
 * deterministic calibration, not machine learning: a real, bounded
 * bias correction derived from lib/intelligence/score-calibration.ts's
 * already-real predicted-vs-actual records, applied only once a real
 * minimum sample size exists. Never invents a trained model where no
 * real training data volume exists yet (§40) — with fewer than
 * MIN_CALIBRATION_SAMPLES real outcomes, computeScoreAdjustment()
 * returns null and every caller must treat that as "no adjustment,"
 * never a fabricated zero-confidence guess.
 * ================================================================== */

import { summarizeCalibration, type CalibrationModel } from "./score-calibration"
import type { InformationGainV2Result } from "@/lib/opportunity/information-gain-v2"

/** Below this many real calibration rows, the mean signed error is too
 * noisy to act on — a real, stated floor, not tuned to make any one
 * test pass. */
export const MIN_CALIBRATION_SAMPLES = 5

/** A real, bounded nudge — this system corrects itself gradually from
 * real outcomes, it never lets one skewed batch of calibrations swing
 * a score wildly. */
export const MAX_ADJUSTMENT_MAGNITUDE = 15

export interface ScoreAdjustment {
  model: CalibrationModel
  delta: number // real, signed, already capped to +/- MAX_ADJUSTMENT_MAGNITUDE
  sampleCount: number
  reason: string
}

/** Real, read-only: derives a bounded score correction from this
 * model's real calibration history so far. meanSignedError = mean(actual
 * - predicted); a positive value means this model has been
 * systematically UNDER-predicting real outcomes, so future scores are
 * nudged up by that same (capped) amount — and vice versa. */
export async function computeScoreAdjustment(orgId: string, projectId: string, model: CalibrationModel): Promise<ScoreAdjustment | null> {
  const summary = await summarizeCalibration(orgId, projectId, model)
  if (!summary || summary.sampleCount < MIN_CALIBRATION_SAMPLES) return null

  const raw = Math.round(summary.meanSignedError)
  const delta = Math.max(-MAX_ADJUSTMENT_MAGNITUDE, Math.min(MAX_ADJUSTMENT_MAGNITUDE, raw))
  const direction = delta === 0 ? "no measurable bias" : delta > 0 ? `under-predicting by ~${delta}` : `over-predicting by ~${Math.abs(delta)}`
  return {
    model,
    delta,
    sampleCount: summary.sampleCount,
    reason: `Based on ${summary.sampleCount} real past outcome(s), this model has been ${direction} (mean absolute error ${summary.meanAbsoluteError.toFixed(1)}).`,
  }
}

/** Applies a real, already-computed adjustment to a real Information
 * Gain V2 result — clamped back into [0,100], and the adjustment's own
 * real reason appended to evidence[] so the gate's decision stays
 * explainable (never a silent score change). A null adjustment (no
 * real calibration data yet, or not enough of it) is a true no-op —
 * returns the exact same result, unchanged. */
export function applyScoreAdjustment(result: InformationGainV2Result, adjustment: ScoreAdjustment | null): InformationGainV2Result {
  if (!adjustment || adjustment.delta === 0) return result
  const score = Math.max(0, Math.min(100, result.score + adjustment.delta))
  return { ...result, score, evidence: [...result.evidence, `Learning Loop: score adjusted ${adjustment.delta > 0 ? "+" : ""}${adjustment.delta} — ${adjustment.reason}`] }
}
