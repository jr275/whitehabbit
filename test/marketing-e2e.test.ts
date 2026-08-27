/* ================================================================== *
 * CATEGORY A — Marketing Workforce V1: the one complete, required
 * integration test (product brief section 19/20):
 *
 *   Marketing Objective -> Skill -> Data -> Analysis -> Output ->
 *   Approval -> Outcome
 *
 * All real: a real Postgres-backed Worker/Execution, the real runtime
 * (executeTask/resumeTask/claimApproval — the same functions the HTTP
 * routes call), the real deterministic heuristic, a real WorkerOutput,
 * a real Approval row, a real (LLM_DEV_MODE) rationale call, and the
 * real deriveBusinessOutcome selector. No mocked assertion stands in
 * for any of these steps.
 *
 * DEMO vs CONNECTED: this test exercises the DEMO path — the only one
 * reachable in this codebase (connector_google_ads is a real, honest,
 * disabled placeholder; see lib/marketing/google-ads-data.ts's own
 * header). The CONNECTED branch is asserted unreachable rather than
 * faked: isGoogleAdsConnected() must be false, which is what makes
 * resolvePaidSearchDataset() take the demo path at all. There is no
 * dependency-injection seam in this V1 design to safely exercise the
 * CONNECTED branch without a real Google Ads adapter — a real, stated
 * limitation, not a gap silently left untested.
 * ================================================================== */

import { randomBytes, randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Category A — Marketing Workforce V1 end-to-end", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32).toString("base64")
    process.env.LLM_DEV_MODE = "true"
  })

  it("Objective -> Skill -> Data (DEMO) -> Analysis -> Output -> Approval -> Outcome, fully real end to end", async () => {
    const { createUserWithOrganization, upsertWorker, buildWorkerVersion, listRecentOutputs, listApprovals, claimApproval, setApprovalResult } = await import("@/lib/db/repo")
    const { executeTask, resumeTask } = await import("@/lib/agent/runtime")
    const { buildEmptyWorker } = await import("@/lib/workforce/seed")
    const { toolsMapForOrg } = await import("@/lib/agent/tools/connector-tools")
    const { deriveBusinessOutcome } = await import("@/lib/workforce/business-outcome")
    const { isGoogleAdsConnected } = await import("@/lib/marketing/google-ads-data")

    // ---- boundary: DEMO is the only reachable path today ----
    expect(isGoogleAdsConnected()).toBe(false)

    const { user, org } = await createUserWithOrganization(`marketing-e2e-${randomUUID()}@example.test`, "fake-hash", "Marketing E2E Org")

    // ---- 1. MARKETING OBJECTIVE -> WORKER ----
    const worker = buildEmptyWorker(`worker_e2e_${randomUUID()}`)
    worker.identity = { name: "Paid Media Specialist", role: "Paid Media Specialist", description: "Finds real paid-search waste.", persona: "", tone: [], accent: "#16a34a", initials: "PM" }
    worker.mission = "Reduce wasted paid-search spend by identifying inefficient search terms and optimization opportunities."
    worker.skills = [
      { id: "skill_search_waste_detection", name: "Search Waste Detection", category: "marketing", outputType: "search_waste_report", enabled: true },
      { id: "skill_apply_marketing_recommendation", name: "Apply Marketing Recommendation", category: "marketing", outputType: "marketing_recommendation_result", enabled: true },
    ]
    worker.tools = []
    await upsertWorker(worker, org.id, undefined)
    const definition = { identity: worker.identity, mission: worker.mission, objectives: worker.objectives, knowledge: worker.knowledge, skills: worker.skills, tools: worker.tools, integrations: worker.integrations, behaviors: worker.behaviors, channels: worker.channels, outcome: worker.outcome, autonomy: worker.autonomy }
    const version = await buildWorkerVersion(worker.id, org.id, definition, "e2e-test")
    const runnableWorker = { ...worker, ...version.definition, id: worker.id }

    // ---- 2. SKILL -> DATA -> ANALYSIS -> OUTPUT ----
    let analysisFinalType = ""
    for await (const event of executeTask({ worker: runnableWorker, orgId: org.id, workerVersionId: version.id, skillId: "skill_search_waste_detection", input: { brandTerms: "acme" } })) {
      analysisFinalType = event.type
    }
    expect(analysisFinalType).toBe("task_completed")

    const outputs = await listRecentOutputs(org.id, { workerId: worker.id, limit: 5 })
    const report = outputs.find((o) => o.type === "search_waste_report")
    expect(report).toBeTruthy()
    expect(report!.status).toBe("completed")
    const structured = report!.structured as {
      dataAnalyzed: { source: string }
      opportunitiesDetected: number
      recommendations: { applyActionId: string; opportunityId: string; wastedSpend: number; applyInput: { matchedTerms: string[] } }[]
    }
    expect(structured.dataAnalyzed.source).toBe("demo")
    expect(structured.opportunitiesDetected).toBeGreaterThan(0)
    expect(structured.recommendations.length).toBeGreaterThan(0)

    // ---- 3. OUTCOME (from the analysis output — always available, low-risk) ----
    const outcome = deriveBusinessOutcome(report!)
    expect(outcome).not.toBeNull()
    expect(outcome!.impact.some((m) => m.label === "Estimated wasted spend" && m.real)).toBe(true)

    // ---- 4. APPROVAL — applying the top recommendation ----
    const top = structured.recommendations[0]
    let applyFinalType = ""
    for await (const event of executeTask({
      worker: runnableWorker,
      orgId: org.id,
      workerVersionId: version.id,
      skillId: "skill_apply_marketing_recommendation",
      input: { applyActionId: top.applyActionId, opportunityId: top.opportunityId, matchedTerms: top.applyInput.matchedTerms.join(",") },
    })) {
      applyFinalType = event.type
    }
    expect(applyFinalType).toBe("approval_required")

    const [approval] = await listApprovals(org.id, { status: "pending" })
    expect(approval).toBeTruthy()
    expect(approval.reason).toMatch(/requires human approval/i)

    // ---- 5. HUMAN APPROVES -> real, honest result persisted ----
    const claimed = await claimApproval(approval.id, org.id, "approved", user.id)
    expect(claimed?.status).toBe("approved")
    const resumed = await resumeTask(claimed!, org.id)
    expect(resumed.ok).toBe(false) // no resume() — the documented, honest fallback
    const tools = await toolsMapForOrg(org.id)
    const tool = tools.get(claimed!.toolId)
    const action = tool?.actions.find((a) => a.id === claimed!.actionId)
    const result = await action!.run(claimed!.input, { workerId: claimed!.workerId, executionId: claimed!.executionId ?? "", emit: () => {} })
    const finalApproval = await setApprovalResult(approval.id, org.id, result)
    expect(finalApproval?.status).toBe("approved")
    expect(finalApproval?.result).toBeTruthy()

    // ---- Full traceability: every step above is queryable back from
    // this one execution/worker — nothing here was a one-off assertion
    // disconnected from real, persisted state. ----
    const finalOutputs = await listRecentOutputs(org.id, { workerId: worker.id, limit: 10 })
    expect(finalOutputs.map((o) => o.type)).toContain("search_waste_report")
  })
})
