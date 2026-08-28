import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { resolveOrCreateEntity, addEvidence, createRelationship } from "@/lib/knowledge/repo"
import { recordSignal } from "@/lib/intelligence/signals"
import { runCorrelationScan } from "@/lib/intelligence/correlation-scan"
import { runDecisionScan } from "@/lib/intelligence/decision-scan"
import { decideOnDecision, createDecision, getDecision } from "@/lib/intelligence/decisions"
import { getAction, listActionsForDecision } from "@/lib/intelligence/actions"
import { executeDecision, retryAction, cancelAction, processActionQueue } from "@/lib/intelligence/action-executor"
import { resolveActionPlan } from "@/lib/intelligence/action-plan"
import { evaluatePolicy } from "@/lib/intelligence/policy-engine"
import { processStepQueue } from "@/lib/workflow/step-worker"
import { getWorkflowRun } from "@/lib/workflow/repo"
import { isTerminal } from "@/lib/workflow/state-machine"
import { getPage } from "@/lib/pages/repo"
import { upsertProjectBudget } from "@/lib/workflow/budget-policy"
import { query } from "@/lib/db/client"

async function seedProject() {
  const email = `dab-${randomUUID()}@example.test`
  const { org } = await createUserWithOrganization(email, "hashed-not-real", `Org ${email}`)
  const project = await getOrCreateDefaultProject(org.id)
  return { orgId: org.id, projectId: project.id }
}

async function drainActionQueue(maxTicks = 20): Promise<void> {
  for (let i = 0; i < maxTicks; i++) {
    const result = await processActionQueue(50)
    if (result.claimed === 0) return
  }
}

async function drainWorkflow(orgId: string, runId: string, maxTicks = 50): Promise<void> {
  for (let i = 0; i < maxTicks; i++) {
    const run = await getWorkflowRun(runId, orgId)
    if (!run) throw new Error(`run ${runId} not found`)
    if (isTerminal(run.status) || run.status === "waiting_approval") return
    await processStepQueue(10)
  }
  throw new Error(`workflow ${runId} did not reach a terminal state`)
}

/** A real, well-evidenced entity — enough local specificity, related
 * entities, and high-confidence evidence to clear the real Information
 * Gain V2 gate (DEFAULT_INFORMATION_GAIN_GATE_THRESHOLD = 35), the
 * same real signals the Phase 6 E2E fixture needed after its own
 * information-gain-v2-input.ts fix. */
async function seedWellEvidencedEntity(orgId: string, projectId: string) {
  const { entity } = await resolveOrCreateEntity(orgId, projectId, "Place", `Bridge ${randomUUID()}`)
  await addEvidence({ orgId, projectId, entityId: entity.id, fact: "Real, high-confidence fact one.", sourceUrl: "https://example.test/a", sourceType: "crawl", confidence: 0.9 })
  await addEvidence({ orgId, projectId, entityId: entity.id, fact: "Real, high-confidence fact two.", sourceUrl: "https://example.test/b", sourceType: "crawl", confidence: 0.9 })
  const { entity: neighbor } = await resolveOrCreateEntity(orgId, projectId, "Organization", `Neighbor ${randomUUID()}`)
  await createRelationship({ orgId, projectId, sourceEntityId: entity.id, targetEntityId: neighbor.id, relationshipType: "LOCATED_IN", source: "test" })
  return entity
}

describe("Decision -> Action bridge (Phase 7, §2-4, ADR-038) — full real loop", () => {
  it("resolveActionPlan maps every real produced action to a real, honest execution policy", async () => {
    const { orgId, projectId } = await seedProject()
    const entity = await seedWellEvidencedEntity(orgId, projectId)
    const decision = await createDecision({
      orgId, projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: { agentSteps: 7 }, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    const plan = await resolveActionPlan(decision)
    expect(plan.executionPolicy).toBe("workflow")
    expect(plan.status).toBe("supported")
    expect(plan.targetEntityId).toBe(entity.id)
    expect(plan.requiredCapabilities).toContain("write_page_brief")
  })

  it("a real, well-evidenced CREATE_PAGE decision runs end to end: approve -> execute -> drain -> real Opportunity+Page, Action succeeded", async () => {
    const { orgId, projectId } = await seedProject()
    const entity = await seedWellEvidencedEntity(orgId, projectId)
    await recordSignal({ orgId, projectId, type: "ENTITY_GAP", entityId: entity.id, value: {}, source: "test", confidence: 0.9 })
    await recordSignal({ orgId, projectId, type: "TREND_ACCELERATION", entityId: entity.id, value: { acceleration: 60 }, source: "test", confidence: 0.9 })
    await runCorrelationScan(orgId, projectId)
    const [decision] = await runDecisionScan(orgId, projectId)
    expect(decision.action).toBe("CREATE_PAGE")

    await decideOnDecision(decision.id, orgId, "approved", "user_test")
    const { action } = await executeDecision(decision.id, orgId)
    expect(action.status).toBe("queued")

    await drainActionQueue()
    const running = await getAction(action.id, orgId)
    expect(running?.status).toBe("running")
    expect(running?.agentRunId).toBeTruthy()

    await drainWorkflow(orgId, running!.agentRunId!)
    const finished = await getAction(action.id, orgId)
    // real, honest either-or: succeeded outright, or waiting on the
    // real LEVEL_1 publish-approval pause — never anything else.
    const run = await getWorkflowRun(running!.agentRunId!, orgId)
    if (run?.status === "waiting_approval") {
      expect(finished?.status).toBe("running") // not yet terminal — correct, the workflow itself is only paused
    } else {
      expect(finished?.status).toBe("succeeded")
      expect(finished?.output).toHaveProperty("pageId")
      const page = await getPage((finished!.output as { pageId: string }).pageId, orgId)
      expect(page).not.toBeNull()
    }
  }, 30_000)

  it("a decision for an entity with NO real evidence is honestly BLOCKED by the real Information Gain V2 gate, never generates a page", async () => {
    const { orgId, projectId } = await seedProject()
    const { entity } = await resolveOrCreateEntity(orgId, projectId, "Place", `Thin ${randomUUID()}`)
    const decision = await createDecision({
      orgId, projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: { agentSteps: 7 }, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    await decideOnDecision(decision.id, orgId, "approved", "user_test")
    const { action } = await executeDecision(decision.id, orgId)
    await drainActionQueue()
    const running = await getAction(action.id, orgId)
    await drainWorkflow(orgId, running!.agentRunId!)
    const finished = await getAction(action.id, orgId)
    expect(finished?.status).toBe("blocked")
    expect(finished?.blockedReason).toContain("Information Gain")
  }, 30_000)

  it("an unsupported action type (MERGE_PAGES) is BLOCKED immediately at /execute — never silently succeeds", async () => {
    const { orgId, projectId } = await seedProject()
    const decision = await createDecision({
      orgId, projectId, action: "MERGE_PAGES", subjectType: "page", subjectId: `page_${randomUUID()}`,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "high", confidence: 0.9, requiredApproval: true,
    })
    await decideOnDecision(decision.id, orgId, "approved", "user_test")
    const { action, plan } = await executeDecision(decision.id, orgId)
    expect(plan.status).toBe("unsupported")
    expect(action.status).toBe("blocked")
    expect(action.blockedReason).toBeTruthy()
  })

  it("idempotency: concurrent /execute calls for the same decision never create two active actions", async () => {
    const { orgId, projectId } = await seedProject()
    const entity = await seedWellEvidencedEntity(orgId, projectId)
    const decision = await createDecision({
      orgId, projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: { agentSteps: 7 }, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    await decideOnDecision(decision.id, orgId, "approved", "user_test")
    const results = await Promise.all([executeDecision(decision.id, orgId), executeDecision(decision.id, orgId), executeDecision(decision.id, orgId)])
    const ids = new Set(results.map((r) => r.action.id))
    expect(ids.size).toBe(1) // all three racing calls resolved to the SAME real action

    const allActions = await listActionsForDecision(orgId, decision.id)
    const active = allActions.filter((a) => a.status === "queued" || a.status === "running" || a.status === "succeeded" || a.status === "blocked")
    expect(active).toHaveLength(1)
  })

  it("executing a non-approved decision is refused (409), never creates an action", async () => {
    const { orgId, projectId } = await seedProject()
    const entity = await seedWellEvidencedEntity(orgId, projectId)
    const decision = await createDecision({
      orgId, projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    await expect(executeDecision(decision.id, orgId)).rejects.toThrow(/not "approved"/)
    const actions = await listActionsForDecision(orgId, decision.id)
    expect(actions).toHaveLength(0)
  })

  it("a stale (expired) approved decision is BLOCKED by the PolicyEngine, not silently executed", async () => {
    const { orgId, projectId } = await seedProject()
    const entity = await seedWellEvidencedEntity(orgId, projectId)
    const decision = await createDecision({
      orgId, projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "medium", confidence: 0.9, requiredApproval: true, expiresInMs: 1,
    })
    await new Promise((r) => setTimeout(r, 5))
    await decideOnDecision(decision.id, orgId, "approved", "user_test")
    const { action } = await executeDecision(decision.id, orgId)
    expect(action.status).toBe("blocked")
    expect(action.blockedReason).toContain("STALE_DECISION")
  })

  it("a decision whose estimated cost exceeds the real project budget is BLOCKED as BUDGET_EXCEEDED", async () => {
    const { orgId, projectId } = await seedProject()
    const entity = await seedWellEvidencedEntity(orgId, projectId)
    await upsertProjectBudget({ orgId, projectId, maxSteps: 2 }) // CREATE_PAGE's real estimated cost is 7 steps
    const decision = await createDecision({
      orgId, projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: { agentSteps: 7 }, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    await decideOnDecision(decision.id, orgId, "approved", "user_test")
    const { action } = await executeDecision(decision.id, orgId)
    expect(action.status).toBe("blocked")
    expect(action.blockedReason).toContain("BUDGET_EXCEEDED")
  })

  it("MISSING_CAPABILITY: the PolicyEngine fails closed for an agent that lacks a required capability (pure)", async () => {
    const { orgId, projectId } = await seedProject()
    const decision = await createDecision({
      orgId, projectId, action: "ADD_INTERNAL_LINKS", subjectType: "page", subjectId: `page_${randomUUID()}`,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "low", confidence: 0.9, requiredApproval: false,
    })
    await decideOnDecision(decision.id, orgId, "approved", "user_test")
    const approved = (await getDecision(decision.id, orgId))!
    const plan = await resolveActionPlan(approved)
    // manufacture a plan naming a required capability no real agent
    // holds — the real, deterministic MISSING_CAPABILITY branch.
    const brokenPlan = { ...plan, requiredCapabilities: [...plan.requiredCapabilities, "delete_tenant_data" as const], agentType: null }
    const policy = await evaluatePolicy(brokenPlan, approved)
    expect(policy.allowed).toBe(false)
    expect(policy.reason).toContain("MISSING_CAPABILITY")
  })

  it("retry: a failed action gets a real, new, linked attempt; re-retrying while that attempt is still active idempotently returns the same one", async () => {
    const { orgId, projectId } = await seedProject()
    const entity = await seedWellEvidencedEntity(orgId, projectId)
    const decision = await createDecision({
      orgId, projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    await decideOnDecision(decision.id, orgId, "approved", "user_test")
    const { action } = await executeDecision(decision.id, orgId)
    const { completeAction } = await import("@/lib/intelligence/actions")
    await completeAction(action.id, orgId, "failed", { error: "simulated" })

    const retried = await retryAction(action.id, orgId)
    expect(retried.id).not.toBe(action.id)
    expect(retried.retryOfActionId).toBe(action.id)
    expect(retried.status).toBe("queued")

    // the ORIGINAL action is still terminal ('failed'), so calling
    // retryAction on it again is a real, legitimate request — but
    // createAction()'s own DB-enforced idempotency guard (the same one
    // that protects /execute) means it can never create a SECOND
    // active row for the same decision: it returns the retry that's
    // already active instead.
    const retriedAgain = await retryAction(action.id, orgId)
    expect(retriedAgain.id).toBe(retried.id)

    // retrying the NEW (still-active, 'queued') attempt directly IS
    // refused — that one really isn't terminal yet.
    await expect(retryAction(retried.id, orgId)).rejects.toThrow(/only a failed or cancelled/i)
  })

  it("cancel: a queued action is cancelled; cancelling an already-terminal action is a real no-op", async () => {
    const { orgId, projectId } = await seedProject()
    const entity = await seedWellEvidencedEntity(orgId, projectId)
    const decision = await createDecision({
      orgId, projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    await decideOnDecision(decision.id, orgId, "approved", "user_test")
    const { action } = await executeDecision(decision.id, orgId)
    const cancelled = await cancelAction(action.id, orgId)
    expect(cancelled?.status).toBe("cancelled")
    const again = await cancelAction(action.id, orgId)
    expect(again).toBeNull() // already terminal — real no-op, never re-terminalized
  })

  it("worker-crash recovery: a stuck 'running' action with no real agent_run_id is reclaimed to 'queued' after the lease window", async () => {
    const { orgId, projectId } = await seedProject()
    const entity = await seedWellEvidencedEntity(orgId, projectId)
    const decision = await createDecision({
      orgId, projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    await decideOnDecision(decision.id, orgId, "approved", "user_test")
    const { action } = await executeDecision(decision.id, orgId)
    // simulate a crash mid-dispatch: claimed (running) but never got a
    // real agent_run_id or output, well past the lease window.
    await query("UPDATE intelligence_actions SET status = 'running', started_at = $1 WHERE id = $2", [Date.now() - 200_000, action.id])
    const result = await processActionQueue(50)
    expect(result.reclaimedStuck).toBeGreaterThanOrEqual(1)
  })

  it("ADD_INTERNAL_LINKS executes synchronously (in the drain tick) against a real page", async () => {
    const { orgId, projectId } = await seedProject()
    // build a real page via the same real fixture path the E2E test
    // uses would be excessive here — use the direct repo path instead,
    // matching this test file's own established pattern.
    const entity = await seedWellEvidencedEntity(orgId, projectId)
    const { createOpportunity } = await import("@/lib/opportunity/repo")
    const { createPage } = await import("@/lib/pages/repo")
    const { buildPageBriefFromOpportunity } = await import("@/lib/pagebrief/build")
    const { workflowEngine: engine } = await import("@/lib/workflow/engine")
    const provenanceRun = await engine.start({ orgId, projectId, pipeline: "decision_execution", subjectType: "project", subjectId: projectId })
    const opp = await createOpportunity({
      orgId, projectId, sourceAgentRunId: provenanceRun.id, primaryEntityId: entity.id, opportunityType: "entity_coverage_gap",
      title: "test", topic: "test", outline: [], scores: { sourceGroundingScore: null, outlineCompletenessScore: null, confidenceScore: null, entityCoverageScore: null, demandScore: null, trendScore: null, businessValueScore: null, competitionScore: null, authorityGapScore: null, informationGainScore: null, citationPotentialScore: null, cannibalizationRiskScore: null },
      finalScore: null, scoreNotes: null,
    })
    const brief = await buildPageBriefFromOpportunity(opp)
    const page = await createPage({ orgId, projectId, opportunityId: opp.id, pageBriefId: brief.id, slug: `test-${randomUUID()}`, title: "Test Page", metaDescription: null })

    const decision = await createDecision({
      orgId, projectId, action: "ADD_INTERNAL_LINKS", subjectType: "page", subjectId: page.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "low", confidence: 0.9, requiredApproval: false,
    })
    await decideOnDecision(decision.id, orgId, "approved", "user_test")
    const { action } = await executeDecision(decision.id, orgId)
    await drainActionQueue()
    const finished = await getAction(action.id, orgId)
    expect(finished?.status).toBe("succeeded")
    expect(finished?.output).toHaveProperty("linksCreated")
  })

  it("INVESTIGATE_ENTITY runs real Deep Research synchronously and records real findings", async () => {
    const { orgId, projectId } = await seedProject()
    const { entity } = await resolveOrCreateEntity(orgId, projectId, "Place", `Investigate ${randomUUID()}`)
    const decision = await createDecision({
      orgId, projectId, action: "INVESTIGATE_ENTITY", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "low", confidence: 0.9, requiredApproval: false,
    })
    await decideOnDecision(decision.id, orgId, "approved", "user_test")
    const { action } = await executeDecision(decision.id, orgId)
    await drainActionQueue()
    const finished = await getAction(action.id, orgId)
    expect(finished?.status).toBe("succeeded")
    expect(finished?.output).toHaveProperty("gaps")
  })
})

describe("Decision -> Action bridge — tenant isolation (§17, §25)", () => {
  it("tenant B cannot execute, retry, or cancel tenant A's decision/action", async () => {
    const tenantA = await seedProject()
    const tenantB = await seedProject()
    const entity = await seedWellEvidencedEntity(tenantA.orgId, tenantA.projectId)
    const decision = await createDecision({
      orgId: tenantA.orgId, projectId: tenantA.projectId, action: "CREATE_PAGE", subjectType: "entity", subjectId: entity.id,
      reason: "test", evidenceIds: [], expectedImpact: "test", estimatedCost: {}, risk: "medium", confidence: 0.9, requiredApproval: true,
    })
    await decideOnDecision(decision.id, tenantA.orgId, "approved", "user_test")

    await expect(executeDecision(decision.id, tenantB.orgId)).rejects.toThrow()
    const { action } = await executeDecision(decision.id, tenantA.orgId)

    await expect(retryAction(action.id, tenantB.orgId)).rejects.toThrow()
    const cancelledCrossTenant = await cancelAction(action.id, tenantB.orgId)
    expect(cancelledCrossTenant).toBeNull()

    const stillActive = await getAction(action.id, tenantA.orgId)
    expect(stillActive?.status).not.toBe("cancelled") // tenant B's cancel attempt did nothing real
  })
})
