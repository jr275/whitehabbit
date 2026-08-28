import "server-only"

/* Real orchestration for the Decision Engine: turns each real, active
 * Observation with no Decision yet into a real, persisted
 * IntelligenceDecision — idempotent via a real intelligence_relations
 * edge (decision -> observation, 'derived_from'), checked before
 * creating a new one, so re-running the scan never double-decides. */

import { listObservations } from "./observations"
import { createDecision, type IntelligenceDecision } from "./decisions"
import { proposeDecision } from "./decision-engine"
import { linkIntelligenceNode, listRelationsForNode } from "./relations"
import { hasPageForEntity } from "@/lib/pages/repo"

async function alreadyDecided(orgId: string, observationId: string): Promise<boolean> {
  const relations = await listRelationsForNode(orgId, "observation", observationId)
  return relations.some((r) => r.subjectType === "decision" && r.relation === "derived_from")
}

/** Resolves the real subject (a page id, if one already exists) from
 * an Observation's own stored correlationKey (lib/intelligence/
 * correlation-engine.ts's correlationKeyFor()) — never guessed from
 * free text. An observation whose signals didn't correlate to a real
 * entity/page (correlationKey null, or a bare 'signal:<id>' — i.e.
 * nothing to resolve) returns null, honestly. */
async function resolveExistingPageId(projectId: string, correlationKey: string | null): Promise<string | null> {
  if (!correlationKey) return null
  if (correlationKey.startsWith("page:")) return correlationKey.slice("page:".length)
  if (correlationKey.startsWith("entity:")) {
    const entityId = correlationKey.slice("entity:".length)
    return (await hasPageForEntity(projectId, entityId)) ? entityId : null
  }
  return null
}

export async function runDecisionScan(orgId: string, projectId: string): Promise<IntelligenceDecision[]> {
  const observations = await listObservations(orgId, projectId, { status: "active", limit: 100 })
  const created: IntelligenceDecision[] = []

  for (const observation of observations) {
    if (await alreadyDecided(orgId, observation.id)) continue

    const existingPageId = await resolveExistingPageId(projectId, observation.correlationKey)

    const proposal = proposeDecision({
      observationPattern: observation.pattern,
      observationSummary: observation.summary,
      observationConfidence: observation.confidence,
      signalIds: observation.signalIds,
      existingPageId,
    })

    const decision = await createDecision({
      orgId,
      projectId,
      action: proposal.action,
      subjectType: existingPageId ? "page" : observation.correlationKey?.startsWith("entity:") ? "entity" : "observation",
      subjectId: existingPageId ?? (observation.correlationKey ? observation.correlationKey.split(":")[1] : observation.id),
      reason: proposal.reason,
      evidenceIds: proposal.evidenceIds,
      expectedImpact: proposal.expectedImpact,
      estimatedCost: proposal.estimatedCost,
      risk: proposal.risk,
      confidence: proposal.confidence,
      priority: proposal.priority,
      recommendedAgent: proposal.recommendedAgent,
      requiredApproval: proposal.requiredApproval,
      expiresInMs: 14 * 24 * 60 * 60_000,
    })
    await linkIntelligenceNode(orgId, "decision", decision.id, "observation", observation.id, "derived_from")
    created.push(decision)
  }
  return created
}
