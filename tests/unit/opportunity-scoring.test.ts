import { describe, expect, it } from "vitest"
import { classifyScoreComponent, computeFinalScore } from "@/lib/opportunity/scoring"
import type { OpportunityScoreComponents } from "@/lib/opportunity/model"

/* §11: the Opportunity score must stay honest — NULL never becomes 0,
 * and every component is classified Known/Estimated/Unavailable. */

const ALL_NULL: OpportunityScoreComponents = {
  sourceGroundingScore: null,
  outlineCompletenessScore: null,
  confidenceScore: null,
  entityCoverageScore: null,
  demandScore: null,
  trendScore: null,
  businessValueScore: null,
  competitionScore: null,
  authorityGapScore: null,
  informationGainScore: null,
  citationPotentialScore: null,
  cannibalizationRiskScore: null,
}

describe("computeFinalScore", () => {
  it("returns null (never 0) when no component is available", () => {
    const result = computeFinalScore(ALL_NULL)
    expect(result.finalScore).toBeNull()
    expect(result.notes).toMatch(/0\/\d+/)
  })

  it("computes a real weighted average over only the available components", () => {
    const result = computeFinalScore({ ...ALL_NULL, entityCoverageScore: 100, informationGainScore: 50 })
    expect(result.finalScore).not.toBeNull()
    expect(result.finalScore).toBeGreaterThan(0)
    expect(result.finalScore).toBeLessThanOrEqual(100)
  })

  it("never lets an unavailable component silently drag the score toward 0", () => {
    // Only ONE strong component available — the score must reflect
    // that component, not be diluted by the other (absent) ones.
    const result = computeFinalScore({ ...ALL_NULL, entityCoverageScore: 90 })
    expect(result.finalScore).toBe(90)
  })
})

describe("classifyScoreComponent", () => {
  it("classifies a null value as unavailable regardless of which component it is", () => {
    expect(classifyScoreComponent("demandScore", null)).toBe("unavailable")
    expect(classifyScoreComponent("entityCoverageScore", null)).toBe("unavailable")
  })

  it("classifies a real, directly-computed component as known", () => {
    expect(classifyScoreComponent("entityCoverageScore", 80)).toBe("known")
    expect(classifyScoreComponent("informationGainScore", 60)).toBe("known")
  })

  it("classifies the heuristic business-value component as estimated, never known", () => {
    expect(classifyScoreComponent("businessValueScore", 70)).toBe("estimated")
  })
})
