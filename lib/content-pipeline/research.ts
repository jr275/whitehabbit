import "server-only"

/* ================================================================== *
 * RESEARCH AGENT (§16) — retrieves ONLY information available through
 * the stored Knowledge Graph and its evidence (which itself traces to
 * the website crawl). No external research provider is configured in
 * this revision, so none is pretended to exist (§16: "Do not pretend
 * external research exists if no external provider is connected.").
 * ================================================================== */

import { listEvidenceForEntity } from "@/lib/knowledge/repo"
import type { PageBrief } from "@/lib/pagebrief/model"
import type { ResearchArtifact, ResearchClaim } from "./model"

export async function runResearch(orgId: string, brief: PageBrief): Promise<ResearchArtifact> {
  const entityIds = [brief.primaryEntityId, ...brief.secondaryEntityIds].filter((id): id is string => !!id)
  const claims: ResearchClaim[] = []
  const sources = new Set<string>()

  for (const entityId of entityIds) {
    const evidence = await listEvidenceForEntity(entityId, orgId)
    for (const e of evidence) {
      claims.push({ text: e.fact, entityId, evidenceIds: [e.id], sourceUrl: e.sourceUrl, confidence: e.confidence ?? 0.5 })
      if (e.sourceUrl) sources.add(e.sourceUrl)
    }
  }

  const confidence = claims.length ? Math.round((claims.reduce((sum, c) => sum + c.confidence, 0) / claims.length) * 100) : 0
  return { claims, sources: [...sources], confidence }
}
