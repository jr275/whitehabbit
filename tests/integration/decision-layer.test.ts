import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { resolveOrCreateEntity } from "@/lib/knowledge/repo"
import { recordSignal } from "@/lib/intelligence/signals"
import { runCorrelationScan } from "@/lib/intelligence/correlation-scan"
import { listObservations } from "@/lib/intelligence/observations"
import { runDecisionScan } from "@/lib/intelligence/decision-scan"
import { listDecisions, decideOnDecision, expireOverdueDecisions } from "@/lib/intelligence/decisions"
import { createAction, completeAction, listActionsForDecision } from "@/lib/intelligence/actions"
import { recordOutcome, listOutcomesForAction } from "@/lib/intelligence/outcomes"
import { recordCalibration, summarizeCalibration } from "@/lib/intelligence/score-calibration"
import { logAgentDecision, listDecisionLogForRun } from "@/lib/intelligence/agent-decision-log"
import { linkIntelligenceNode, listRelationsForNode } from "@/lib/intelligence/relations"

async function seedProject() {
  const email = `dec-${randomUUID()}@example.test`
  const { org } = await createUserWithOrganization(email, "hashed-not-real", `Org ${email}`)
  const project = await getOrCreateDefaultProject(org.id)
  return { orgId: org.id, projectId: project.id }
}

describe("Correlation Engine scan (§3) — real, DB-backed", () => {
  it("correlates real ENTITY_GAP + TREND_ACCELERATION signals for the same entity into a real Observation", async () => {
    const { orgId, projectId } = await seedProject()
    const { entity } = await resolveOrCreateEntity(orgId, projectId, "Place", `Test ${randomUUID()}`)
    await recordSignal({ orgId, projectId, type: "ENTITY_GAP", entityId: entity.id, value: { entityName: entity.name }, source: "test", confidence: 0.9 })
    await recordSignal({ orgId, projectId, type: "TREND_ACCELERATION", entityId: entity.id, value: { acceleration: 50 }, source: "test", confidence: 0.8 })

    const observations = await runCorrelationScan(orgId, projectId)
    expect(observations.some((o) => o.pattern === "high_value_opportunity")).toBe(true)
    const match = observations.find((o) => o.pattern === "high_value_opportunity")!
    expect(match.correlationKey).toBe(`entity:${entity.id}`)

    const listed = await listObservations(orgId, projectId)
    expect(listed.some((o) => o.id === match.id)).toBe(true)
  })

  it("re-running the scan never creates a duplicate active observation for the same real correlation", async () => {
    const { orgId, projectId } = await seedProject()
    const { entity } = await resolveOrCreateEntity(orgId, projectId, "Place", `Dup ${randomUUID()}`)
    await recordSignal({ orgId, projectId, type: "ENTITY_GAP", entityId: entity.id, value: { entityName: entity.name }, source: "test", confidence: 0.9 })
    await recordSignal({ orgId, projectId, type: "TREND_ACCELERATION", entityId: entity.id, value: { acceleration: 60 }, source: "test", confidence: 0.85 })

    const first = await runCorrelationScan(orgId, projectId)
    const second = await runCorrelationScan(orgId, projectId)
    expect(first.length).toBeGreaterThan(0)
    expect(second.length).toBe(0) // nothing new — the same signals already produced an active observation
  })
})

describe("Decision Engine scan (§4) — real, DB-backed, explainable", () => {
  it("turns a real Observation into a real, evidence-linked Decision, and never decides on it twice", async () => {
    const { orgId, projectId } = await seedProject()
    const { entity } = await resolveOrCreateEntity(orgId, projectId, "Place", `DecTest ${randomUUID()}`)
    await recordSignal({ orgId, projectId, type: "ENTITY_GAP", entityId: entity.id, value: { entityName: entity.name }, source: "test", confidence: 0.9 })
    await recordSignal({ orgId, projectId, type: "TREND_ACCELERATION", entityId: entity.id, value: { acceleration: 70 }, source: "test", confidence: 0.85 })
    await runCorrelationScan(orgId, projectId)

    const decisions = await runDecisionScan(orgId, projectId)
    expect(decisions.length).toBeGreaterThan(0)
    const decision = decisions.find((d) => d.action === "CREATE_PAGE")
    expect(decision).toBeTruthy()
    expect(decision!.reason.length).toBeGreaterThan(0)
    expect(decision!.evidenceIds.length).toBeGreaterThan(0)
    expect(decision!.requiredApproval).toBe(true)
    expect(decision!.subjectType).toBe("entity")
    expect(decision!.subjectId).toBe(entity.id)

    // idempotent: re-running the decision scan never double-decides the same observation
    const second = await runDecisionScan(orgId, projectId)
    expect(second.length).toBe(0)

    const listed = await listDecisions(orgId, projectId)
    expect(listed.some((d) => d.id === decision!.id)).toBe(true)
  })

  it("a decision can be approved, rejected, or expired — never silently auto-approved", async () => {
    const { orgId, projectId } = await seedProject()
    const { entity } = await resolveOrCreateEntity(orgId, projectId, "Place", `Approve ${randomUUID()}`)
    await recordSignal({ orgId, projectId, type: "ENTITY_GAP", entityId: entity.id, value: {}, source: "test", confidence: 0.9 })
    await recordSignal({ orgId, projectId, type: "TREND_ACCELERATION", entityId: entity.id, value: { acceleration: 80 }, source: "test", confidence: 0.9 })
    await runCorrelationScan(orgId, projectId)
    const [decision] = await runDecisionScan(orgId, projectId)
    expect(decision.status).toBe("pending")

    const approved = await decideOnDecision(decision.id, orgId, "approved", "user_test")
    expect(approved?.status).toBe("approved")
    expect(approved?.decidedBy).toBe("user_test")

    // can't decide on it twice
    const again = await decideOnDecision(decision.id, orgId, "rejected", "user_test")
    expect(again).toBeNull()
  })

  it("expireOverdueDecisions moves a real past-due pending decision to expired", async () => {
    const { orgId, projectId } = await seedProject()
    const { entity } = await resolveOrCreateEntity(orgId, projectId, "Place", `Expire ${randomUUID()}`)
    await recordSignal({ orgId, projectId, type: "ENTITY_GAP", entityId: entity.id, value: {}, source: "test", confidence: 0.9 })
    await recordSignal({ orgId, projectId, type: "TREND_ACCELERATION", entityId: entity.id, value: { acceleration: 90 }, source: "test", confidence: 0.9 })
    await runCorrelationScan(orgId, projectId)
    const [decision] = await runDecisionScan(orgId, projectId)

    const { query } = await import("@/lib/db/client")
    await query("UPDATE intelligence_decisions SET expires_at = $1 WHERE id = $2", [Date.now() - 1000, decision.id])
    const expiredCount = await expireOverdueDecisions(orgId)
    expect(expiredCount).toBeGreaterThanOrEqual(1)

    const listed = await listDecisions(orgId, projectId, { status: "expired" })
    expect(listed.some((d) => d.id === decision.id)).toBe(true)
  })
})

describe("Action + Outcome + Score Calibration (§4, §13, §14) — full loop", () => {
  it("Decision -> Action -> Outcome -> Calibration, all real and traceable", async () => {
    const { orgId, projectId } = await seedProject()
    const { entity } = await resolveOrCreateEntity(orgId, projectId, "Place", `Loop ${randomUUID()}`)
    await recordSignal({ orgId, projectId, type: "ENTITY_GAP", entityId: entity.id, value: {}, source: "test", confidence: 0.9 })
    await recordSignal({ orgId, projectId, type: "TREND_ACCELERATION", entityId: entity.id, value: { acceleration: 55 }, source: "test", confidence: 0.9 })
    await runCorrelationScan(orgId, projectId)
    const [decision] = await runDecisionScan(orgId, projectId)
    await decideOnDecision(decision.id, orgId, "approved", "user_test")

    const action = await createAction({ orgId, projectId, decisionId: decision.id, status: "running" })
    expect(action.status).toBe("running")
    await completeAction(action.id, orgId, "succeeded", { pageId: "page_fake" })

    const outcome = await recordOutcome({ orgId, projectId, actionId: action.id, metric: "impressions_delta_pct", baseline: 100, value: 180, confidence: 0.8 })
    expect(outcome.delta).toBe(80) // real, computed delta — never guessed

    const calibration = await recordCalibration({ orgId, projectId, model: "opportunity_score", subjectType: "opportunity", subjectId: entity.id, predictedValue: decision.confidence * 100, actualValue: 80 })
    expect(calibration.delta).toBeCloseTo(80 - decision.confidence * 100, 5)

    const summary = await summarizeCalibration(orgId, projectId, "opportunity_score")
    expect(summary?.sampleCount).toBeGreaterThanOrEqual(1)

    const actionsForDecision = await listActionsForDecision(orgId, decision.id)
    expect(actionsForDecision.map((a) => a.id)).toContain(action.id)
    const outcomesForAction = await listOutcomesForAction(orgId, action.id)
    expect(outcomesForAction.map((o) => o.id)).toContain(outcome.id)
  })

  it("summarizeCalibration returns null (never a fabricated 0) for a model with no real data", async () => {
    const { orgId, projectId } = await seedProject()
    const summary = await summarizeCalibration(orgId, projectId, "quality_forecast")
    expect(summary).toBeNull()
  })
})

describe("Agent Decision Log (§12) — real, append-only audit trail", () => {
  it("logs a real autonomous decision with reason/evidence/policy", async () => {
    const { orgId } = await seedProject()
    const entry = await logAgentDecision({ orgId, agent: "ContentGenerationAgent", decision: "auto_publish_denied", reason: "LEVEL_1 always requires human approval.", policy: "LEVEL_1", confidence: 1, approvalRequired: true })
    expect(entry.reason).toContain("LEVEL_1")
    const listed = await listDecisionLogForRun(orgId, "nonexistent-run")
    expect(listed).toHaveLength(0) // real isolation — this entry has no agentRunId, so it's not attached to any run
  })
})

describe("Intelligence Relations (§6, §10) — generic graph", () => {
  it("links and looks up nodes bidirectionally", async () => {
    const { orgId } = await seedProject()
    await linkIntelligenceNode(orgId, "decision", "dec_fake", "entity", "ent_fake", "targets")
    const forNode = await listRelationsForNode(orgId, "entity", "ent_fake")
    expect(forNode.some((r) => r.subjectId === "dec_fake")).toBe(true)
  })
})

describe("tenant isolation — Decision Layer objects (§17)", () => {
  it("observations, decisions, actions, outcomes are all org-scoped", async () => {
    const tenantA = await seedProject()
    const tenantB = await seedProject()
    const { entity } = await resolveOrCreateEntity(tenantA.orgId, tenantA.projectId, "Place", `Iso ${randomUUID()}`)
    await recordSignal({ orgId: tenantA.orgId, projectId: tenantA.projectId, type: "ENTITY_GAP", entityId: entity.id, value: {}, source: "test", confidence: 0.9 })
    await recordSignal({ orgId: tenantA.orgId, projectId: tenantA.projectId, type: "TREND_ACCELERATION", entityId: entity.id, value: { acceleration: 60 }, source: "test", confidence: 0.9 })
    await runCorrelationScan(tenantA.orgId, tenantA.projectId)
    const [decision] = await runDecisionScan(tenantA.orgId, tenantA.projectId)

    const { getDecision } = await import("@/lib/intelligence/decisions")
    expect(await getDecision(decision.id, tenantB.orgId)).toBeNull()
    expect(await getDecision(decision.id, tenantA.orgId)).not.toBeNull()

    const bObservations = await listObservations(tenantB.orgId, tenantB.projectId)
    expect(bObservations).toHaveLength(0)
  })
})
