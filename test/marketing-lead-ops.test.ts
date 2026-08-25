import { describe, expect, it } from "vitest"
import { parseObjective, validateScores } from "@/lib/agent/skills/salesforce-lead-pipeline"

describe("parseObjective — section 1: structured input, never hardcoded to the example", () => {
  it("parses every field from a full structured input", () => {
    const objective = parseObjective({
      objective: "Find high-quality enterprise leads in Brazil",
      target: "Brazil",
      criteria: "enterprise scale, high intent",
      constraints: "exclude existing customers",
      requestedActions: "update_lead, notify_slack",
    })
    expect(objective).toEqual({
      objective: "Find high-quality enterprise leads in Brazil",
      target: "Brazil",
      criteria: ["enterprise scale", "high intent"],
      constraints: ["exclude existing customers"],
      requestedActions: ["update_lead", "notify_slack"],
    })
  })

  it("works from just an objective — every other field defaults to empty/undefined, never fabricated", () => {
    const objective = parseObjective({ objective: "Find leads in Germany" })
    expect(objective.objective).toBe("Find leads in Germany")
    expect(objective.target).toBeUndefined()
    expect(objective.criteria).toEqual([])
    expect(objective.constraints).toEqual([])
    expect(objective.requestedActions).toEqual([])
  })

  it("falls back to the legacy 'query' field for backward compatibility", () => {
    const objective = parseObjective({ query: "Legacy single-field input" })
    expect(objective.objective).toBe("Legacy single-field input")
  })

  it("is not hardcoded to any specific example objective — a completely different real objective parses just as well", () => {
    const objective = parseObjective({ objective: "Identify mid-market fintech companies in Southeast Asia expanding into payments", target: "Southeast Asia" })
    expect(objective.objective).toContain("fintech")
    expect(objective.target).toBe("Southeast Asia")
  })
})

describe("validateScores — section 4: LLM output is schema validated, never trusted blindly", () => {
  const ids = ["cand_0", "cand_1"]

  it("accepts a fully valid response", () => {
    const text = JSON.stringify({
      scores: [
        { id: "cand_0", leadScore: 84, qualification: "qualified", reasoningSummary: "Strong match.", recommendedAction: "Update and notify." },
        { id: "cand_1", leadScore: 40, qualification: "not_qualified", reasoningSummary: "Weak evidence.", recommendedAction: "Hold." },
      ],
    })
    const result = validateScores(text, ids)
    expect(result).toHaveLength(2)
    expect(result?.[0].leadScore).toBe(84)
  })

  it("strips markdown code fences before parsing", () => {
    const text = "```json\n" + JSON.stringify({ scores: [{ id: "cand_0", leadScore: 50, qualification: "not_qualified", reasoningSummary: "x", recommendedAction: "y" }] }) + "\n```"
    expect(validateScores(text, ids)).not.toBeNull()
  })

  it("rejects invalid JSON", () => {
    expect(validateScores("not json at all", ids)).toBeNull()
  })

  it("rejects a response missing the scores array", () => {
    expect(validateScores(JSON.stringify({ notScores: [] }), ids)).toBeNull()
  })

  it("rejects a leadScore outside [0, 100]", () => {
    const text = JSON.stringify({ scores: [{ id: "cand_0", leadScore: 150, qualification: "qualified", reasoningSummary: "x", recommendedAction: "y" }] })
    expect(validateScores(text, ids)).toBeNull()
  })

  it("rejects an id that doesn't match any real candidate — the LLM cannot invent a candidate", () => {
    const text = JSON.stringify({ scores: [{ id: "cand_999", leadScore: 80, qualification: "qualified", reasoningSummary: "x", recommendedAction: "y" }] })
    expect(validateScores(text, ids)).toBeNull()
  })

  it("rejects an invalid qualification enum value", () => {
    const text = JSON.stringify({ scores: [{ id: "cand_0", leadScore: 80, qualification: "maybe", reasoningSummary: "x", recommendedAction: "y" }] })
    expect(validateScores(text, ids)).toBeNull()
  })

  it("rejects a missing reasoningSummary — never persists an unexplained score", () => {
    const text = JSON.stringify({ scores: [{ id: "cand_0", leadScore: 80, qualification: "qualified", recommendedAction: "y" }] })
    expect(validateScores(text, ids)).toBeNull()
  })

  it("rejects an empty scores array", () => {
    expect(validateScores(JSON.stringify({ scores: [] }), ids)).toBeNull()
  })
})
