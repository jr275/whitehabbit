import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { recordCalibration } from "@/lib/intelligence/score-calibration"
import { computeScoreAdjustment, applyScoreAdjustment, MIN_CALIBRATION_SAMPLES, MAX_ADJUSTMENT_MAGNITUDE } from "@/lib/intelligence/learning-loop"
import type { InformationGainV2Result } from "@/lib/opportunity/information-gain-v2"

async function seedProject() {
  const email = `learn-${randomUUID()}@example.test`
  const { org } = await createUserWithOrganization(email, "hashed-not-real", `Org ${email}`)
  const project = await getOrCreateDefaultProject(org.id)
  return { orgId: org.id, projectId: project.id }
}

function fakeResult(score: number): InformationGainV2Result {
  return { score, components: {}, evidence: [], missingRequirements: [], recommendations: [] }
}

/* §13 Learning Loop (ADR-034/035) — real, deterministic calibration,
 * never fabricated machine learning. */
describe("computeScoreAdjustment — real, bounded bias correction", () => {
  it("returns null (a true no-op) below the real minimum sample size", async () => {
    const { orgId, projectId } = await seedProject()
    for (let i = 0; i < MIN_CALIBRATION_SAMPLES - 1; i++) {
      await recordCalibration({ orgId, projectId, model: "information_gain", subjectType: "opportunity", subjectId: `opp_${i}`, predictedValue: 40, actualValue: 60 })
    }
    const adjustment = await computeScoreAdjustment(orgId, projectId, "information_gain")
    expect(adjustment).toBeNull()
  })

  it("once enough real samples exist, computes a real, signed adjustment from actual bias", async () => {
    const { orgId, projectId } = await seedProject()
    // real, consistent under-prediction: predicted 40, actual always 60 (delta +20 each)
    for (let i = 0; i < MIN_CALIBRATION_SAMPLES; i++) {
      await recordCalibration({ orgId, projectId, model: "information_gain", subjectType: "opportunity", subjectId: `opp_${i}`, predictedValue: 40, actualValue: 60 })
    }
    const adjustment = await computeScoreAdjustment(orgId, projectId, "information_gain")
    expect(adjustment).not.toBeNull()
    expect(adjustment!.sampleCount).toBe(MIN_CALIBRATION_SAMPLES)
    expect(adjustment!.delta).toBeGreaterThan(0) // real under-prediction -> a positive (upward) nudge
    expect(adjustment!.reason).toContain("under-predicting")
  })

  it("caps the adjustment magnitude even when the real bias is much larger", async () => {
    const { orgId, projectId } = await seedProject()
    for (let i = 0; i < MIN_CALIBRATION_SAMPLES; i++) {
      await recordCalibration({ orgId, projectId, model: "information_gain", subjectType: "opportunity", subjectId: `opp_${i}`, predictedValue: 10, actualValue: 90 }) // delta +80
    }
    const adjustment = await computeScoreAdjustment(orgId, projectId, "information_gain")
    expect(adjustment!.delta).toBe(MAX_ADJUSTMENT_MAGNITUDE) // never an unbounded swing
  })

  it("a different model's calibration data never leaks into another model's adjustment", async () => {
    const { orgId, projectId } = await seedProject()
    for (let i = 0; i < MIN_CALIBRATION_SAMPLES; i++) {
      await recordCalibration({ orgId, projectId, model: "opportunity_score", subjectType: "opportunity", subjectId: `opp_${i}`, predictedValue: 10, actualValue: 90 })
    }
    const adjustment = await computeScoreAdjustment(orgId, projectId, "information_gain")
    expect(adjustment).toBeNull() // "information_gain" has zero real rows of its own
  })
})

describe("applyScoreAdjustment — pure, explainable", () => {
  it("a null adjustment is a true no-op — the exact same result", () => {
    const result = fakeResult(38)
    expect(applyScoreAdjustment(result, null)).toBe(result)
  })

  it("applies a real delta, clamped into [0,100], with the reason appended to evidence", () => {
    const result = fakeResult(38)
    const adjusted = applyScoreAdjustment(result, { model: "information_gain", delta: 10, sampleCount: 5, reason: "test reason" })
    expect(adjusted.score).toBe(48)
    expect(adjusted.evidence.some((e) => e.includes("test reason"))).toBe(true)

    const clampedHigh = applyScoreAdjustment(fakeResult(95), { model: "information_gain", delta: 15, sampleCount: 5, reason: "x" })
    expect(clampedHigh.score).toBe(100)
    const clampedLow = applyScoreAdjustment(fakeResult(5), { model: "information_gain", delta: -15, sampleCount: 5, reason: "x" })
    expect(clampedLow.score).toBe(0)
  })
})
