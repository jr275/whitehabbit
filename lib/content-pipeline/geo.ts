/* ================================================================== *
 * AEO / GEO AGENT (§19) — deterministic. Never claims a page is
 * guaranteed to rank or be cited (§19's explicit prohibition) — only
 * reports real, structural readiness signals with the same discipline
 * as seo.ts.
 * ================================================================== */

import type { PageBrief } from "@/lib/pagebrief/model"
import type { DraftArtifact, GeoArtifact, ResearchArtifact, SeoCheck } from "./model"

function normalizeWords(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter((w) => w.length > 3))
}

function questionAddressed(question: string, sections: DraftArtifact["sections"]): boolean {
  const qWords = normalizeWords(question)
  if (qWords.size === 0) return false
  return sections.some((s) => {
    const bodyWords = normalizeWords(s.body)
    let overlap = 0
    for (const w of qWords) if (bodyWords.has(w)) overlap += 1
    return overlap / qWords.size >= 0.3
  })
}

export function runGeoAnalysis(draft: DraftArtifact, research: ResearchArtifact, brief: PageBrief): GeoArtifact {
  const checks: SeoCheck[] = []

  const hasDirectAnswer = draft.sections.length > 0 && draft.sections[0].body.trim().length >= 20
  checks.push({ name: "Direct answer present", passed: hasDirectAnswer, detail: hasDirectAnswer ? "first section opens with real content" : "first section is empty or trivial" })

  const questionsAddressed = brief.questions.filter((q) => questionAddressed(q, draft.sections))
  const questionCoverageOk = brief.questions.length === 0 || questionsAddressed.length / brief.questions.length >= 0.5
  checks.push({
    name: "Question coverage",
    passed: questionCoverageOk,
    detail: brief.questions.length ? `${questionsAddressed.length}/${brief.questions.length} brief questions addressed in the draft` : "no questions on the brief",
  })

  const sourceTransparencyOk = research.sources.length > 0
  checks.push({ name: "Source transparency", passed: sourceTransparencyOk, detail: `${research.sources.length} real source(s) behind this page's claims` })

  const evidenceBackedSections = draft.sections.filter((s) => s.claimIndices.length > 0).length
  const evidenceOk = research.claims.length === 0 || evidenceBackedSections > 0
  checks.push({ name: "Evidence-backed sections", passed: evidenceOk, detail: `${evidenceBackedSections}/${draft.sections.length} sections cite research claims` })

  const structuredFactsOk = brief.questions.length === 0 || brief.schemaStrategy.includes("FAQPage")
  checks.push({ name: "Structured facts (FAQPage)", passed: structuredFactsOk, detail: brief.schemaStrategy.includes("FAQPage") ? "FAQPage schema planned" : "no FAQPage schema planned" })

  const aeoChecks = [checks[0], checks[1]] // direct answer + question coverage
  const geoChecks = [checks[2], checks[3], checks[4]] // source transparency + evidence + structured facts

  const aeoScore = Math.round((aeoChecks.filter((c) => c.passed).length / aeoChecks.length) * 100)
  const geoScore = Math.round((geoChecks.filter((c) => c.passed).length / geoChecks.length) * 100)
  const recommendations = checks.filter((c) => !c.passed).map((c) => `Improve: ${c.name} — ${c.detail}`)

  return { geoScore, aeoScore, checks, recommendations }
}
