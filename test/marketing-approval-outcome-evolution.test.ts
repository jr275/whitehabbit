/* ================================================================== *
 * CATEGORY A — Marketing Workforce V1: approval enforcement, outcome
 * derivation, evolution recommendations (product brief section 19).
 *
 * Approval flow mirrors exactly what POST /api/approvals/[id]/decide
 * does (claimApproval -> resumeTask -> the non-resumed direct-action
 * fallback -> setApprovalResult) — the same real, exported runtime
 * functions the HTTP route calls, not a re-implementation.
 * ================================================================== */

import { randomBytes, randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Category A — marketing approval, outcome, evolution", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32).toString("base64")
    process.env.LLM_DEV_MODE = "true"
  })

  async function makeApplyRecommendationWorker(orgId: string) {
    const { upsertWorker, buildWorkerVersion } = await import("@/lib/db/repo")
    const { buildEmptyWorker } = await import("@/lib/workforce/seed")
    const worker = buildEmptyWorker(`worker_apply_${randomUUID()}`)
    worker.identity = { name: "Paid Media Specialist", role: "Test", description: "", persona: "", tone: [], accent: "#16a34a", initials: "PM" }
    worker.skills = [{ id: "skill_apply_marketing_recommendation", name: "Apply Marketing Recommendation", category: "marketing", outputType: "marketing_recommendation_result", enabled: true }]
    worker.tools = []
    await upsertWorker(worker, orgId, undefined)
    const definition = { identity: worker.identity, mission: worker.mission, objectives: worker.objectives, knowledge: worker.knowledge, skills: worker.skills, tools: worker.tools, integrations: worker.integrations, behaviors: worker.behaviors, channels: worker.channels, outcome: worker.outcome, autonomy: worker.autonomy }
    const version = await buildWorkerVersion(worker.id, orgId, definition, "apply-test")
    return { worker: { ...worker, ...version.definition, id: worker.id }, versionId: version.id }
  }

  it("applying a recommendation always requires real, server-side approval — a real Approval row is created before anything runs", async () => {
    const { createOrganization, listApprovals } = await import("@/lib/db/repo")
    const { executeTask } = await import("@/lib/agent/runtime")
    const org = await createOrganization(`Apply Approval ${randomUUID()}`)
    const { worker, versionId } = await makeApplyRecommendationWorker(org.id)

    let finalType = ""
    for await (const event of executeTask({
      worker,
      orgId: org.id,
      workerVersionId: versionId,
      skillId: "skill_apply_marketing_recommendation",
      input: { applyActionId: "add_negative_keyword", opportunityId: "waste_irrelevant_intent", suggestedNegativeKeywords: "free templates" },
    })) {
      finalType = event.type
    }
    // Never "task_completed" — a write action must halt for approval,
    // never silently auto-run.
    expect(finalType).toBe("approval_required")

    const pending = await listApprovals(org.id, { status: "pending" })
    expect(pending).toHaveLength(1)
    expect(pending[0].toolId).toBe("tool_marketing_actions")
    expect(pending[0].actionId).toBe("add_negative_keyword")
    expect(pending[0].permission).toBe("write")
  })

  it("Approve actually runs the real action (honest 'not applied — no connected ad account' result) — Reject runs nothing", async () => {
    const { createUserWithOrganization, listApprovals, claimApproval, setApprovalResult, getApproval } = await import("@/lib/db/repo")
    const { executeTask, resumeTask } = await import("@/lib/agent/runtime")
    const { toolsMapForOrg } = await import("@/lib/agent/tools/connector-tools")
    const { user, org } = await createUserWithOrganization(`apply-decide-${randomUUID()}@example.test`, "fake-hash", "Apply Decide Org")

    // --- APPROVE path ---
    const approveWorker = await makeApplyRecommendationWorker(org.id)
    for await (const _ of executeTask({ worker: approveWorker.worker, orgId: org.id, workerVersionId: approveWorker.versionId, skillId: "skill_apply_marketing_recommendation", input: { applyActionId: "add_negative_keyword" } })) {
      /* drain */
    }
    const [approvalToApprove] = await listApprovals(org.id, { status: "pending" })
    expect(approvalToApprove).toBeTruthy()

    const claimed = await claimApproval(approvalToApprove.id, org.id, "approved", user.id)
    expect(claimed?.status).toBe("approved")

    // This skill has no resume() — mirrors the real decide route's
    // documented fallback exactly.
    const resumed = await resumeTask(claimed!, org.id)
    expect(resumed.ok).toBe(false)

    const tools = await toolsMapForOrg(org.id)
    const tool = tools.get(claimed!.toolId)
    const action = tool?.actions.find((a) => a.id === claimed!.actionId)
    expect(tool && action).toBeTruthy()
    const result = await action!.run(claimed!.input, { workerId: claimed!.workerId, executionId: claimed!.executionId ?? "", emit: () => {} })
    expect(result.ok).toBe(true)
    const applied = await setApprovalResult(approvalToApprove.id, org.id, result)
    expect(applied?.status).toBe("approved")
    const appliedResult = applied?.result as { data?: { applied: boolean; note: string } } | undefined
    expect(appliedResult?.data?.applied).toBe(false)
    expect(appliedResult?.data?.note).toMatch(/no connected google ads account/i)

    // --- REJECT path ---
    const rejectWorker = await makeApplyRecommendationWorker(org.id)
    for await (const _ of executeTask({ worker: rejectWorker.worker, orgId: org.id, workerVersionId: rejectWorker.versionId, skillId: "skill_apply_marketing_recommendation", input: { applyActionId: "pause_campaign" } })) {
      /* drain */
    }
    const [approvalToReject] = await listApprovals(org.id, { status: "pending" })
    const rejected = await claimApproval(approvalToReject.id, org.id, "rejected", user.id)
    expect(rejected?.status).toBe("rejected")
    // Never decided twice, never silently re-run.
    const stillRejected = await getApproval(approvalToReject.id, org.id)
    expect(stillRejected?.status).toBe("rejected")
    expect(stillRejected?.result).toBeUndefined()
  })

  it("org B can never see or decide org A's marketing approval", async () => {
    const { createOrganization, listApprovals, getApproval, claimApproval } = await import("@/lib/db/repo")
    const { executeTask } = await import("@/lib/agent/runtime")
    const orgA = await createOrganization(`Apply Iso A ${randomUUID()}`)
    const orgB = await createOrganization(`Apply Iso B ${randomUUID()}`)
    const { worker, versionId } = await makeApplyRecommendationWorker(orgA.id)
    for await (const _ of executeTask({ worker, orgId: orgA.id, workerVersionId: versionId, skillId: "skill_apply_marketing_recommendation", input: { applyActionId: "adjust_budget" } })) {
      /* drain */
    }
    const [approvalA] = await listApprovals(orgA.id, { status: "pending" })
    expect(await getApproval(approvalA.id, orgB.id)).toBeNull()
    expect(await listApprovals(orgB.id, { status: "pending" })).toEqual([])
    expect(await claimApproval(approvalA.id, orgB.id, "approved", "test-user")).toBeNull()
  })

  it("deriveBusinessOutcome: a real search_waste_report output produces real impact numbers, clearly labeled — 'actual spend recovered' stays honestly unreal until applied", async () => {
    const { deriveBusinessOutcome } = await import("@/lib/workforce/business-outcome")
    const output = {
      id: "out_1",
      workerId: "w1",
      taskId: "t1",
      executionId: "e1",
      type: "search_waste_report",
      title: "Search Waste Optimization Report",
      content: "",
      structured: {
        dataAnalyzed: { source: "demo", searchTermCount: 200, spend: 5000, conversions: 40 },
        opportunitiesDetected: 2,
        recommendations: [{ label: "Add 3 negative keywords", wastedSpend: 300 }],
        expectedImpact: { estimatedWastedSpendMonthly: 300, potentialRecoverableSpendMonthly: 250, cpaImprovementPercentRange: [3, 6] },
      },
      status: "completed" as const,
      createdAt: Date.now(),
    }
    const outcome = deriveBusinessOutcome(output as never)
    expect(outcome).not.toBeNull()
    expect(outcome!.headline).toMatch(/DEMO DATA/)
    const spendMetric = outcome!.impact.find((m) => m.label === "Estimated wasted spend")
    expect(spendMetric).toEqual({ label: "Estimated wasted spend", value: "$300", real: true })
    const recoveredMetric = outcome!.impact.find((m) => m.label === "Actual spend recovered")
    expect(recoveredMetric?.real).toBe(false)
    expect(recoveredMetric?.connectHint).toMatch(/connect a real google ads account/i)
  })

  it("evolution: recommendSearchWasteEvolution requires real signal — null below the sample threshold, a real recommendation once real coverage is genuinely low", async () => {
    const { createOrganization, insertOutput, insertTask, insertExecution, upsertWorker } = await import("@/lib/db/repo")
    const { buildEmptyWorker } = await import("@/lib/workforce/seed")
    const { recommendSearchWasteEvolution } = await import("@/lib/marketing/evolution")
    const org = await createOrganization(`Evolution ${randomUUID()}`)
    const worker = buildEmptyWorker(`worker_evo_${randomUUID()}`)
    await upsertWorker(worker, org.id, undefined)
    const workerId = worker.id

    // A real Task+Execution+Output triple per "past run" — the same
    // FKs a genuine executeTask() run would satisfy, just seeded
    // directly so this test isolates the evolution function's own
    // threshold logic from the demo dataset's actual, fixed intent mix.
    // Ids are randomized per run (not "task_evo_0" etc.) — this test's
    // fixture rows persist in the real, shared dev database across
    // separate test invocations, so a fixed id would collide on rerun.
    async function seedPastRun(breakdown: Record<string, number>) {
      const now = Date.now()
      const taskId = `task_evo_${randomUUID()}`
      const executionId = `exec_evo_${randomUUID()}`
      await insertTask({ id: taskId, workerId, skillId: "skill_search_waste_detection", type: "marketing", title: "Detect paid-search waste", status: "completed", createdAt: now }, org.id, {})
      await insertExecution({ id: executionId, workerId, taskId, status: "completed", startedAt: now, completedAt: now }, org.id)
      await insertOutput(
        { id: `out_evo_${randomUUID()}`, workerId, taskId, executionId, type: "search_waste_report", title: "r", content: "", structured: { intentBreakdown: breakdown }, status: "completed", createdAt: now },
        org.id,
      )
    }

    // Fewer than MIN_SAMPLE_SIZE real executions — never a recommendation from insufficient data.
    for (let i = 0; i < 3; i++) await seedPastRun({ unknown: 80, high_intent: 20 })
    expect(await recommendSearchWasteEvolution(org.id, workerId)).toBeNull()

    // Reach the real sample threshold with a genuinely high unknown share.
    for (let i = 3; i < 6; i++) await seedPastRun({ unknown: 80, high_intent: 20 })
    const rec = await recommendSearchWasteEvolution(org.id, workerId)
    expect(rec).not.toBeNull()
    expect(rec!.skillId).toBe("skill_search_waste_detection")
    expect(rec!.currentVersion).toBe("1.0")
    expect(rec!.proposedVersion).toBe("1.1")
    expect(rec!.sampleSize).toBe(6)
    expect(rec!.unclassifiedSharePercent).toBe(80)
    expect(rec!.kind).toBe("new_heuristic")
  })
})
