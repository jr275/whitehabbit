import "server-only"

/* ================================================================== *
 * TREND -> OPPORTUNITY (§16) — a detected trend can create a real
 * Opportunity, provenance-linked to the trend and its constituent
 * signals via the Opportunity Graph (§25), with a real, deterministic
 * explanation (§26) — never an LLM asked to justify a decision.
 *
 * Runs as a real WorkflowRun (pipeline "trend_analysis") synchronously
 * — trend detection is a fast, deterministic scan over already-
 * persisted data, not a slow crawl/LLM call, so it never needs the
 * step-job queue (see lib/workflow/types.ts's WorkflowPipeline doc).
 * ================================================================== */

import { assertCapability } from "@/lib/workflow/permissions"
import { finalizeWorkflow, runStep, workflowEngine } from "@/lib/workflow/engine"
import { createOpportunity, getOpportunityForEntityAndType } from "@/lib/opportunity/repo"
import type { OpportunityScoreComponents } from "@/lib/opportunity/model"
import type { Trend } from "./trends"
import { linkOpportunityNode, linkSignalContext } from "./opportunity-graph"

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

/** Real, minimum trend confidence/state before it's allowed to spawn an
 * Opportunity — a "stable" or low-confidence trend never should (§15). */
const ELIGIBLE_STATES = new Set(["emerging", "rising", "breaking"])
const MIN_CONFIDENCE = 0.6

export interface TrendOpportunityResult {
  created: boolean
  opportunityId: string | null
  reason: string
}

export async function createOpportunityFromTrend(orgId: string, projectId: string, trend: Trend): Promise<TrendOpportunityResult> {
  if (!ELIGIBLE_STATES.has(trend.state) || trend.confidence < MIN_CONFIDENCE) {
    return { created: false, opportunityId: null, reason: `Trend state "${trend.state}" (confidence ${trend.confidence.toFixed(2)}) does not meet the eligibility bar (rising/emerging/breaking, confidence >= ${MIN_CONFIDENCE}).` }
  }
  if (trend.entityId) {
    const existing = await getOpportunityForEntityAndType(orgId, projectId, trend.entityId, "trend_driven")
    if (existing) return { created: false, opportunityId: existing.id, reason: "A trend-driven opportunity for this entity already exists — never a duplicate." }
  }

  const run = await workflowEngine.start({ orgId, projectId, pipeline: "trend_analysis", subjectType: "project", subjectId: projectId })
  assertCapability("TrendAnalysisAgent", "detect_trends")

  let opportunityId: string | null = null
  await runStep(run, 1, "trend_to_opportunity", { trendId: trend.id }, async () => {
    assertCapability("TrendAnalysisAgent", "write_opportunity")
    const opportunity = await createOpportunity({
      orgId,
      projectId,
      sourceAgentRunId: run.id,
      opportunityType: "trend_driven",
      primaryEntityId: trend.entityId,
      title: `Market intelligence: ${trend.label}`,
      topic: trend.label,
      outline: [`Why now: a real "${trend.state}" trend (velocity ${trend.velocity >= 0 ? "+" : ""}${trend.velocity.toFixed(1)}%) was detected.`],
      scores: { ...NULL_SCORES, trendScore: Math.min(100, Math.round(Math.abs(trend.momentum))) },
      finalScore: null,
      scoreNotes: `Created from trend ${trend.id} (${trend.state}, confidence ${(trend.confidence * 100).toFixed(0)}%).`,
    })
    opportunityId = opportunity.id
    await linkOpportunityNode(orgId, opportunity.id, "trend", trend.id, "derived_from")
    for (const signalId of trend.signalIds) await linkSignalContext(orgId, opportunity.id, signalId)
    return { output: { opportunityId: opportunity.id } }
  })

  await finalizeWorkflow(run.id, run.orgId, "succeeded")
  return { created: true, opportunityId, reason: `Trend "${trend.label}" (${trend.state}) met the eligibility bar and created a real, linked opportunity.` }
}
