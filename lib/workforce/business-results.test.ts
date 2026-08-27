import { describe, expect, it } from "vitest"
import { profileForWorker, provenanceForExecution } from "./business-results"
import { buildEmptyWorker } from "./seed"
import type { Skill, WorkerExecution } from "./model"

function execution(overrides: Partial<WorkerExecution> = {}): WorkerExecution {
  return {
    id: "exec_1",
    workerId: "worker_1",
    taskId: "task_1",
    status: "completed",
    startedAt: Date.now(),
    completedAt: Date.now(),
    ...overrides,
  }
}

describe("provenanceForExecution — DataProvenance x EconomicState must stay orthogonal", () => {
  it("returns not_connected when there is no execution at all", () => {
    expect(provenanceForExecution(undefined)).toBe("not_connected")
  })

  it("returns real for a completed, non-development execution with no explicit dataProvenance", () => {
    expect(provenanceForExecution(execution({ executionMode: undefined }))).toBe("real")
  })

  it("returns simulated for a development-mode LLM execution with no explicit dataProvenance", () => {
    expect(provenanceForExecution(execution({ executionMode: "development" }))).toBe("simulated")
  })

  it("CRITICAL: a skill's own dataProvenance always wins over executionMode-based inference", () => {
    // The exact case the trust model exists for: a REAL (non-development)
    // LLM call reasoning over DEMO financial data must report as "demo",
    // never silently upgraded to "real" just because the LLM call was real.
    const realLlmOverDemoData = execution({ executionMode: undefined, dataProvenance: "demo" })
    expect(provenanceForExecution(realLlmOverDemoData)).toBe("demo")
    expect(provenanceForExecution(realLlmOverDemoData)).not.toBe("real")
  })

  it("a development LLM call over demo data still reports demo, not simulated", () => {
    const devLlmOverDemoData = execution({ executionMode: "development", dataProvenance: "demo" })
    expect(provenanceForExecution(devLlmOverDemoData)).toBe("demo")
  })
})

describe("profileForWorker — matches by real skill category, not fragile keyword guessing", () => {
  function workerWithPrimarySkill(category: Skill["category"]): ReturnType<typeof buildEmptyWorker> {
    const worker = buildEmptyWorker("worker_test")
    const skill: Skill = { id: "skill_x", name: "Test Skill", category, outputType: "x", enabled: true }
    return { ...worker, skills: [skill, ...worker.skills] }
  }

  it("matches the finance profile for a worker whose primary skill is a finance skill, even with no 'finance' keyword in its name", () => {
    const worker = workerWithPrimarySkill("finance")
    worker.identity.name = "Ledger"
    worker.identity.role = "Cash & Working Capital Worker"
    worker.mission = "Monitor cash position and flag genuine risk."
    const profile = profileForWorker(worker)
    expect(profile.id).toBe("finance")
  })

  it("still matches sales by category the same way", () => {
    const worker = workerWithPrimarySkill("sales")
    const profile = profileForWorker(worker)
    expect(profile.id).toBe("sales")
  })
})
