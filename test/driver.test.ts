import { describe, expect, it } from "vitest"
import { foldStageEvent, initPipelineState, isStageEvent, skipDownstreamStages } from "@/lib/agent/pipeline/driver"
import type { PipelineObjective } from "@/lib/workforce/model"

const objective: PipelineObjective = { objective: "test", constraints: [], criteria: [], requestedActions: [] }

describe("isStageEvent", () => {
  it("recognizes every real stage lifecycle event type", () => {
    for (const t of ["stage_started", "stage_completed", "stage_failed", "stage_blocked", "stage_skipped", "approval_required", "approval_rejected"] as const) {
      expect(isStageEvent(t)).toBe(true)
    }
  })
  it("does not treat an unrelated event type as a stage event", () => {
    expect(isStageEvent("task_started")).toBe(false)
    expect(isStageEvent("reasoning_completed")).toBe(false)
  })
})

describe("initPipelineState", () => {
  it("creates every declared stage as queued", () => {
    const state = initPipelineState(objective)
    expect(state.stages.length).toBeGreaterThan(0)
    expect(state.stages.every((s) => s.status === "queued")).toBe(true)
  })
})

describe("foldStageEvent — pure, real execution-graph state transitions", () => {
  it("initializes state from the first event's objective payload", () => {
    const state = foldStageEvent(undefined, "stage_started", { stage: "objective_intake", label: "Objective intake", objective }, 1000)
    expect(state?.objective).toEqual(objective)
    expect(state?.stages.find((s) => s.key === "objective_intake")?.status).toBe("running")
  })

  it("never mutates the state it was given — returns a new object", () => {
    const before = initPipelineState(objective)
    const after = foldStageEvent(before, "stage_started", { stage: "research" }, 1000)
    expect(before.stages.find((s) => s.key === "research")?.status).toBe("queued")
    expect(after?.stages.find((s) => s.key === "research")?.status).toBe("running")
  })

  it("stage_completed marks the matching stage completed with real detail/output", () => {
    let state = initPipelineState(objective)
    state = foldStageEvent(state, "stage_started", { stage: "research" }, 1000)!
    state = foldStageEvent(state, "stage_completed", { stage: "research", detail: "3 candidates", output: ["a", "b", "c"] }, 1500)!
    const stage = state.stages.find((s) => s.key === "research")!
    expect(stage.status).toBe("completed")
    expect(stage.detail).toBe("3 candidates")
    expect(stage.output).toEqual(["a", "b", "c"])
  })

  it("approval_required marks the matching stage waiting_for_approval", () => {
    let state = initPipelineState(objective)
    state = foldStageEvent(state, "stage_started", { stage: "salesforce_action" }, 1000)!
    state = foldStageEvent(state, "approval_required", { stage: "salesforce_action", detail: "requires approval" }, 1200)!
    expect(state.stages.find((s) => s.key === "salesforce_action")?.status).toBe("waiting_for_approval")
  })

  it("an event with no stage in its payload leaves state unchanged", () => {
    const state = initPipelineState(objective)
    const after = foldStageEvent(state, "stage_started", {}, 1000)
    expect(after).toBe(state)
  })

  it("returns the input unchanged when no objective has ever been seen and state is still undefined", () => {
    const result = foldStageEvent(undefined, "stage_completed", { stage: "research" }, 1000)
    expect(result).toBeUndefined()
  })
})

describe("skipDownstreamStages", () => {
  it("marks every still-queued stage after the given one as skipped, leaves earlier stages untouched", () => {
    let state = initPipelineState(objective)
    state = foldStageEvent(state, "stage_completed", { stage: "objective_intake" }, 1000)!
    state = foldStageEvent(state, "stage_completed", { stage: "research" }, 1000)!
    state = foldStageEvent(state, "approval_rejected", { stage: "salesforce_action", detail: "rejected" }, 1000)!

    const after = skipDownstreamStages(state, "salesforce_action")
    expect(after.stages.find((s) => s.key === "objective_intake")?.status).toBe("completed")
    expect(after.stages.find((s) => s.key === "research")?.status).toBe("completed")
    expect(after.stages.find((s) => s.key === "salesforce_action")?.status).toBe("rejected") // untouched — not "queued"
    expect(after.stages.find((s) => s.key === "slack_notify")?.status).toBe("skipped")
  })
})
