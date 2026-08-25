// CATEGORY A — pure runtime test (no external credentials, no DB): the deterministic decision engine.
import { describe, expect, it } from "vitest"
import { decide } from "@/lib/agent/pipeline/decide"
import type { LlmScoreResult, PipelineObjective } from "@/lib/agent/pipeline/types"

const objective: PipelineObjective = { objective: "Find leads", constraints: [], criteria: [], requestedActions: [] }

function score(overrides: Partial<LlmScoreResult> = {}): LlmScoreResult {
  return { id: "cand_0", leadScore: 50, qualification: "not_qualified", reasoningSummary: "test", recommendedAction: "test", ...overrides }
}

describe("decide — deterministic decision engine, section 5", () => {
  it("score >= 80 is HIGH_PRIORITY with update_lead_and_notify", () => {
    const d = decide(score({ leadScore: 84 }), objective)
    expect(d.tier).toBe("high_priority")
    expect(d.action).toBe("update_lead_and_notify")
  })

  it("score in [60, 79] is REVIEW with update_lead_only — never notifies", () => {
    const d = decide(score({ leadScore: 65 }), objective)
    expect(d.tier).toBe("review")
    expect(d.action).toBe("update_lead_only")
  })

  it("score < 60 is LOW_PRIORITY with no_action — never writes, never notifies", () => {
    const d = decide(score({ leadScore: 40 }), objective)
    expect(d.tier).toBe("low_priority")
    expect(d.action).toBe("no_action")
  })

  it("the boundary values 80 and 60 land on the documented side", () => {
    expect(decide(score({ leadScore: 80 }), objective).tier).toBe("high_priority")
    expect(decide(score({ leadScore: 79 }), objective).tier).toBe("review")
    expect(decide(score({ leadScore: 60 }), objective).tier).toBe("review")
    expect(decide(score({ leadScore: 59 }), objective).tier).toBe("low_priority")
  })

  it("respects an operator's requestedActions that exclude notification — high priority still updates, never notifies", () => {
    const narrow: PipelineObjective = { ...objective, requestedActions: ["update_lead"] }
    const d = decide(score({ leadScore: 90 }), narrow)
    expect(d.action).toBe("update_lead_only")
  })

  it("respects an operator's requestedActions that exclude the CRM update entirely", () => {
    const narrow: PipelineObjective = { ...objective, requestedActions: ["notify_slack"] }
    const d = decide(score({ leadScore: 90 }), narrow)
    expect(d.action).toBe("no_action")
  })

  it("the LLM's score is only an input — this function, not the LLM, is what decides", () => {
    // A leadScore of 95 with qualification "not_qualified" still gets
    // HIGH_PRIORITY purely on the deterministic threshold — the LLM's
    // own "qualification" field is descriptive, never authoritative.
    const d = decide(score({ leadScore: 95, qualification: "not_qualified" }), objective)
    expect(d.tier).toBe("high_priority")
  })
})
