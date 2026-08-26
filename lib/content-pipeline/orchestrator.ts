import "server-only"

/* ================================================================== *
 * CONTENT GENERATION PIPELINE ORCHESTRATOR (§15) — Research -> Outline
 * -> Draft -> SEO -> AEO/GEO -> Quality, each a real step persisted to
 * agent_run_steps + content_artifacts (ADR-016). Ends by creating a
 * real Page + PageVersion — "ready" if the quality gate passed,
 * "quality_rejected" (with explicit reasons, §20) if not. Never
 * publishes on its own — publishing is a separate, explicit action
 * (§25 human-in-the-loop; ADR-003's autonomy-level default).
 *
 * Heavy intermediate artifacts stay in local variables between steps
 * (same reasoning as lib/website-discovery/orchestrator.ts) — each
 * step's persisted `output` is a small real summary, not the full
 * artifact (which is separately, fully persisted to content_artifacts).
 * ================================================================== */

import { createAgentRun, finalizeAgentRun, runStep } from "@/lib/agent-runs/repo"
import type { Opportunity } from "@/lib/opportunity/model"
import { updateOpportunityStatus } from "@/lib/opportunity/repo"
import type { PageBrief } from "@/lib/pagebrief/model"
import type { Page, PageContent } from "@/lib/pages/model"
import { createPage, createPageVersion, generateUniqueSlug, updatePageScores } from "@/lib/pages/repo"
import { DraftBlockedError, runDraft } from "./draft"
import type { DraftArtifact, GeoArtifact, OutlineArtifact, QualityArtifact, ResearchArtifact, SeoArtifact } from "./model"
import { buildOutline } from "./outline"
import { runGeoAnalysis } from "./geo"
import { runQualityGate } from "./quality"
import { createContentArtifact } from "./repo"
import { runResearch } from "./research"
import { runSeoAnalysis } from "./seo"

export class ContentGenerationBlockedError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = "ContentGenerationBlockedError"
  }
}

export interface ContentGenerationResult {
  agentRunId: string
  page: Page
}

export async function runContentGeneration(opportunity: Opportunity, brief: PageBrief): Promise<ContentGenerationResult> {
  const agentRun = await createAgentRun({
    orgId: opportunity.orgId,
    projectId: opportunity.projectId,
    pipeline: "content_generation",
    subjectType: "opportunity",
    subjectId: opportunity.id,
  })
  await updateOpportunityStatus(opportunity.id, opportunity.orgId, "generating")

  const persistArtifact = (type: "research" | "outline" | "draft" | "seo" | "geo" | "quality", content: unknown) =>
    createContentArtifact({ orgId: opportunity.orgId, projectId: opportunity.projectId, pageBriefId: brief.id, agentRunId: agentRun.id, type, content })

  try {
    let research!: ResearchArtifact
    await runStep(opportunity.orgId, agentRun.id, 1, "research", null, async () => {
      research = await runResearch(opportunity.orgId, brief)
      await persistArtifact("research", research)
      return { output: { claimCount: research.claims.length, sourceCount: research.sources.length, confidence: research.confidence } }
    })

    let outline!: OutlineArtifact
    await runStep(opportunity.orgId, agentRun.id, 2, "outline", null, async () => {
      outline = buildOutline(brief, research)
      await persistArtifact("outline", outline)
      return { output: { sectionCount: outline.sections.length } }
    })

    let draft!: DraftArtifact
    try {
      await runStep(opportunity.orgId, agentRun.id, 3, "draft", null, async () => {
        draft = await runDraft(brief, research, outline)
        await persistArtifact("draft", draft)
        return { output: { title: draft.title, sectionCount: draft.sections.length, executionMode: draft.executionMode ?? null }, inputTokens: draft.inputTokens, outputTokens: draft.outputTokens, model: draft.model }
      })
    } catch (err) {
      if (err instanceof DraftBlockedError) {
        await finalizeAgentRun(agentRun.id, { status: "blocked", errorReason: err.message })
        await updateOpportunityStatus(opportunity.id, opportunity.orgId, "approved")
        throw new ContentGenerationBlockedError(err.message)
      }
      throw err
    }

    let seo!: SeoArtifact
    await runStep(opportunity.orgId, agentRun.id, 4, "seo", null, async () => {
      seo = runSeoAnalysis(draft, research, brief)
      await persistArtifact("seo", seo)
      return { output: { score: seo.score } }
    })

    let geo!: GeoArtifact
    await runStep(opportunity.orgId, agentRun.id, 5, "geo", null, async () => {
      geo = runGeoAnalysis(draft, research, brief)
      await persistArtifact("geo", geo)
      return { output: { geoScore: geo.geoScore, aeoScore: geo.aeoScore } }
    })

    let quality!: QualityArtifact
    await runStep(opportunity.orgId, agentRun.id, 6, "quality", null, async () => {
      quality = runQualityGate(draft, research, brief, seo, geo, opportunity.informationGainScore)
      await persistArtifact("quality", quality)
      return { output: { passed: quality.passed, qualityScore: quality.qualityScore, reasons: quality.reasons } }
    })

    const slug = await generateUniqueSlug(opportunity.projectId, draft.title)
    const page = await createPage({
      orgId: opportunity.orgId,
      projectId: opportunity.projectId,
      opportunityId: opportunity.id,
      pageBriefId: brief.id,
      slug,
      title: draft.title,
      metaDescription: draft.metaDescription,
    })
    const pageContent: PageContent = { title: draft.title, metaDescription: draft.metaDescription, sections: draft.sections.map((s) => ({ heading: s.heading, body: s.body })) }
    const status = quality.passed ? "ready" : "quality_rejected"
    await createPageVersion({ orgId: opportunity.orgId, pageId: page.id, content: pageContent, structuredContent: { claims: research.claims }, agentRunId: agentRun.id, qualityStatus: status })
    const rejectionReasons = quality.passed ? null : quality.reasons
    await updatePageScores(page.id, {
      status,
      qualityScore: quality.qualityScore,
      seoScore: seo.score,
      aeoScore: geo.aeoScore,
      geoScore: geo.geoScore,
      informationGainScore: opportunity.informationGainScore,
      rejectionReasons,
    })

    await finalizeAgentRun(agentRun.id, { status: "completed", model: draft.model, inputTokens: draft.inputTokens, outputTokens: draft.outputTokens })
    if (!quality.passed) await updateOpportunityStatus(opportunity.id, opportunity.orgId, "approved")

    return {
      agentRunId: agentRun.id,
      page: { ...page, status, qualityScore: quality.qualityScore, seoScore: seo.score, aeoScore: geo.aeoScore, geoScore: geo.geoScore, informationGainScore: opportunity.informationGainScore, rejectionReasons },
    }
  } catch (err) {
    if (err instanceof ContentGenerationBlockedError) throw err
    const message = err instanceof Error ? err.message : "Content generation failed for an unknown reason."
    await finalizeAgentRun(agentRun.id, { status: "failed", errorReason: message })
    await updateOpportunityStatus(opportunity.id, opportunity.orgId, "approved")
    throw err
  }
}
