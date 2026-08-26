import "server-only"

/* ================================================================== *
 * CONTENT GENERATION PIPELINE ORCHESTRATOR (§15, Phase 4 §21-27) —
 * Research -> Outline -> Draft -> SEO -> AEO/GEO -> Fact Check ->
 * Quality -> (Page) -> Autonomy decision -> Publish or Approval, as
 * one durable, checkpointed, resumable WorkflowRun (ADR-016/017).
 *
 * Same resume-correctness rule as lib/website-discovery/orchestrator.ts:
 * a resumed step's closure never runs — every later step reads real,
 * already-persisted state, never an outer-scope variable a skipped
 * closure would have set.
 *
 * The publish decision (§13) is evaluated by the backend ONLY —
 * evaluatePublishAutonomy() is a pure function over real, already-
 * computed scores; nothing here asks an LLM whether it may publish.
 * If autonomy disallows auto-publish, a real, durable approval request
 * is created and the workflow pauses at WAITING_APPROVAL — resuming
 * this exact function (after a human decision) finds that approval
 * already resolved and proceeds instead of asking again.
 * ================================================================== */

import { getApprovalForArtifact, requestApproval } from "@/lib/workflow/approval"
import type { AutonomyLevel } from "@/lib/workflow/autonomy"
import { evaluatePublishAutonomy } from "@/lib/workflow/autonomy"
import { assertCapability } from "@/lib/workflow/permissions"
import { finalizeWorkflow, runStep, workflowEngine } from "@/lib/workflow/engine"
import type { WorkflowRun } from "@/lib/workflow/types"
import type { Opportunity } from "@/lib/opportunity/model"
import { updateOpportunityStatus } from "@/lib/opportunity/repo"
import type { PageBrief } from "@/lib/pagebrief/model"
import type { Page, PageContent } from "@/lib/pages/model"
import { createPage, createPageVersion, generateUniqueSlug, getLatestVersion, getPageByOpportunity, updatePageScores } from "@/lib/pages/repo"
import { PageNotReadyError, publishPageAction } from "@/lib/pages/publish"
import { getProject } from "@/lib/projects/repo"
import { listActiveRouteTemplates } from "@/lib/route-templates/repo"
import { resolveRouteTemplate } from "@/lib/route-templates/resolve"
import { runFactCheck } from "./fact-check"
import { DraftBlockedError, runDraft } from "./draft"
import type { DraftArtifact, GeoArtifact, OutlineArtifact, QualityArtifact, ResearchArtifact, SeoArtifact } from "./model"
import { buildOutline } from "./outline"
import { runGeoAnalysis } from "./geo"
import { classifyContentRisk } from "./risk"
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
  autoPublished: boolean
  approvalRequested: boolean
}

export async function runContentGeneration(opportunity: Opportunity, brief: PageBrief): Promise<ContentGenerationResult> {
  assertCapability("ContentGenerationAgent", "write_page_brief")

  const run: WorkflowRun = await workflowEngine.start({
    orgId: opportunity.orgId,
    projectId: opportunity.projectId,
    pipeline: "content_generation",
    subjectType: "opportunity",
    subjectId: opportunity.id,
  })
  await updateOpportunityStatus(opportunity.id, opportunity.orgId, "generating")

  const persistArtifact = (type: "research" | "outline" | "draft" | "seo" | "geo" | "quality", content: unknown) =>
    createContentArtifact({ orgId: opportunity.orgId, projectId: opportunity.projectId, pageBriefId: brief.id, agentRunId: run.id, type, content })

  try {
    let research!: ResearchArtifact
    await runStep(run, 1, "research", null, async () => {
      research = await runResearch(opportunity.orgId, brief)
      await persistArtifact("research", research)
      return { output: { claimCount: research.claims.length, sourceCount: research.sources.length, confidence: research.confidence } }
    })

    let outline!: OutlineArtifact
    await runStep(run, 2, "outline", null, async () => {
      outline = buildOutline(brief, research)
      await persistArtifact("outline", outline)
      return { output: { sectionCount: outline.sections.length } }
    })

    assertCapability("ContentGenerationAgent", "write_content_draft")
    let draft!: DraftArtifact
    try {
      await runStep(run, 3, "draft", null, async () => {
        draft = await runDraft(brief, research, outline)
        await persistArtifact("draft", draft)
        return { output: { title: draft.title, sectionCount: draft.sections.length, executionMode: draft.executionMode ?? null }, inputTokens: draft.inputTokens, outputTokens: draft.outputTokens, model: draft.model }
      })
    } catch (err) {
      if (err instanceof DraftBlockedError) {
        await finalizeWorkflow(run.id, run.orgId, "failed", { errorReason: err.message })
        await updateOpportunityStatus(opportunity.id, opportunity.orgId, "approved")
        throw new ContentGenerationBlockedError(err.message)
      }
      throw err
    }

    let seo!: SeoArtifact
    await runStep(run, 4, "seo", null, async () => {
      seo = runSeoAnalysis(draft, research, brief)
      await persistArtifact("seo", seo)
      return { output: { score: seo.score } }
    })

    let geo!: GeoArtifact
    await runStep(run, 5, "geo", null, async () => {
      geo = runGeoAnalysis(draft, research, brief)
      await persistArtifact("geo", geo)
      return { output: { geoScore: geo.geoScore, aeoScore: geo.aeoScore } }
    })

    const factCheck = runFactCheck(draft, research) // deterministic, no I/O — real but not worth its own checkpointed step

    let quality!: QualityArtifact
    await runStep(run, 6, "quality", null, async () => {
      quality = runQualityGate(draft, research, brief, seo, geo, opportunity.informationGainScore, factCheck)
      await persistArtifact("quality", quality)
      return { output: { passed: quality.passed, qualityScore: quality.qualityScore, reasons: quality.reasons } }
    })

    // Page + PageVersion — real, idempotent: a resumed run reuses the
    // page already created for this opportunity instead of creating a
    // second one (§6).
    let page = await getPageByOpportunity(opportunity.id, opportunity.orgId)
    const status = quality.passed ? "ready" : "quality_rejected"
    if (!page) {
      const slug = await generateUniqueSlug(opportunity.projectId, draft.title)
      // §19: classification-only binding (ADR-016 amendment) — matches
      // the opportunity against the project's active route templates,
      // through the exact same vertical-agnostic function regardless of
      // what vertical the project is in. A project with no templates
      // configured yet simply gets null — never a fabricated match.
      const activeTemplates = await listActiveRouteTemplates(opportunity.orgId, opportunity.projectId)
      const matchedTemplate = resolveRouteTemplate(activeTemplates, { targetIntent: opportunity.targetIntent, opportunityType: opportunity.opportunityType })
      page = await createPage({
        orgId: opportunity.orgId,
        projectId: opportunity.projectId,
        opportunityId: opportunity.id,
        pageBriefId: brief.id,
        slug,
        title: draft.title,
        metaDescription: draft.metaDescription,
        routeTemplateId: matchedTemplate?.id ?? null,
      })
      const pageContent: PageContent = { title: draft.title, metaDescription: draft.metaDescription, sections: draft.sections.map((s) => ({ heading: s.heading, body: s.body })) }
      await createPageVersion({ orgId: opportunity.orgId, pageId: page.id, content: pageContent, structuredContent: { claims: research.claims, factCheck: factCheck.results }, agentRunId: run.id, qualityStatus: status })
    }
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
    // keep the in-memory `page` current for every return below — a
    // stale createPage()/getPageByOpportunity() snapshot's status
    // ('draft') must never leak out after updatePageScores() above
    // already wrote the real status to the database.
    page = { ...page, status, qualityScore: quality.qualityScore, seoScore: seo.score, aeoScore: geo.aeoScore, geoScore: geo.geoScore, informationGainScore: opportunity.informationGainScore, rejectionReasons }

    if (!quality.passed) {
      await finalizeWorkflow(run.id, run.orgId, "succeeded") // the PIPELINE succeeded — it correctly produced a rejected page, which is a real, valid outcome, not a workflow failure
      await updateOpportunityStatus(opportunity.id, opportunity.orgId, "approved")
      return { agentRunId: run.id, page, autoPublished: false, approvalRequested: false }
    }

    // §13/§27: the autonomy decision — backend-evaluated, never the LLM's own call.
    const project = await getProject(opportunity.projectId, opportunity.orgId)
    const autonomyLevel: AutonomyLevel = project?.autonomyLevel ?? "LEVEL_1"
    const { riskLevel } = classifyContentRisk(draft)
    const decision = evaluatePublishAutonomy({
      autonomyLevel,
      informationGainScore: opportunity.informationGainScore,
      qualityScore: quality.qualityScore,
      riskLevel,
      factsVerified: factCheck.allCitedVerified,
      schemaValid: true, // real JSON-LD is generated and validated at publish time (lib/pages/json-ld.ts) — publishPageAction() itself refuses to publish if that check fails, so this is a real gate, not a rubber stamp
    })

    // Resume path: a human may already have approved/rejected this exact
    // publish while the run was WAITING_APPROVAL — never re-ask.
    const existingApproval = await getApprovalForArtifact(opportunity.orgId, "page", page.id, "publish")

    if (existingApproval?.status === "approved" || decision.autoPublishAllowed) {
      assertCapability("ContentGenerationAgent", "write_page_version")
      const { page: published } = await publishPageAction(page.id, opportunity.orgId).catch((err) => {
        if (err instanceof PageNotReadyError) return { page } // already published by a concurrent call — real idempotency, not an error
        throw err
      })
      await finalizeWorkflow(run.id, run.orgId, "succeeded", { model: draft.model, inputTokens: draft.inputTokens, outputTokens: draft.outputTokens })
      return { agentRunId: run.id, page: published, autoPublished: !existingApproval, approvalRequested: false }
    }

    if (existingApproval?.status === "rejected") {
      // a human explicitly said no — the workflow already finalized
      // FAILED when that decision was recorded (lib/workflow/approval.ts);
      // this path only exists in case this function is called again for
      // some other reason. Never publish, never re-ask.
      return { agentRunId: run.id, page, autoPublished: false, approvalRequested: false }
    }

    if (existingApproval?.status === "pending") {
      // still waiting — nothing new to do.
      return { agentRunId: run.id, page, autoPublished: false, approvalRequested: false }
    }

    await requestApproval({
      orgId: opportunity.orgId,
      projectId: opportunity.projectId,
      workflowRunId: run.id,
      artifactType: "page",
      artifactId: page.id,
      requestedByAgent: "PublisherAgent",
      approvalType: "publish",
      riskLevel,
      expiresInMs: 7 * 24 * 60 * 60 * 1000,
    })
    return { agentRunId: run.id, page, autoPublished: false, approvalRequested: true }
  } catch (err) {
    if (err instanceof ContentGenerationBlockedError) throw err
    const message = err instanceof Error ? err.message : "Content generation failed for an unknown reason."
    await finalizeWorkflow(run.id, run.orgId, "failed", { errorReason: message }).catch(() => {})
    await updateOpportunityStatus(opportunity.id, opportunity.orgId, "approved")
    throw err
  }
}
