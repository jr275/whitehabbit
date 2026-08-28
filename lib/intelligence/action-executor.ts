import "server-only"

/* ================================================================== *
 * ACTION EXECUTOR (Phase 7, §3, ADR-038/039) — closes risks.md's R-37:
 * an approved Decision now really, durably creates and dispatches a
 * real execution. Two real, separate phases, exactly like every other
 * durable pipeline in this codebase (ADR-023):
 *
 *   executeDecision()     — the HTTP-facing entry point. Real, fast,
 *                            synchronous work only: resolve the
 *                            ActionPlan, evaluate policy, create the
 *                            real intelligence_actions row. NEVER runs
 *                            the actual action — only queues (or, for
 *                            an unsupported/policy-denied plan,
 *                            records a real 'blocked' row) and returns.
 *
 *   processActionQueue()  — the real drain tick (POST /api/v1/
 *                            intelligence/actions/process, same cron
 *                            convention as processStepQueue()/
 *                            processIntelligenceEventQueue()). Claims
 *                            queued actions and performs the real
 *                            dispatch: starts a real WorkflowRun for a
 *                            workflow-backed action (never runs it
 *                            inline — enqueues its first step exactly
 *                            like POST /api/opportunities/:id/generate
 *                            already does), or executes a real
 *                            synchronous/no-op action to completion.
 *
 * A workflow-backed action's eventual succeeded/failed transition is
 * observed via a real hook in lib/workflow/engine.ts#finalizeWorkflow()
 * — never a poll, never a second state machine.
 * ================================================================== */

import { getDecision, type IntelligenceDecision } from "./decisions"
import { resolveActionPlan, type ActionPlan } from "./action-plan"
import { evaluatePolicy } from "./policy-engine"
import { createAction, completeAction, blockAction, markActionRunning, getAction, type IntelligenceAction } from "./actions"
import { logAgentDecision } from "./agent-decision-log"
import { runDeepResearch } from "./deep-research"
import { getEntity, listEvidenceForEntity, listRelationshipsForEntity, listCanonicalEntities } from "@/lib/knowledge/repo"
import { hasPageForEntity, getPage } from "@/lib/pages/repo"
import { computeInformationGain } from "@/lib/opportunity/information-gain"
import { computeFinalScore } from "@/lib/opportunity/scoring"
import { BUSINESS_VALUE_BY_TYPE } from "@/lib/opportunity/discovery"
import { createOpportunity, getOpportunity, getOpportunityForEntityAndType, updateOpportunityStatus } from "@/lib/opportunity/repo"
import type { Opportunity, OpportunityScoreComponents, OpportunityType } from "@/lib/opportunity/model"
import { buildPageBriefFromOpportunity } from "@/lib/pagebrief/build"
import { getPageBriefByOpportunity } from "@/lib/pagebrief/repo"
import { generateInternalLinks } from "@/lib/internal-links/generate"
import { assertCapability } from "@/lib/workflow/permissions"
import { finalizeWorkflow, runStep, workflowEngine } from "@/lib/workflow/engine"
import { nextContentGenerationStep } from "@/lib/content-pipeline/steps"
import { enqueueStepJob } from "@/lib/workflow/step-worker"
import { query, queryOne, withTransaction } from "@/lib/db/client"

/* Deliberately NOT lib/api-error.ts's NotFoundError/ConflictError here:
 * this module is dynamically imported from lib/workflow/engine.ts's
 * finalizeWorkflow() (every real workflow completion, regardless of
 * which entry point triggered it), and lib/api-error.ts transitively
 * imports next/server + lib/session.ts's real (unmocked-by-default)
 * next-auth stack — a real module-resolution hazard for any test or
 * script that reaches a workflow's terminal state without itself
 * mocking @/lib/auth. Real, local, HTTP-status-agnostic errors here;
 * the API route layer (which already owns HTTP-status translation
 * everywhere else in this codebase — see POST /api/opportunities/:id/
 * generate's own inline checks) maps them to the right response. */
export class DecisionNotFoundError extends Error {
  constructor() {
    super("Decision not found.")
    this.name = "DecisionNotFoundError"
  }
}
export class DecisionNotApprovedError extends Error {
  constructor(status: string) {
    super(`Decision is "${status}", not "approved" — the ActionExecutor never dispatches an action for a decision a human hasn't approved.`)
    this.name = "DecisionNotApprovedError"
  }
}
export class ActionNotFoundError extends Error {
  constructor() {
    super("Action not found.")
    this.name = "ActionNotFoundError"
  }
}
export class ActionNotRetryableError extends Error {
  constructor(status: string) {
    super(`Action is "${status}" — only a failed or cancelled action can be retried.`)
    this.name = "ActionNotRetryableError"
  }
}

/** §3 steps 1-6, 8: the real, fast, HTTP-safe entry point. Idempotent
 * per Decision (createAction()'s own DB-enforced guard, migrations/
 * 0011) — a retry, a duplicate approval race, or a second manual call
 * all return the SAME real action, never a duplicate execution. */
export async function executeDecision(decisionId: string, orgId: string): Promise<{ action: IntelligenceAction; plan: ActionPlan }> {
  const decision = await getDecision(decisionId, orgId)
  if (!decision) throw new DecisionNotFoundError()
  if (decision.status !== "approved") throw new DecisionNotApprovedError(decision.status)

  const plan = await resolveActionPlan(decision)
  const policy = await evaluatePolicy(plan, decision)

  await logAgentDecision({
    orgId,
    agent: plan.agentType ?? "ContentGenerationAgent",
    decision: policy.allowed ? "action_queued" : "action_blocked",
    reason: policy.reason,
    evidence: decision.evidenceIds,
    policy: "action_executor_policy_engine",
    confidence: decision.confidence,
    risk: plan.riskLevel,
    approvalRequired: false, // the Decision's own approval already happened — this log entry is about dispatch, not a second approval
  })

  if (!policy.allowed) {
    const action = await createAction({ orgId, projectId: decision.projectId, decisionId, status: "blocked", blockedReason: policy.reason })
    return { action, plan }
  }

  const action = await createAction({ orgId, projectId: decision.projectId, decisionId, status: "queued" })
  return { action, plan }
}

/** §28's real retry endpoint: a terminal (failed/cancelled) action
 * gets a fresh, real, linked attempt — never mutates the old row (its
 * history stays exactly as it happened). Refuses to "retry" an action
 * that's still active — the DB-enforced guard would refuse the insert
 * anyway, but this gives a real, explicit reason instead of a raw
 * constraint-violation error. */
export async function retryAction(actionId: string, orgId: string): Promise<IntelligenceAction> {
  const previous = await getAction(actionId, orgId)
  if (!previous) throw new ActionNotFoundError()
  if (previous.status !== "failed" && previous.status !== "cancelled") {
    throw new ActionNotRetryableError(previous.status)
  }
  const decision = await getDecision(previous.decisionId, orgId)
  if (!decision) throw new Error(`Decision ${previous.decisionId} for this action no longer exists.`)
  const plan = await resolveActionPlan(decision)
  const policy = await evaluatePolicy(plan, decision)
  if (!policy.allowed) {
    return createAction({ orgId, projectId: previous.projectId, decisionId: previous.decisionId, status: "blocked", blockedReason: policy.reason, retryOfActionId: previous.id })
  }
  return createAction({ orgId, projectId: previous.projectId, decisionId: previous.decisionId, status: "queued", retryOfActionId: previous.id })
}

export async function cancelAction(actionId: string, orgId: string): Promise<IntelligenceAction | null> {
  const action = await getAction(actionId, orgId)
  if (!action) return null
  if (action.status !== "queued" && action.status !== "running") return null // terminal already — cancelling is a no-op, never re-terminalized
  if (action.agentRunId) await workflowEngine.cancel(action.agentRunId, orgId).catch(() => {}) // best-effort — the run may already be terminal
  await completeAction(actionId, orgId, "cancelled")
  return getAction(actionId, orgId)
}

/* -------------------------------------------------------------------
 * The real drain tick.
 * ------------------------------------------------------------------- */

export interface ActionQueueTickResult {
  claimed: number
  dispatched: number
  completed: number
  failed: number
  reclaimedStuck: number
  errors: { actionId: string; error: string }[]
}

/** How long a claimed action may sit "running" with neither a real
 * linked agent_run_id (the workflow case) nor any real output (the
 * synchronous/no-op case) before it's presumed crashed mid-dispatch —
 * the same real crash-recovery discipline lib/workflow/queue.ts's
 * lease/reapExpiredLeases() already established, sized to this
 * codebase's DEFAULT_LEASE_MS. A genuinely in-flight workflow-backed
 * action (agent_run_id set) is never swept by this — it stays
 * 'running' for as long as the real workflow legitimately takes. */
const DISPATCH_LEASE_MS = 120_000

export async function processActionQueue(maxActions = 10): Promise<ActionQueueTickResult> {
  // Real crash recovery first, mirroring reapExpiredLeases(): a
  // 'running' row with no real agent_run_id and no real output after
  // the lease window crashed between claim and dispatch — safe to
  // requeue, never silently lost.
  const reclaimed = await query<{ id: string }>(
    "UPDATE intelligence_actions SET status = 'queued', started_at = NULL WHERE status = 'running' AND agent_run_id IS NULL AND output IS NULL AND started_at < $1 RETURNING id",
    [Date.now() - DISPATCH_LEASE_MS],
  )

  // The real claim: FOR UPDATE SKIP LOCKED + an immediate status flip
  // to 'running' inside the SAME transaction, so the row-lock actually
  // protects against a second, concurrent tick re-claiming it — a bare
  // SELECT ... FOR UPDATE outside a transaction releases its lock
  // before any subsequent UPDATE, which would NOT be a real guard.
  const claimed = await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string; org_id: string }>(
      "SELECT id, org_id FROM intelligence_actions WHERE status = 'queued' ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED",
      [maxActions],
    )
    if (rows.length === 0) return []
    const ids = rows.map((r) => r.id)
    await client.query("UPDATE intelligence_actions SET status = 'running', started_at = $1 WHERE id = ANY($2)", [Date.now(), ids])
    return rows
  })

  const result: ActionQueueTickResult = { claimed: claimed.length, dispatched: 0, completed: 0, failed: 0, reclaimedStuck: reclaimed.length, errors: [] }

  for (const row of claimed) {
    try {
      await dispatchOneAction(row.id, row.org_id)
      result.dispatched += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push({ actionId: row.id, error: message })
      await completeAction(row.id, row.org_id, "failed", { error: message })
      result.failed += 1
    }
  }
  return result
}

async function dispatchOneAction(actionId: string, orgId: string): Promise<void> {
  const action = await getAction(actionId, orgId)
  if (!action) return
  const decision = await getDecision(action.decisionId, orgId)
  if (!decision) {
    await completeAction(actionId, orgId, "failed", { error: "The decision this action was created for no longer exists." })
    return
  }
  const plan = await resolveActionPlan(decision)
  const policy = await evaluatePolicy(plan, decision)
  if (!policy.allowed) {
    // real data changed between /execute and this drain tick (e.g. the
    // decision expired) — never dispatch a plan that's no longer valid.
    await blockAction(actionId, orgId, policy.reason)
    return
  }

  switch (plan.executionPolicy) {
    case "workflow":
      await dispatchWorkflowAction(action, plan, decision)
      return
    case "synchronous":
      await dispatchSynchronousAction(action, plan, decision)
      return
    case "noop":
      await completeAction(actionId, orgId, "succeeded", { note: `${plan.actionType} requires no real execution.` })
      return
    case "blocked":
      await blockAction(actionId, orgId, plan.unsupportedReason ?? `No real execution path exists for ${plan.actionType}.`)
      return
  }
}

async function dispatchWorkflowAction(action: IntelligenceAction, plan: ActionPlan, decision: IntelligenceDecision): Promise<void> {
  const { orgId, projectId } = plan
  const opportunity = await resolveOrCreateOpportunityForPlan(plan, decision)

  // ensures a real PageBrief exists before the first content-generation
  // step runs — the exact same real precondition POST /api/opportunities/
  // :id/generate establishes; the value itself isn't needed here.
  const existingBrief = await getPageBriefByOpportunity(opportunity.id, orgId)
  if (!existingBrief) await buildPageBriefFromOpportunity(opportunity)
  assertCapability("ContentGenerationAgent", "write_page_brief")

  // idempotent — workflowEngine.start() reattaches to an already-active
  // real run for this opportunity rather than starting a second one
  // (same real guard POST /api/opportunities/:id/generate relies on).
  const run = await workflowEngine.start({ orgId, projectId, pipeline: "content_generation", subjectType: "opportunity", subjectId: opportunity.id })
  const nextStep = nextContentGenerationStep(run.checkpoint?.lastCompletedSequence ?? null)
  if (nextStep) await enqueueStepJob(run, nextStep)
  await updateOpportunityStatus(opportunity.id, orgId, "generating")

  await markActionRunning(action.id, orgId, run.id)
}

async function dispatchSynchronousAction(action: IntelligenceAction, plan: ActionPlan, decision: IntelligenceDecision): Promise<void> {
  const { orgId, projectId } = plan
  if (plan.actionType === "ADD_INTERNAL_LINKS") {
    if (!plan.targetPageId) throw new Error("ADD_INTERNAL_LINKS action plan has no target page.")
    const page = await getPage(plan.targetPageId, orgId)
    if (!page) throw new Error(`Page ${plan.targetPageId} no longer exists.`)
    const opportunity = await getOpportunity(page.opportunityId, orgId)
    assertCapability("PublisherAgent", "write_internal_links")
    const links = await generateInternalLinks(page, opportunity?.primaryEntityId ?? null)
    await completeAction(action.id, orgId, "succeeded", { pageId: page.id, linksCreated: links.length })
    return
  }
  if (plan.actionType === "INVESTIGATE_ENTITY") {
    if (!plan.targetEntityId) throw new Error("INVESTIGATE_ENTITY action plan has no target entity.")
    assertCapability("WebsiteDiscoveryAgent", "run_research")
    const research = await runDeepResearch(orgId, projectId, { id: decision.id, primaryEntityId: plan.targetEntityId, topic: "", targetIntent: null })
    await completeAction(action.id, orgId, "succeeded", { entityId: plan.targetEntityId, factCount: research.facts.length, gapCount: research.gaps.length, gaps: research.gaps, recommendations: research.recommendations })
    return
  }
  throw new Error(`No real synchronous execution implemented for ${plan.actionType} — this is a bug in EXECUTION_POLICY_BY_ACTION (lib/intelligence/action-plan.ts), not a real dispatch decision.`)
}

const OPPORTUNITY_TYPE_BY_ACTION: Partial<Record<ActionPlan["actionType"], OpportunityType>> = {
  CREATE_PAGE: "entity_coverage_gap",
  CREATE_HUB: "hub",
  CREATE_COMPARISON: "comparison",
  CREATE_FAQ: "question_gap",
}

const NULL_SCORES: OpportunityScoreComponents = {
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

/** Resolves the real Opportunity a workflow-backed action needs to
 * generate content — reusing an existing one wherever a real one
 * already exists (a linked page's opportunity, or a prior
 * decision-driven opportunity for the same entity+type — never a
 * duplicate), and only creating a genuinely new one, scored with the
 * exact same real formula (lib/opportunity/information-gain.ts,
 * lib/opportunity/scoring.ts, lib/opportunity/discovery.ts's own
 * BUSINESS_VALUE_BY_TYPE) discovery.ts's batch scan uses — never a
 * forked copy. */
async function resolveOrCreateOpportunityForPlan(plan: ActionPlan, decision: IntelligenceDecision): Promise<Opportunity> {
  const { orgId, projectId } = plan

  if (plan.targetOpportunityId) {
    const existing = await getOpportunity(plan.targetOpportunityId, orgId)
    if (!existing) throw new Error(`Action plan referenced opportunity ${plan.targetOpportunityId}, which no longer exists.`)
    if (existing.status !== "approved") await updateOpportunityStatus(existing.id, orgId, "approved")
    return (await getOpportunity(existing.id, orgId))!
  }

  if (!plan.targetEntityId) throw new Error(`${plan.actionType} action plan has no target entity or opportunity to build a page from.`)
  const opportunityType = OPPORTUNITY_TYPE_BY_ACTION[plan.actionType]
  if (!opportunityType) throw new Error(`${plan.actionType} has no real OpportunityType mapping — this is a bug in OPPORTUNITY_TYPE_BY_ACTION, not a real dispatch decision.`)

  const existingOpp = await getOpportunityForEntityAndType(orgId, projectId, plan.targetEntityId, opportunityType)
  if (existingOpp) {
    if (existingOpp.status !== "approved") await updateOpportunityStatus(existingOpp.id, orgId, "approved")
    return (await getOpportunity(existingOpp.id, orgId))!
  }

  const entity = await getEntity(plan.targetEntityId, orgId)
  if (!entity) throw new Error(`Entity ${plan.targetEntityId} no longer exists.`)

  const [evidence, relationships, entities, existingPageForEntity] = await Promise.all([
    listEvidenceForEntity(entity.id, orgId),
    listRelationshipsForEntity(entity.id, orgId),
    listCanonicalEntities(orgId, projectId, { limit: 500 }),
    hasPageForEntity(projectId, entity.id),
  ])
  const relatedEntityIds = new Set(relationships.map((r) => (r.sourceEntityId === entity.id ? r.targetEntityId : r.sourceEntityId)))
  const neighborTypes = new Set([...relatedEntityIds].map((id) => entities.find((e) => e.id === id)?.entityType).filter((t): t is string => !!t))
  const sourceDiversity = new Set(evidence.map((e) => e.sourceUrl).filter((u): u is string => !!u)).size
  const structuredCount = evidence.filter((e) => e.confidence != null && e.confidence >= 0.85).length
  const hasLocalEvidence = entity.entityType === "Place" || entity.entityType === "Market" || neighborTypes.has("Place") || neighborTypes.has("Market")
  const siblingEntityCount = entities.filter((e) => e.entityType === entity.entityType && e.id !== entity.id).length

  const infoGain = computeInformationGain({
    relatedEntityCount: relatedEntityIds.size,
    sourceDiversity,
    structuredDataEvidenceCount: structuredCount,
    hasLocalEvidence,
    siblingEntityCount,
    existingPageForEntity,
  })
  const entityCoverageScore = Math.min(100, evidence.length * 20 + relatedEntityIds.size * 10)
  const businessValueScore = BUSINESS_VALUE_BY_TYPE[entity.entityType] ?? 50
  const scores: OpportunityScoreComponents = { ...NULL_SCORES, entityCoverageScore, businessValueScore, informationGainScore: infoGain.score }
  const { finalScore, notes } = computeFinalScore(scores)

  // Real provenance run (ADR-038) — decision_execution never runs
  // through the step-job queue, exactly like trend_analysis
  // (lib/intelligence/trend-opportunity.ts, the precedent this
  // mirrors) — a fast, deterministic write, not a slow crawl/LLM call.
  const provenanceRun = await workflowEngine.start({ orgId, projectId, pipeline: "decision_execution", subjectType: "decision", subjectId: decision.id })
  let opportunity!: Opportunity
  await runStep(provenanceRun, 1, "decision_to_opportunity", { decisionId: decision.id }, async () => {
    assertCapability("TrendAnalysisAgent", "write_opportunity") // reuses the real, existing write_opportunity capability — never a new agent type invented for one bridging step
    opportunity = await createOpportunity({
      orgId,
      projectId,
      sourceAgentRunId: provenanceRun.id,
      opportunityType,
      primaryEntityId: entity.id,
      title: `${entity.name}: ${plan.actionType === "CREATE_HUB" ? "complete overview" : plan.actionType === "CREATE_COMPARISON" ? "comparison" : plan.actionType === "CREATE_FAQ" ? "frequently asked questions" : "real content gap"}`,
      topic: entity.name,
      targetIntent: null,
      outline: infoGain.reasons,
      scores,
      finalScore,
      scoreNotes: `Decision-driven opportunity (Phase 7, ADR-038) — created from Decision ${decision.id} ("${decision.action}", ${decision.reason}). ${notes}`,
      informationGainReasons: infoGain.reasons,
    })
    return { output: { opportunityId: opportunity.id } }
  })
  await finalizeWorkflow(provenanceRun.id, orgId, "succeeded")

  await updateOpportunityStatus(opportunity.id, orgId, "approved")
  return (await getOpportunity(opportunity.id, orgId))!
}

/* -------------------------------------------------------------------
 * Real completion hook, called from lib/workflow/engine.ts#finalize
 * Workflow() — never a poll. See that file for the call site.
 * ------------------------------------------------------------------- */

const INFORMATION_GAIN_BLOCK_PATTERN = /^Information Gain \d+/

export async function onWorkflowFinalized(runId: string, orgId: string, status: "succeeded" | "failed" | "cancelled", errorReason: string | undefined): Promise<void> {
  const row = await queryOne<{ id: string; status: string }>("SELECT id, status FROM intelligence_actions WHERE agent_run_id = $1 AND org_id = $2", [runId, orgId])
  if (!row || (row.status !== "queued" && row.status !== "running")) return // no linked action, or already terminal — never re-terminalize

  if (status === "succeeded") {
    // both the outer query and the inner subquery are explicitly
    // org-scoped — defense in depth: even though runId/orgId are
    // already real, verified values from finalizeWorkflow()'s own
    // caller, a subquery that forgot its own org_id filter would be a
    // real, silent tenant-isolation gap the moment this function is
    // ever called with a mismatched pair.
    const page = await queryOne<{ id: string }>(
      "SELECT id FROM pages WHERE org_id = $1 AND opportunity_id = (SELECT subject_id FROM agent_runs WHERE id = $2 AND org_id = $1)",
      [orgId, runId],
    )
    await completeAction(row.id, orgId, "succeeded", { pageId: page?.id ?? null })
    return
  }
  if (status === "cancelled") {
    await completeAction(row.id, orgId, "cancelled", { reason: errorReason ?? "The underlying workflow was cancelled." })
    return
  }
  // §9: a real Information Gain V2 rejection is a real, categorical
  // BLOCKED outcome, not a runtime failure — distinguished by the
  // exact real reason string evaluateInformationGainGate() produces
  // (lib/opportunity/information-gain-gate.ts), the only real signal
  // available here without a larger structured-error-code refactor.
  if (errorReason && INFORMATION_GAIN_BLOCK_PATTERN.test(errorReason)) {
    await blockAction(row.id, orgId, errorReason)
    return
  }
  await completeAction(row.id, orgId, "failed", { error: errorReason ?? "The underlying workflow failed for an unknown reason." })
}
