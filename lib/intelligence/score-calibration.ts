import "server-only"

/* ================================================================== *
 * SCORE CALIBRATION (§14, ADR-034) — real predicted-vs-actual records.
 * The infrastructure for future model training; today this is
 * deterministic bookkeeping only — no machine learning is claimed or
 * implemented where no real training data volume exists yet (§40).
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query } from "@/lib/db/client"

export type CalibrationModel = "opportunity_score" | "information_gain" | "trend" | "quality_forecast"

export interface ScoreCalibration {
  id: string
  orgId: string
  projectId: string
  model: CalibrationModel
  subjectType: string
  subjectId: string
  predictedValue: number
  actualValue: number
  delta: number
  outcomeId: string | null
  computedAt: number
}

interface CalibrationRow {
  id: string
  org_id: string
  project_id: string
  model: CalibrationModel
  subject_type: string
  subject_id: string
  predicted_value: number
  actual_value: number
  delta: number
  outcome_id: string | null
  computed_at: string
}

function rowToCalibration(r: CalibrationRow): ScoreCalibration {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    model: r.model,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    predictedValue: r.predicted_value,
    actualValue: r.actual_value,
    delta: r.delta,
    outcomeId: r.outcome_id,
    computedAt: Number(r.computed_at),
  }
}

export async function recordCalibration(input: {
  orgId: string
  projectId: string
  model: CalibrationModel
  subjectType: string
  subjectId: string
  predictedValue: number
  actualValue: number
  outcomeId?: string | null
}): Promise<ScoreCalibration> {
  const id = `cal_${randomUUID()}`
  const now = Date.now()
  const delta = input.actualValue - input.predictedValue
  await query(
    `INSERT INTO score_calibrations (id, org_id, project_id, model, subject_type, subject_id, predicted_value, actual_value, delta, outcome_id, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, input.orgId, input.projectId, input.model, input.subjectType, input.subjectId, input.predictedValue, input.actualValue, delta, input.outcomeId ?? null, now],
  )
  return { id, orgId: input.orgId, projectId: input.projectId, model: input.model, subjectType: input.subjectType, subjectId: input.subjectId, predictedValue: input.predictedValue, actualValue: input.actualValue, delta, outcomeId: input.outcomeId ?? null, computedAt: now }
}

export async function listCalibrations(orgId: string, projectId: string, model?: CalibrationModel, limit = 100): Promise<ScoreCalibration[]> {
  if (model) {
    const rows = await query<CalibrationRow>("SELECT * FROM score_calibrations WHERE org_id = $1 AND project_id = $2 AND model = $3 ORDER BY computed_at DESC LIMIT $4", [orgId, projectId, model, Math.min(limit, 500)])
    return rows.map(rowToCalibration)
  }
  const rows = await query<CalibrationRow>("SELECT * FROM score_calibrations WHERE org_id = $1 AND project_id = $2 ORDER BY computed_at DESC LIMIT $3", [orgId, projectId, Math.min(limit, 500)])
  return rows.map(rowToCalibration)
}

/** Real, deterministic calibration summary — mean absolute error and
 * mean signed error (bias direction) per model, computed from
 * whatever real calibration rows exist. Returns null (never a
 * fabricated 0) for a model with no real calibration data yet. */
export interface CalibrationSummary {
  model: CalibrationModel
  sampleCount: number
  meanAbsoluteError: number
  meanSignedError: number // positive = predictions run low on average; negative = predictions run high
}

export async function summarizeCalibration(orgId: string, projectId: string, model: CalibrationModel): Promise<CalibrationSummary | null> {
  const rows = await listCalibrations(orgId, projectId, model, 500)
  if (rows.length === 0) return null
  const meanAbsoluteError = rows.reduce((sum, r) => sum + Math.abs(r.delta), 0) / rows.length
  const meanSignedError = rows.reduce((sum, r) => sum + r.delta, 0) / rows.length
  return { model, sampleCount: rows.length, meanAbsoluteError, meanSignedError }
}
