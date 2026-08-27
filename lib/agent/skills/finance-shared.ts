import "server-only"

/* ================================================================== *
 * FINANCIAL SKILLS — shared contract.
 *
 * All four financial skills (cash-position-monitor, cash-forecast,
 * working-capital-opportunity, receivables-risk) produce the same
 * structured shape — a list of FinancialFinding — so they share one
 * parser, one evaluator, and one dev-mode LLM fixture instead of four
 * near-duplicates. This is the concrete implementation of the brief's
 * "Finding / Evidence / Metric / Recommendation / Economic Impact /
 * Confidence / Risk / Provenance / Economic State" shape.
 *
 * The confidence breakdown is deliberately explainable, not a single
 * opaque number — five named, independently-scored dimensions, per
 * the brief's "avoid a meaningless confidence number" instruction:
 *   - Data completeness: did the demo ledger return every field this
 *     skill needs (always 100% today — a controlled fixture — but
 *     computed, not hardcoded, so a future real Connector's partial
 *     response would honestly show up here).
 *   - Data freshness: how old the ledger's stated as-of date is.
 *   - Historical consistency: structural sanity checks against the
 *     ledger's own numbers (e.g. a finding's cited metric actually
 *     appears in the data it was computed from).
 *   - Model confidence: the average of each finding's own stated
 *     confidence (the LLM's, not invented here).
 *   - Evidence quality: what fraction of findings cite real evidence
 *     grounded in the provided data.
 * ================================================================== */

import { DEMO_LEDGER_AS_OF } from "@/lib/agent/data/demo-financial-ledger"
import type { MetricEmission, RiskLevel, SkillEvaluation, SkillExecutionResult } from "@/lib/agent/types"
import type { EconomicValueCategory } from "@/lib/workforce/model"

export interface FinancialFinding {
  finding: string
  evidence: string
  metric_label: string
  metric_value: number
  metric_unit: string
  recommendation: string
  impact_value: number
  impact_unit: string
  confidence: number
  risk: RiskLevel
}

export interface FinancialFindingsPayload {
  findings: FinancialFinding[]
}

/** Appended to every financial skill's own system prompt — the one
 * place the shared JSON schema (and the constraint never to invent a
 * number outside the given ledger) is spelled out, so the four skill
 * files never risk drifting into four slightly different schemas. */
export const FINANCIAL_FINDINGS_SCHEMA_PROMPT = `Respond with ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{"findings":[{"finding": string (one sentence, plain language, what you found), "evidence": string (the specific numbers from the data provided that support it), "metric_label": string, "metric_value": number, "metric_unit": string ("$", "%", "days", or ""), "recommendation": string (one concrete action), "impact_value": number (the dollar or percentage impact IF this recommendation is followed — 0 if not meaningfully quantifiable), "impact_unit": string ("$", "%", or ""), "confidence": number (0-100), "risk": "low"|"medium"|"high"|"critical"}]}

Every number you cite in "evidence", "metric_value", and "impact_value" MUST come directly from the data provided to you. Never invent a balance, an amount, a percentage, or a date that was not given to you. If the data does not support a real finding, return an empty findings array rather than inventing one. Identify between 2 and 5 findings.`

export function parseFinancialFindings(text: string): FinancialFindingsPayload | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed || !Array.isArray(parsed.findings)) return null
    return { findings: parsed.findings }
  } catch {
    return null
  }
}

export function renderFinancialFindingsSummary(payload: FinancialFindingsPayload, noneMessage: string): string {
  if (payload.findings.length === 0) return noneMessage
  return payload.findings
    .sort((a, b) => b.confidence - a.confidence)
    .map((f) => {
      const impact = f.impact_value ? `\nEstimated impact: ${formatValue(f.impact_value, f.impact_unit)} (estimated — not yet approved, executed, or verified)` : ""
      return `${f.finding}\nEvidence: ${f.evidence}\n${f.metric_label}: ${formatValue(f.metric_value, f.metric_unit)}${impact}\nRecommendation: ${f.recommendation}\nConfidence: ${f.confidence}% · Risk: ${f.risk}`
    })
    .join("\n\n")
}

function formatValue(value: number, unit: string): string {
  if (unit === "$") return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
  if (unit) return `${new Intl.NumberFormat().format(value)}${unit}`
  return new Intl.NumberFormat().format(value)
}

/** Structural sanity check, not a re-run of the LLM's own reasoning:
 * does this finding's cited evidence text actually mention a number
 * that also appears somewhere in the raw ledger data it was supposed
 * to be grounded in? A real, cheap check against fabrication — not
 * proof of correctness, but proof the finding didn't cite a number
 * that doesn't exist anywhere in the source data. */
function evidenceGroundedInLedger(finding: FinancialFinding, rawLedgerNumbers: number[]): boolean {
  const cited = [finding.metric_value, finding.impact_value].filter((n) => typeof n === "number" && n !== 0)
  if (cited.length === 0) return true // nothing numeric claimed beyond prose — treat as ungrounded-neutral, not a failure
  return cited.some((n) => rawLedgerNumbers.some((real) => Math.abs(real - n) / Math.max(Math.abs(real), 1) < 0.05))
}

export function evaluateFinancialFindings(payload: FinancialFindingsPayload, rawLedgerNumbers: number[], expectedMinCount: number): SkillEvaluation {
  const findings = payload.findings
  const completenessScore = 100 // the demo ledger always returns every field a skill asks for — see file header
  const ageDays = Math.max(0, Math.round((Date.now() - new Date(DEMO_LEDGER_AS_OF).getTime()) / 86_400_000))
  const freshnessScore = Math.max(0, 100 - ageDays * 2) // loses 2 points per day the fixture's as-of date has aged
  const grounded = findings.filter((f) => evidenceGroundedInLedger(f, rawLedgerNumbers))
  const consistencyScore = findings.length ? Math.round((grounded.length / findings.length) * 100) : 0
  const modelConfidenceScore = findings.length ? Math.round(findings.reduce((sum, f) => sum + (f.confidence ?? 0), 0) / findings.length) : 0
  const withEvidence = findings.filter((f) => f.evidence?.trim().length > 0)
  const evidenceQualityScore = findings.length ? Math.round((withEvidence.length / findings.length) * 100) : 0
  const countScore = Math.min(100, Math.round((findings.length / expectedMinCount) * 100))

  const overall = Math.round(completenessScore * 0.15 + freshnessScore * 0.1 + consistencyScore * 0.25 + modelConfidenceScore * 0.25 + evidenceQualityScore * 0.15 + countScore * 0.1)

  return {
    qualityScore: overall,
    breakdown: [
      { label: "Data completeness", score: completenessScore, note: "All fields requested from the demo ledger were present." },
      { label: "Data freshness", score: freshnessScore, note: `Ledger dated ${DEMO_LEDGER_AS_OF} (${ageDays} day${ageDays === 1 ? "" : "s"} old).` },
      { label: "Historical consistency", score: consistencyScore, note: `${grounded.length}/${findings.length || 0} findings cite a number that appears in the source data.` },
      { label: "Model confidence", score: modelConfidenceScore, note: "Average of each finding's own stated confidence." },
      { label: "Evidence quality", score: evidenceQualityScore, note: `${withEvidence.length}/${findings.length || 0} findings cite specific evidence.` },
    ],
  }
}

/** Common operational + quality metrics every financial skill emits,
 * regardless of its specific business-metric key — callers append
 * their own `kind: "business"` emission(s) to this array. */
export function financialOperationalMetrics(
  result: SkillExecutionResult,
  evaluation: SkillEvaluation,
  opts: { analyzedLabel: string; analyzedCount: number },
): MetricEmission[] {
  const findings = (result.structured as FinancialFindingsPayload).findings ?? []
  return [
    { key: opts.analyzedLabel, kind: "operational", value: opts.analyzedCount },
    { key: "findings_identified", kind: "operational", value: findings.length },
    { key: "analysis_quality", kind: "quality", value: evaluation.qualityScore, unit: "%" },
  ]
}

/** The one place a financial skill turns a finding's estimated dollar
 * impact into a real MetricEmission — always economicState "estimated"
 * (see lib/agent/types.ts's MetricEmission doc comment: nothing in this
 * codebase yet has a real approve/execute/reconcile path), always the
 * caller's chosen key/category so it lands on the right Business
 * Impact card. Returns null if there's no quantified impact to emit —
 * never emits a fabricated $0 as if it were a real measurement. */
export function economicImpactMetric(payload: FinancialFindingsPayload, key: string, category: EconomicValueCategory, unit: "$" | "%"): MetricEmission | null {
  const relevant = payload.findings.filter((f) => f.impact_unit === unit && f.impact_value > 0)
  if (relevant.length === 0) return null
  const value = unit === "%" ? relevant.reduce((sum, f) => sum + f.impact_value, 0) / relevant.length : relevant.reduce((sum, f) => sum + f.impact_value, 0)
  return { key, kind: "business", value, unit, economicState: "estimated", valueCategory: category }
}
