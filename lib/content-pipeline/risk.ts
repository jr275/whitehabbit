/* ================================================================== *
 * CONTENT RISK CLASSIFICATION (§25, autonomy input) — a real, simple,
 * deterministic keyword classifier flagging the regulated-topic
 * categories the brief names explicitly (legal, medical, financial,
 * safety-critical). Never claims "critical" without a real, named
 * signal — this classifier only ever returns "low" or "medium",
 * honestly documented as a first, coarse pass (see
 * docs/architecture/risks.md); "high"/"critical" are reserved for a
 * real future classifier with more signal than keyword matching.
 * ================================================================== */

import type { DraftArtifact } from "./model"

export type RiskLevel = "low" | "medium" | "high" | "critical"

const REGULATED_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(diagnos(is|e|ed)|treatment|medical advice|prescri(be|ption))\b/i, label: "medical" },
  { pattern: /\b(legal advice|lawsuit|sue|liability waiver)\b/i, label: "legal" },
  { pattern: /\b(guarantee[sd]? returns?|investment advice|financial advice)\b/i, label: "financial" },
  { pattern: /\b(safety[- ]critical|life[- ]threatening|emergency evacuation)\b/i, label: "safety" },
]

export function classifyContentRisk(draft: DraftArtifact): { riskLevel: RiskLevel; matchedLabels: string[] } {
  const text = `${draft.title} ${draft.metaDescription} ${draft.sections.map((s) => `${s.heading} ${s.body}`).join(" ")}`
  const matchedLabels = REGULATED_PATTERNS.filter((r) => r.pattern.test(text)).map((r) => r.label)
  return { riskLevel: matchedLabels.length > 0 ? "medium" : "low", matchedLabels }
}
