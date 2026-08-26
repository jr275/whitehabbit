/* ================================================================== *
 * SEO AGENT (§18) — deterministic, structural analysis. No LLM call:
 * every check is a real, explainable fact about the draft, matching
 * this codebase's existing SkillEvaluation discipline ("never
 * Math.random", lib/agent/types.ts).
 * ================================================================== */

import type { PageBrief } from "@/lib/pagebrief/model"
import type { DraftArtifact, ResearchArtifact, SeoArtifact, SeoCheck } from "./model"

export function runSeoAnalysis(draft: DraftArtifact, research: ResearchArtifact, brief: PageBrief): SeoArtifact {
  const checks: SeoCheck[] = []

  const titleOk = draft.title.length >= 10 && draft.title.length <= 70
  checks.push({ name: "Title length", passed: titleOk, detail: `${draft.title.length} characters (target 10-70)` })

  const descriptionOk = draft.metaDescription.length >= 50 && draft.metaDescription.length <= 160
  checks.push({ name: "Meta description length", passed: descriptionOk, detail: `${draft.metaDescription.length} characters (target 50-160)` })

  const headingsOk = draft.sections.length >= 2
  checks.push({ name: "Heading structure", passed: headingsOk, detail: `${draft.sections.length} sections` })

  const intentOk = !!brief.targetIntent
  checks.push({ name: "Search intent declared", passed: intentOk, detail: brief.targetIntent ?? "no target intent on the brief" })

  const citedClaimCount = new Set(draft.sections.flatMap((s) => s.claimIndices)).size
  const entityCoverageOk = research.claims.length === 0 || citedClaimCount / research.claims.length >= 0.3
  checks.push({
    name: "Entity/claim coverage",
    passed: entityCoverageOk,
    detail: research.claims.length ? `${citedClaimCount}/${research.claims.length} research claims cited` : "no research claims were available to cite",
  })

  const completenessOk = draft.sections.every((s) => s.body.trim().length >= 20)
  checks.push({ name: "Section completeness", passed: completenessOk, detail: "every section has a real, non-trivial body" })

  const structuredDataOk = brief.schemaStrategy.length > 0
  checks.push({ name: "Structured data planned", passed: structuredDataOk, detail: brief.schemaStrategy.join(", ") || "none planned" })

  const passedCount = checks.filter((c) => c.passed).length
  const score = Math.round((passedCount / checks.length) * 100)
  const recommendations = checks.filter((c) => !c.passed).map((c) => `Improve: ${c.name} — ${c.detail}`)

  return { score, checks, recommendations }
}
