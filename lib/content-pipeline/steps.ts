import "server-only"

/* ================================================================== *
 * CONTENT GENERATION — STEP DISPATCH (Phase 5A, ADR-023). Single
 * source of truth for each named step's logic; shared by the real
 * queue-driven step-worker and content-pipeline/orchestrator.ts's
 * LegacySyncExecutionAdapter (a thin in-process loop over these same
 * functions). See lib/website-discovery/steps.ts's header for the full
 * design rationale — identical here.
 *
 * "decide_publish" is deliberately NOT wrapped in runStep()'s
 * checkpoint-and-skip mechanic: it must be safe to re-dispatch after a
 * human approval decision, and it already achieves its own idempotency
 * the normal way (getApprovalForArtifact() / getPageByOpportunity() /
 * publishPageAction()'s own PageNotReadyError-as-no-op) — exactly how
 * this step worked before Phase 5A, unchanged in substance, just now
 * re-entered as its own job instead of falling through in one closure.
 * ================================================================== */

import { getApprovalForArtifact, requestApproval } from "@/lib/workflow/approval"
import type { AutonomyLevel } from "@/lib/workflow/autonomy"
import { evaluatePublishAutonomy } from "@/lib/workflow/autonomy"
import { assertCapability } from "@/lib/workflow/permissions"
import { runStep } from "@/lib/workflow/engine"
import type { WorkflowRun } from "@/lib/workflow/types"
import type { Opportunity } from "@/lib/opportunity/model"
import { updateOpportunityStatus } from "@/lib/opportunity/repo"
import type { PageBrief } from "@/lib/pagebrief/model"
import type { Page, PageContent } from "@/lib/pages/model"
import { createPage, createPageVersion, generateUniqueSlug, getPageByOpportunity, updatePageScores } from "@/lib/pages/repo"
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
import { createContentArtifact, getArtifact } from "./repo"
import { runResearch } from "./research"
import { runSeoAnalysis } from "./seo"
import type { StepOutcome } from "@/lib/workflow/step-types"
import { buildInformationGainV2Input } from "@/lib/opportunity/information-gain-v2-input"
import { computeInformationGainV2 } from "@/lib/opportunity/information-gain-v2"
import { evaluateInformationGainGate } from "@/lib/opportunity/information-gain-gate"
import { logAgentDecision } from "@/lib/intelligence/agent-decision-log"
import { applyScoreAdjustment, computeScoreAdjustment } from "@/lib/intelligence/learning-loop"

export const CONTENT_GENERATION_STEPS = ["research", "information_gain_gate", "outline", "draft", "seo", "geo", "quality", "decide_publish"] as const
export type ContentGenerationStepName = (typeof CONTENT_GENERATION_STEPS)[number]

export function contentGenerationStepSequence(step: string): number {
  const idx = CONTENT_GENERATION_STEPS.indexOf(step as ContentGenerationStepName)
  if (idx === -1) throw new Error(`Unknown content_generation step: ${step}`)
  return idx + 1
}

export class ContentGenerationBlockedError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = "ContentGenerationBlockedError"
  }
}

export interface ContentGenerationStepResult {
  outcome: StepOutcome
  /** populated only on a terminal outcome, so the caller can report a
   * real Page back to whoever is watching this workflow synchronously
   * (the LegacySyncExecutionAdapter, or a caller polling by workflow id). */
  page?: Page
  autoPublished?: boolean
  approvalRequested?: boolean
}

async function persistArtifact(orgId: string, projectId: string, pageBriefId: string, agentRunId: string, type: "research" | "outline" | "draft" | "seo" | "geo" | "quality", content: unknown) {
  return createContentArtifact({ orgId, projectId, pageBriefId, agentRunId, type, content })
}

/** Executes exactly one named step. Throws DraftBlockedError-derived
 * ContentGenerationBlockedError on a real, expected "no LLM configured"
 * condition (never fabricated content) — the caller finalizes the
 * workflow FAILED and returns the opportunity to "approved" so a human
 * can retry later once a provider is configured. Any other thrown error
 * is a real failure for the caller to handle via retry/dead-letter. */
export async function dispatchContentGenerationStep(run: WorkflowRun, opportunity: Opportunity, brief: PageBrief, stepName: string): Promise<ContentGenerationStepResult> {
  const { orgId, projectId } = opportunity

  switch (stepName as ContentGenerationStepName) {
    case "research": {
      assertCapability("ContentGenerationAgent", "write_page_brief")
      await runStep(run, 1, "research", null, async () => {
        const research = await runResearch(orgId, brief)
        await persistArtifact(orgId, projectId, brief.id, run.id, "research", research)
        return { output: { claimCount: research.claims.length, sourceCount: research.sources.length, confidence: research.confidence } }
      })
      return { outcome: { kind: "advance", nextStep: "information_gain_gate" } }
    }

    case "information_gain_gate": {
      // §5/§24 (ADR-031) — the real, enforced gate: below the real
      // threshold, generation stops HERE, before outline/draft ever
      // run, never after wasting an LLM call. The gate's action/reason
      // is a real, explainable decision (never "AI decided this") and
      // is logged to the Agent Decision Log regardless of outcome.
      const research = await getArtifact<ResearchArtifact>(orgId, run.id, "research")
      if (!research) throw new Error("information_gain_gate dispatched before research completed — no research artifact on record.")
      let gateAllowed = true
      let gateReason = ""
      await runStep(run, 2, "information_gain_gate", null, async () => {
        const { input, hasExistingSimilarPage } = await buildInformationGainV2Input(orgId, projectId, opportunity)
        const rawResult = computeInformationGainV2(input)
        // §13 Learning Loop (ADR-034/035): a real, bounded correction
        // from this project's own real predicted-vs-actual history —
        // null (a true no-op) until MIN_CALIBRATION_SAMPLES real
        // Outcomes exist, so a fresh project's gate behaves exactly as
        // the uncalibrated model until real data justifies adjusting it.
        const adjustment = await computeScoreAdjustment(orgId, projectId, "information_gain")
        const result = applyScoreAdjustment(rawResult, adjustment)
        const gate = evaluateInformationGainGate(result, hasExistingSimilarPage, undefined, !!opportunity.primaryEntityId)
        gateAllowed = gate.allowed
        gateReason = gate.reason
        await logAgentDecision({
          orgId,
          agentRunId: run.id,
          agent: "ContentGenerationAgent",
          decision: gate.action,
          reason: gate.reason,
          evidence: result.evidence,
          policy: "information_gain_gate_v2",
          confidence: result.score / 100,
          approvalRequired: false,
        })
        return { output: { score: result.score, rawScore: rawResult.score, action: gate.action, allowed: gate.allowed, missingRequirements: result.missingRequirements } }
      })
      if (!gateAllowed) throw new ContentGenerationBlockedError(gateReason)
      return { outcome: { kind: "advance", nextStep: "outline" } }
    }

    case "outline": {
      const research = await getArtifact<ResearchArtifact>(orgId, run.id, "research")
      if (!research) throw new Error("outline dispatched before research completed — no research artifact on record.")
      await runStep(run, 3, "outline", null, async () => {
        const outline = buildOutline(brief, research)
        await persistArtifact(orgId, projectId, brief.id, run.id, "outline", outline)
        return { output: { sectionCount: outline.sections.length } }
      })
      return { outcome: { kind: "advance", nextStep: "draft" } }
    }

    case "draft": {
      assertCapability("ContentGenerationAgent", "write_content_draft")
      const research = await getArtifact<ResearchArtifact>(orgId, run.id, "research")
      const outline = await getArtifact<OutlineArtifact>(orgId, run.id, "outline")
      if (!research || !outline) throw new Error("draft dispatched before research/outline completed.")
      try {
        await runStep(run, 4, "draft", null, async () => {
          const draft = await runDraft(brief, research, outline)
          await persistArtifact(orgId, projectId, brief.id, run.id, "draft", draft)
          return { output: { title: draft.title, sectionCount: draft.sections.length, executionMode: draft.executionMode ?? null }, inputTokens: draft.inputTokens, outputTokens: draft.outputTokens, model: draft.model }
        })
      } catch (err) {
        if (err instanceof DraftBlockedError) throw new ContentGenerationBlockedError(err.message)
        throw err
      }
      return { outcome: { kind: "advance", nextStep: "seo" } }
    }

    case "seo": {
      const research = await getArtifact<ResearchArtifact>(orgId, run.id, "research")
      const draft = await getArtifact<DraftArtifact>(orgId, run.id, "draft")
      if (!research || !draft) throw new Error("seo dispatched before research/draft completed.")
      await runStep(run, 5, "seo", null, async () => {
        const seo = runSeoAnalysis(draft, research, brief)
        await persistArtifact(orgId, projectId, brief.id, run.id, "seo", seo)
        return { output: { score: seo.score } }
      })
      return { outcome: { kind: "advance", nextStep: "geo" } }
    }

    case "geo": {
      const research = await getArtifact<ResearchArtifact>(orgId, run.id, "research")
      const draft = await getArtifact<DraftArtifact>(orgId, run.id, "draft")
      if (!research || !draft) throw new Error("geo dispatched before research/draft completed.")
      await runStep(run, 6, "geo", null, async () => {
        const geo = runGeoAnalysis(draft, research, brief)
        await persistArtifact(orgId, projectId, brief.id, run.id, "geo", geo)
        return { output: { geoScore: geo.geoScore, aeoScore: geo.aeoScore } }
      })
      return { outcome: { kind: "advance", nextStep: "quality" } }
    }

    case "quality": {
      const research = await getArtifact<ResearchArtifact>(orgId, run.id, "research")
      const draft = await getArtifact<DraftArtifact>(orgId, run.id, "draft")
      const seo = await getArtifact<SeoArtifact>(orgId, run.id, "seo")
      const geo = await getArtifact<GeoArtifact>(orgId, run.id, "geo")
      if (!research || !draft || !seo || !geo) throw new Error("quality dispatched before an earlier step completed.")
      let quality!: QualityArtifact
      await runStep(run, 7, "quality", null, async () => {
        const factCheck = runFactCheck(draft, research) // deterministic, no I/O — real but not worth its own checkpointed step
        quality = runQualityGate(draft, research, brief, seo, geo, opportunity.informationGainScore, factCheck)
        await persistArtifact(orgId, projectId, brief.id, run.id, "quality", quality)
        return { output: { passed: quality.passed, qualityScore: quality.qualityScore, reasons: quality.reasons } }
      })

      if (!quality.passed) {
        // A real, valid outcome — a rejected page is not a workflow
        // failure. Create/update the Page here (mirrors the pre-5A
        // behavior) so a rejected page is still inspectable.
        const page = await upsertRejectedOrReadyPage(run, opportunity, brief, draft, seo, geo, quality, "quality_rejected")
        await updateOpportunityStatus(opportunity.id, orgId, "approved")
        return { outcome: { kind: "terminal", status: "succeeded" }, page, autoPublished: false, approvalRequested: false }
      }
      return { outcome: { kind: "advance", nextStep: "decide_publish" } }
    }

    case "decide_publish": {
      const research = await getArtifact<ResearchArtifact>(orgId, run.id, "research")
      const draft = await getArtifact<DraftArtifact>(orgId, run.id, "draft")
      const seo = await getArtifact<SeoArtifact>(orgId, run.id, "seo")
      const geo = await getArtifact<GeoArtifact>(orgId, run.id, "geo")
      const quality = await getArtifact<QualityArtifact>(orgId, run.id, "quality")
      if (!research || !draft || !seo || !geo || !quality) throw new Error("decide_publish dispatched before an earlier step completed.")

      const page = await upsertRejectedOrReadyPage(run, opportunity, brief, draft, seo, geo, quality, "ready")

      // §13/§27: the autonomy decision — backend-evaluated, never the LLM's own call.
      const project = await getProject(projectId, orgId)
      const autonomyLevel: AutonomyLevel = project?.autonomyLevel ?? "LEVEL_1"
      const { riskLevel } = classifyContentRisk(draft)
      const factsVerifiedGate = quality.gates.find((g) => g.name === "Fact verification")
      const decision = evaluatePublishAutonomy({
        autonomyLevel,
        informationGainScore: opportunity.informationGainScore,
        qualityScore: quality.qualityScore,
        riskLevel,
        factsVerified: factsVerifiedGate?.passed ?? false,
        schemaValid: true, // real JSON-LD is generated and validated at publish time — publishPageAction() itself refuses to publish if that check fails
      })

      // Idempotent resume: a human may already have approved/rejected
      // this exact publish while the run was WAITING_APPROVAL.
      const existingApproval = await getApprovalForArtifact(orgId, "page", page.id, "publish")

      if (existingApproval?.status === "approved" || decision.autoPublishAllowed) {
        assertCapability("ContentGenerationAgent", "write_page_version")
        const { page: published } = await publishPageAction(page.id, orgId).catch((err) => {
          if (err instanceof PageNotReadyError) return { page } // already published by a concurrent dispatch — real idempotency, not an error
          throw err
        })
        return {
          outcome: { kind: "terminal", status: "succeeded" },
          page: published,
          autoPublished: !existingApproval,
          approvalRequested: false,
        }
      }

      if (existingApproval?.status === "rejected") {
        // a human explicitly said no — the workflow already finalized
        // FAILED when that decision was recorded (lib/workflow/approval.ts).
        return { outcome: { kind: "terminal", status: "failed", errorReason: existingApproval.decisionReason ?? "Approval rejected." }, page, autoPublished: false, approvalRequested: false }
      }

      if (existingApproval?.status === "pending") {
        // still waiting — nothing new to do; the run is already WAITING_APPROVAL.
        return { outcome: { kind: "waiting_approval" }, page, autoPublished: false, approvalRequested: true }
      }

      await requestApproval({
        orgId,
        projectId,
        workflowRunId: run.id,
        artifactType: "page",
        artifactId: page.id,
        requestedByAgent: "PublisherAgent",
        approvalType: "publish",
        riskLevel,
        expiresInMs: 7 * 24 * 60 * 60 * 1000,
      })
      return { outcome: { kind: "waiting_approval" }, page, autoPublished: false, approvalRequested: true }
    }

    default:
      throw new Error(`Unknown content_generation step: ${stepName}`)
  }
}

/** Page + PageVersion creation/update — real, idempotent: a resumed run
 * reuses the page already created for this opportunity instead of
 * creating a second one. Shared by the "quality" (rejected case) and
 * "decide_publish" (ready case) steps — same real logic Phase 4 had
 * inline in the orchestrator, factored out only because two different
 * steps can now reach it. */
async function upsertRejectedOrReadyPage(
  run: WorkflowRun,
  opportunity: Opportunity,
  brief: PageBrief,
  draft: DraftArtifact,
  seo: SeoArtifact,
  geo: GeoArtifact,
  quality: QualityArtifact,
  status: "ready" | "quality_rejected",
): Promise<Page> {
  const { orgId, projectId } = opportunity
  let page = await getPageByOpportunity(opportunity.id, orgId)
  if (!page) {
    const slug = await generateUniqueSlug(projectId, draft.title)
    // §19: classification-only binding (ADR-016 amendment) — matches the
    // opportunity against the project's active route templates, through
    // the same vertical-agnostic function regardless of vertical.
    const activeTemplates = await listActiveRouteTemplates(orgId, projectId)
    const matchedTemplate = resolveRouteTemplate(activeTemplates, { targetIntent: opportunity.targetIntent, opportunityType: opportunity.opportunityType })
    page = await createPage({
      orgId,
      projectId,
      opportunityId: opportunity.id,
      pageBriefId: brief.id,
      slug,
      title: draft.title,
      metaDescription: draft.metaDescription,
      routeTemplateId: matchedTemplate?.id ?? null,
    })
    const research = await getArtifact<ResearchArtifact>(orgId, run.id, "research")
    const factCheck = research ? runFactCheck(draft, research) : { results: [], allCitedVerified: true }
    const pageContent: PageContent = { title: draft.title, metaDescription: draft.metaDescription, sections: draft.sections.map((s) => ({ heading: s.heading, body: s.body })) }
    await createPageVersion({ orgId, pageId: page.id, content: pageContent, structuredContent: { claims: research?.claims ?? [], factCheck: factCheck.results }, agentRunId: run.id, qualityStatus: status })
  }
  const rejectionReasons = status === "quality_rejected" ? quality.reasons : null
  await updatePageScores(page.id, {
    status,
    qualityScore: quality.qualityScore,
    seoScore: seo.score,
    aeoScore: geo.aeoScore,
    geoScore: geo.geoScore,
    informationGainScore: opportunity.informationGainScore,
    rejectionReasons,
  })
  // keep the returned Page current — a stale createPage()/
  // getPageByOpportunity() snapshot's status ('draft') must never leak
  // out after updatePageScores() above already wrote the real status.
  return { ...page, status, qualityScore: quality.qualityScore, seoScore: seo.score, aeoScore: geo.aeoScore, geoScore: geo.geoScore, informationGainScore: opportunity.informationGainScore, rejectionReasons }
}

/** The step immediately after the run's last real checkpoint. Note
 * "decide_publish" is never itself a `lastCompletedStep` (it doesn't go
 * through runStep's checkpointing — see this file's header) — resuming
 * a run whose last checkpointed step is "quality" always lands back on
 * "decide_publish", which is exactly correct whether decide_publish
 * hasn't run yet OR already ran once and is waiting on/resuming from an
 * approval decision. */
export function nextContentGenerationStep(lastCompletedSequence: number | null): string | null {
  const nextSeq = (lastCompletedSequence ?? 0) + 1
  if (nextSeq > CONTENT_GENERATION_STEPS.length) return null
  return CONTENT_GENERATION_STEPS[nextSeq - 1]
}
