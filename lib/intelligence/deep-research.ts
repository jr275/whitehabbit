import "server-only"

/* ================================================================== *
 * DEEP RESEARCH AGENT (§22, ADR-024) — its job is NOT to write
 * content. It answers: "what evidence and information would make this
 * opportunity materially better than existing pages?" Every claim it
 * surfaces (facts) carries real provenance (an evidence/entity_evidence
 * id); every gap/contradiction is a real, checkable absence or
 * conflict in already-persisted data — never invented.
 * ================================================================== */

import { getEntity, listRelationshipsForEntity, listEvidenceForEntity } from "@/lib/knowledge/repo"
import { listEvidenceForSubject } from "./evidence"
import { listOpportunityGraph } from "./opportunity-graph"
import { getMetricSeries } from "./markets"

export interface DeepResearchFact {
  text: string
  sourceType: string
  sourceUrl: string | null
  evidenceId: string
  confidence: number
}

export interface DeepResearchArtifact {
  questions: string[]
  sources: string[]
  entities: string[] // real entity ids referenced
  dataPoints: { key: string; value: unknown }[]
  facts: DeepResearchFact[]
  contradictions: string[]
  gaps: string[]
  recommendations: string[]
}

export async function runDeepResearch(orgId: string, projectId: string, opportunity: { id: string; primaryEntityId: string | null; topic: string; targetIntent: string | null }): Promise<DeepResearchArtifact> {
  const facts: DeepResearchFact[] = []
  const sources = new Set<string>()
  const entities = new Set<string>()
  const gaps: string[] = []
  const contradictions: string[] = []
  const questions: string[] = []
  const dataPoints: { key: string; value: unknown }[] = []

  if (opportunity.primaryEntityId) {
    entities.add(opportunity.primaryEntityId)
    const entity = await getEntity(opportunity.primaryEntityId, orgId)
    const evidence = await listEvidenceForEntity(opportunity.primaryEntityId, orgId)
    for (const e of evidence) {
      facts.push({ text: e.fact, sourceType: e.sourceType, sourceUrl: e.sourceUrl, evidenceId: e.id, confidence: e.confidence ?? 0.5 })
      if (e.sourceUrl) sources.add(e.sourceUrl)
      if (e.verificationStatus === "conflicting") contradictions.push(`Evidence "${e.fact}" is marked conflicting — needs real reconciliation before it's cited.`)
    }
    if (evidence.length === 0) {
      gaps.push(`No entity_evidence exists for "${entity?.name ?? opportunity.primaryEntityId}" yet.`)
      questions.push(`What real, sourced facts exist about ${entity?.name ?? "this entity"}?`)
    }

    const relationships = await listRelationshipsForEntity(opportunity.primaryEntityId, orgId)
    if (relationships.length === 0) {
      gaps.push("No entity relationships exist yet — no comparison or contextual angle is possible.")
      questions.push(`What other entities relate to ${entity?.name ?? "this entity"} (competitors, sub-categories, related places)?`)
    }
  } else {
    gaps.push("This opportunity has no primary entity — no entity-scoped evidence can be gathered.")
  }

  // real external evidence linked via the unified evidence table (§11)
  const genericEvidence = await listEvidenceForSubject(orgId, "opportunity", opportunity.id)
  for (const e of genericEvidence) {
    sources.add(e.sourceUrl ?? e.source)
    if (e.verificationStatus === "conflicting") contradictions.push(`Evidence from "${e.source}" is marked conflicting.`)
  }

  // real market data, if this opportunity is linked to one (§19)
  const graph = await listOpportunityGraph(orgId, opportunity.id)
  const marketEdge = graph.find((e) => e.nodeType === "market")
  if (marketEdge) {
    // best-effort: real metric series only surfaces if a real
    // MetricDefinition+observations exist for this market — an absent
    // series is an honest gap, not an error.
    const metricDefIds = graph.filter((e) => e.nodeType === "data_observation").map((e) => e.nodeId)
    if (metricDefIds.length === 0) {
      gaps.push("A market is linked but no real metric observations exist for it yet.")
      questions.push("What real market metrics (demand, supply, price, growth) are available for this market?")
    } else {
      for (const id of metricDefIds) {
        const series = await getMetricSeries(id, marketEdge.nodeId)
        dataPoints.push(...series.map((s) => ({ key: `${id}:${s.period}`, value: s.value })))
      }
    }
  } else {
    gaps.push("No market is linked to this opportunity — market-level depth is unavailable.")
  }

  const recommendations: string[] = []
  if (gaps.some((g) => g.includes("entity_evidence"))) recommendations.push("RESEARCH — extend crawling or add first-party structured data for this entity.")
  if (gaps.some((g) => g.includes("market"))) recommendations.push("CREATE_DATA_ASSET — ingest a real external market dataset via a DataConnector.")
  if (contradictions.length > 0) recommendations.push("Resolve conflicting evidence before citing it in generated content.")
  if (recommendations.length === 0) recommendations.push("Sufficient real evidence exists — proceed to content generation.")

  return { questions, sources: [...sources], entities: [...entities], dataPoints, facts, contradictions, gaps, recommendations }
}
