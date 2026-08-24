/* ================================================================== *
 * DOMAIN PROFILE — turns real onboarding answers into real grounding
 * text, and real answers into real heuristics.
 *
 * This is the entire mechanism behind "tailor-made is not cosmetic":
 * the resulting text becomes a Worker's KnowledgeSource content (see
 * lib/agent/knowledge.ts's retrieveRelevantKnowledge(), already wired
 * into every skill's execute()), so it genuinely changes what the LLM
 * sees for THIS customer — not a display-only label. Two customers of
 * the same Product answering differently produce a materially
 * different prompt, and so a materially different real result once a
 * real LLM credential is available (see the final report for the
 * current sandbox's credential status).
 * ================================================================== */

import { PROFILE_BUCKET_LABEL, type ProductTemplate } from "./catalog"

export type OnboardingAnswers = Record<string, string>

/** The fixed condition every onboarding-derived heuristic uses — also
 * the tag app/api/products/[productId]/onboard/route.ts's re-onboard
 * path matches on to replace ONLY these on re-onboarding, never a
 * heuristic the operator added by hand in Studio's Behavior step. */
export const DERIVED_HEURISTIC_CONDITION = "producing output for this worker"

/** Real, readable grounding text — grouped by bucket, only the buckets
 * the customer actually answered. Never pads a missing answer with
 * placeholder text. */
export function buildDomainProfileContent(product: ProductTemplate, answers: OnboardingAnswers): string {
  const sections: string[] = []
  const buckets: { bucket: (typeof product.onboarding)[number]["bucket"] }[] = []
  const seen = new Set<string>()
  for (const field of product.onboarding) {
    if (seen.has(field.bucket)) continue
    seen.add(field.bucket)
    buckets.push({ bucket: field.bucket })
  }
  for (const { bucket } of buckets) {
    const fieldsInBucket = product.onboarding.filter((f) => f.bucket === bucket)
    const lines = fieldsInBucket
      .map((f) => answers[f.key]?.trim())
      .filter((v): v is string => !!v)
    if (lines.length === 0) continue
    sections.push(`## ${PROFILE_BUCKET_LABEL[bucket]}\n${lines.join("\n")}`)
  }
  return sections.join("\n\n")
}

/** A real, short mission derived from the customer's own "business"
 * bucket answer — used both as the Worker's displayed mission AND as
 * the default search query lib/workforce/store.ts's runWorker() sends
 * (`worker.mission || worker.identity.description`). A real customer
 * answer, clipped to stay usable as a query, beats a generic
 * boilerplate sentence for both purposes. Falls back to a generic
 * mission only if the customer left every "business" field blank. */
export function deriveMissionSeed(product: ProductTemplate, answers: OnboardingAnswers): string {
  const businessField = product.onboarding.find((f) => f.bucket === "business")
  const answer = businessField ? answers[businessField.key]?.trim() : ""
  if (!answer) return `Operate as this organization's ${product.name} worker.`
  const firstSentence = answer.split(/(?<=[.!?])\s/)[0] || answer
  return firstSentence.length > 200 ? `${firstSentence.slice(0, 200)}…` : firstSentence
}

/** A short, human-readable summary for display (Studio, the onboarding
 * confirmation screen) — real answers only, never invented. */
export function summarizeAnswers(product: ProductTemplate, answers: OnboardingAnswers): { label: string; value: string }[] {
  return product.onboarding
    .map((f) => ({ label: f.label, value: answers[f.key]?.trim() ?? "" }))
    .filter((f) => f.value)
}

/** Derives 0-2 real, product-specific heuristics (IF/THEN behavior
 * rules — the existing, already-wired BehaviorRule mechanism) directly
 * from the customer's own "rules" bucket answer. This is what makes
 * "Experience/Heuristics" tailor-made rather than a generic preset:
 * the condition/action text is built from what THIS customer actually
 * wrote, not a canned rule every worker gets. Returns [] if the
 * customer left "rules" blank — never fabricates one. */
export function deriveHeuristics(product: ProductTemplate, answers: OnboardingAnswers): { condition: string; action: string }[] {
  const rulesFields = product.onboarding.filter((f) => f.bucket === "rules")
  const heuristics: { condition: string; action: string }[] = []
  for (const field of rulesFields) {
    const value = answers[field.key]?.trim()
    if (!value) continue
    // The operator's own constraint text, verbatim, wrapped as a real
    // behavior rule the runtime already enforces via buildSystemPrompt()
    // in every skill (trend-research.ts, lead-qualification.ts, etc.)
    heuristics.push({
      condition: DERIVED_HEURISTIC_CONDITION,
      action: value.length > 240 ? `${value.slice(0, 240)}…` : value,
    })
  }
  return heuristics
}
