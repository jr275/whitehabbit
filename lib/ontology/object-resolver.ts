import "server-only"

/* ================================================================== *
 * OBJECT RESOLVER (Phase UI-1/4/5, docs/ontology-ui-architecture-v1.md
 * §2) — the one real, small, properly-scoped API extension this
 * implementation phase adds. Normalizes five real Object Types
 * (Entity/Opportunity/Page/Decision/AgentRun) into one shared
 * `ObjectDetail` shape by calling each type's own already-real repo
 * functions — never a second, parallel data-access layer, never a
 * fabricated field. A relationship/evidence/action list that is
 * honestly empty for this object renders as [], not a placeholder row.
 * ================================================================== */

import { getEntity, listEvidenceForEntity, listRelationshipsForEntity } from "@/lib/knowledge/repo"
import { getOpportunity, listOpportunities } from "@/lib/opportunity/repo"
import { listOpportunityGraph } from "@/lib/intelligence/opportunity-graph"
import { getPage, getPageByOpportunity } from "@/lib/pages/repo"
import { getDecision } from "@/lib/intelligence/decisions"
import { getObservation } from "@/lib/intelligence/observations"
import { listActionsForDecision } from "@/lib/intelligence/actions"
import { resolveActionPlan } from "@/lib/intelligence/action-plan"
import { evaluatePolicy } from "@/lib/intelligence/policy-engine"
import { listEvidenceForSubject } from "@/lib/intelligence/evidence"
import { getWorkflowRun } from "@/lib/workflow/repo"

export type ObjectType = "entity" | "opportunity" | "page" | "decision" | "agent_run" | "observation"

export interface ObjectProperty {
  label: string
  value: string | number | null
}

export interface ObjectRelationship {
  relation: string
  targetType: string
  targetId: string
  targetLabel: string
  confidence?: number | null
}

export interface ObjectEvidenceItem {
  id: string
  fact: string | null
  source: string
  sourceUrl: string | null
  confidence: number | null
  verificationStatus: string | null
}

export interface ObjectActionItem {
  label: string
  kind: "link" | "execute" | "unavailable"
  href?: string
  reason?: string
}

export interface ObjectHistoryEntry {
  at: number
  label: string
}

export interface ObjectDetail {
  type: ObjectType
  id: string
  title: string
  subtitle: string | null
  status: string | null
  score: number | null
  confidence: number | null
  properties: ObjectProperty[]
  relationships: ObjectRelationship[]
  evidence: ObjectEvidenceItem[]
  actions: ObjectActionItem[]
  history: ObjectHistoryEntry[]
}

async function resolveEntity(orgId: string, projectId: string, id: string): Promise<ObjectDetail | null> {
  const entity = await getEntity(id, orgId)
  if (!entity || entity.projectId !== projectId) return null

  const [relationships, evidence, opportunities] = await Promise.all([
    listRelationshipsForEntity(id, orgId),
    listEvidenceForEntity(id, orgId),
    listOpportunities(orgId, projectId, { limit: 500 }),
  ])
  const relatedOpportunities = opportunities.filter((o) => o.primaryEntityId === id)

  // Resolve each relationship's real other-side name — never ship a
  // raw entity id as a label when the real name is one query away.
  // Bounded by this entity's own real relationship count (already
  // small; listRelationshipsForEntity is itself unbounded only in the
  // sense that a real entity with hundreds of edges would need real
  // pagination here, a named follow-up, not a fabricated shortcut).
  const relatedIds = [...new Set(relationships.map((r) => (r.sourceEntityId === id ? r.targetEntityId : r.sourceEntityId)))]
  const relatedEntities = await Promise.all(relatedIds.map((rid) => getEntity(rid, orgId)))
  const nameById = new Map(relatedEntities.filter((e): e is NonNullable<typeof e> => e != null).map((e) => [e.id, e.name]))

  return {
    type: "entity",
    id: entity.id,
    title: entity.name,
    subtitle: entity.entityType,
    status: entity.canonicalEntityId ? "merged" : null,
    score: null,
    confidence: null,
    properties: [
      { label: "Type", value: entity.entityType },
      { label: "Attributes", value: Object.keys(entity.attributes).length > 0 ? Object.keys(entity.attributes).join(", ") : null },
      { label: "Discovered", value: new Date(entity.createdAt).toLocaleDateString() },
    ],
    relationships: relationships.map((r) => {
      const targetId = r.sourceEntityId === id ? r.targetEntityId : r.sourceEntityId
      return { relation: r.relationshipType, targetType: "entity", targetId, targetLabel: nameById.get(targetId) ?? targetId, confidence: r.confidence }
    }),
    evidence: evidence.map((e) => ({ id: e.id, fact: e.fact, source: e.sourceType, sourceUrl: e.sourceUrl, confidence: e.confidence, verificationStatus: e.verificationStatus })),
    actions:
      relatedOpportunities.length > 0
        ? [{ label: `View ${relatedOpportunities.length} real opportunit${relatedOpportunities.length === 1 ? "y" : "ies"}`, kind: "link", href: "/opportunities" }]
        : [{ label: "No real opportunities target this entity yet", kind: "unavailable" }],
    history: [{ at: entity.createdAt, label: "Discovered" }, ...(entity.updatedAt !== entity.createdAt ? [{ at: entity.updatedAt, label: "Updated" }] : [])],
  }
}

async function resolveOpportunity(orgId: string, projectId: string, id: string): Promise<ObjectDetail | null> {
  const opportunity = await getOpportunity(id, orgId)
  if (!opportunity || opportunity.projectId !== projectId) return null

  const [graphEdges, entity, realPage] = await Promise.all([
    listOpportunityGraph(orgId, id),
    opportunity.primaryEntityId ? getEntity(opportunity.primaryEntityId, orgId) : Promise.resolve(null),
    getPageByOpportunity(id, orgId),
  ])

  return {
    type: "opportunity",
    id: opportunity.id,
    title: opportunity.title,
    subtitle: opportunity.topic,
    status: opportunity.status,
    score: opportunity.finalScore,
    confidence: opportunity.confidenceScore,
    properties: [
      { label: "Target intent", value: opportunity.targetIntent },
      { label: "Business value", value: opportunity.businessValueScore },
      { label: "Source grounding", value: opportunity.sourceGroundingScore },
      { label: "Outline completeness", value: opportunity.outlineCompletenessScore },
      { label: "Entity coverage", value: opportunity.entityCoverageScore },
    ],
    relationships: [
      ...(entity ? [{ relation: "targets", targetType: "entity", targetId: entity.id, targetLabel: entity.name }] : []),
      ...graphEdges.map((e) => ({ relation: e.relation, targetType: e.nodeType, targetId: e.nodeId, targetLabel: e.nodeId })),
    ],
    evidence: (await listEvidenceForSubject(orgId, "opportunity", id)).map((e) => ({ id: e.id, fact: null, source: e.source, sourceUrl: e.sourceUrl, confidence: e.confidence, verificationStatus: e.verificationStatus })),
    actions: realPage
      ? [{ label: "View real page", kind: "link", href: `/pages/${realPage.id}` }]
      : opportunity.status === "approved" || opportunity.status === "discovered" || opportunity.status === "qualified"
        ? [{ label: "Generate real page", kind: "link", href: "/opportunities" }]
        : [{ label: `No page yet — status: ${opportunity.status}`, kind: "unavailable" }],
    history: [{ at: opportunity.createdAt, label: "Discovered" }, ...(opportunity.reviewedAt ? [{ at: opportunity.reviewedAt, label: `Reviewed (${opportunity.status})` }] : [])],
  }
}

async function resolvePage(orgId: string, projectId: string, id: string): Promise<ObjectDetail | null> {
  const page = await getPage(id, orgId)
  if (!page || page.projectId !== projectId) return null
  const opportunity = await getOpportunity(page.opportunityId, orgId)

  return {
    type: "page",
    id: page.id,
    title: page.title ?? page.slug,
    subtitle: `/${page.slug}`,
    status: page.status,
    score: page.qualityScore,
    confidence: null,
    properties: [
      { label: "SEO score", value: page.seoScore },
      { label: "AEO score", value: page.aeoScore },
      { label: "GEO score", value: page.geoScore },
      { label: "Information gain", value: page.informationGainScore },
      { label: "Meta description", value: page.metaDescription },
    ],
    relationships: opportunity ? [{ relation: "materializes", targetType: "opportunity", targetId: opportunity.id, targetLabel: opportunity.title }] : [],
    evidence: (await listEvidenceForSubject(orgId, "page", id)).map((e) => ({ id: e.id, fact: null, source: e.source, sourceUrl: e.sourceUrl, confidence: e.confidence, verificationStatus: e.verificationStatus })),
    actions:
      page.status === "published"
        ? [{ label: "View live", kind: "link", href: `/pages/${page.id}` }]
        : page.status === "quality_rejected"
          ? [{ label: `Held for thin content${page.rejectionReasons?.length ? `: ${page.rejectionReasons[0]}` : ""}`, kind: "unavailable" }]
          : [{ label: "Open page detail", kind: "link", href: `/pages/${page.id}` }],
    history: [{ at: page.createdAt, label: "Created" }, ...(page.updatedAt !== page.createdAt ? [{ at: page.updatedAt, label: `Updated (${page.status})` }] : [])],
  }
}

async function resolveDecision(orgId: string, projectId: string, id: string): Promise<ObjectDetail | null> {
  const decision = await getDecision(id, orgId)
  if (!decision || decision.projectId !== projectId) return null
  const [plan, actions] = await Promise.all([resolveActionPlan(decision), listActionsForDecision(orgId, id)])
  const policy = await evaluatePolicy(plan, decision)

  return {
    type: "decision",
    id: decision.id,
    title: decision.action.replaceAll("_", " "),
    subtitle: decision.reason,
    status: decision.status,
    score: null,
    confidence: decision.confidence,
    properties: [
      { label: "Risk", value: decision.risk },
      { label: "Priority", value: decision.priority },
      { label: "Expected impact", value: decision.expectedImpact },
      { label: "Subject", value: `${decision.subjectType}${decision.subjectId ? ` · ${decision.subjectId}` : ""}` },
    ],
    relationships: decision.subjectId ? [{ relation: "targets", targetType: decision.subjectType, targetId: decision.subjectId, targetLabel: decision.subjectId }] : [],
    evidence: [],
    actions: plan.status === "unsupported" ? [{ label: `Not yet automatable: ${plan.unsupportedReason}`, kind: "unavailable" }] : !policy.allowed ? [{ label: policy.reason, kind: "unavailable" }] : [{ label: "Approve & execute", kind: "link", href: "/intelligence/decisions" }],
    history: [{ at: decision.createdAt, label: "Decided" }, ...actions.map((a) => ({ at: a.startedAt ?? a.createdAt, label: `Action ${a.status}` }))],
  }
}

async function resolveAgentRun(orgId: string, projectId: string, id: string): Promise<ObjectDetail | null> {
  const run = await getWorkflowRun(id, orgId)
  if (!run || run.projectId !== projectId) return null

  return {
    type: "agent_run",
    id: run.id,
    title: run.pipeline.replaceAll("_", " "),
    subtitle: `${run.subjectType} · ${run.subjectId}`,
    status: run.status,
    score: null,
    confidence: null,
    properties: [
      { label: "Attempt", value: `${run.attemptCount} of ${run.maxAttempts}` },
      { label: "Priority", value: run.priority },
      { label: "Cost", value: run.costUsd != null ? `$${run.costUsd.toFixed(4)}` : null },
      { label: "Tokens", value: run.inputTokens != null && run.outputTokens != null ? run.inputTokens + run.outputTokens : null },
      { label: "Checkpoint", value: run.checkpoint ? `step ${run.checkpoint.lastCompletedSequence}` : null },
    ],
    relationships: [{ relation: "operates_on", targetType: run.subjectType, targetId: run.subjectId, targetLabel: run.subjectId }],
    evidence: [],
    actions: [{ label: "Open run inspector", kind: "link", href: `/agent-runs/${run.id}` }],
    history: [{ at: run.createdAt, label: "Queued" }],
  }
}

async function resolveObservation(orgId: string, projectId: string, id: string): Promise<ObjectDetail | null> {
  const observation = await getObservation(id, orgId)
  if (!observation || observation.projectId !== projectId) return null

  return {
    type: "observation",
    id: observation.id,
    title: observation.pattern.replaceAll("_", " "),
    subtitle: observation.summary,
    status: observation.status,
    score: null,
    confidence: observation.confidence,
    properties: [{ label: "Source", value: observation.source }, { label: "Real signals", value: observation.signalIds.length }],
    relationships: observation.signalIds.map((sid) => ({ relation: "derived_from", targetType: "signal", targetId: sid, targetLabel: sid })),
    evidence: [],
    actions: [{ label: "Open Decision Center", kind: "link", href: "/intelligence/decisions" }],
    history: [],
  }
}

export async function resolveObjectDetail(orgId: string, projectId: string, type: ObjectType, id: string): Promise<ObjectDetail | null> {
  switch (type) {
    case "entity":
      return resolveEntity(orgId, projectId, id)
    case "opportunity":
      return resolveOpportunity(orgId, projectId, id)
    case "page":
      return resolvePage(orgId, projectId, id)
    case "decision":
      return resolveDecision(orgId, projectId, id)
    case "agent_run":
      return resolveAgentRun(orgId, projectId, id)
    case "observation":
      return resolveObservation(orgId, projectId, id)
  }
}
