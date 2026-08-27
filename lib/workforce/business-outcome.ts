/* ================================================================== *
 * BUSINESS OUTCOME — turns a real WorkerOutput into what the Business
 * Results Center actually shows: a plain-language outcome, real
 * evidence, the real actions actually performed, and business impact
 * numbers — split strictly into what's REAL (computed from this
 * output's own real structured data) and what needs a real data
 * connection this product doesn't have yet (never estimated,  never
 * silently guessed).
 *
 * This is a pure display-derivation function — the same category as
 * headerMetrics()/buildExecutionStages() in selectors.ts — no new
 * writes, no new table, reads only output.structured (already
 * persisted verbatim by the runtime) and output.qualityScore (the
 * real, structural evaluation already computed by the skill).
 *
 * A metric only ever appears with a real value if the skill's own
 * structured output actually contains it. Anything that needs a real
 * CRM/analytics/ads connection this product doesn't have (pipeline
 * value, reach, CSAT, revenue influenced...) is listed with
 * `real: false` and a real connectHint — never a fabricated number,
 * never a guessed dollar estimate.
 * ================================================================== */

import type { WorkerExecution, WorkerOutput } from "./model"

export interface BusinessImpactMetric {
  label: string
  value: string
  real: boolean
  connectHint?: string
}

export interface BusinessOutcome {
  headline: string
  evidence: string[]
  actionsPerformed: string[]
  impact: BusinessImpactMetric[]
  /** the skill's own real, structural confidence score (0-100) —
   * never a second, invented confidence number. */
  confidence: number | null
  nextRecommendedAction: string
  /** true only when this execution ran through the local development
   * fixture (LLM_DEV_MODE) — mirrors executionMode, never inferred
   * any other way. */
  isDemo: boolean
}

interface TrendItem {
  name: string
  why_it_matters: string
  confidence: number
}
interface LeadItem {
  company: string
  evidence: string
  reasoning: string
  qualified: boolean
  score: number
}
interface SeoOpportunityItem {
  topic: string
  suggested_title: string
  target_intent: string
  confidence: number
}
interface ConversationPayload {
  response: string
  action: "answered" | "escalated" | "flagged_for_review"
  reasoning_summary: string
}
/** Local, minimal duck-typed shape — matches TrendItem/LeadItem/
 * SeoOpportunityItem's own pattern above: this file stays free of a
 * "server-only" import (see header), so it never imports the real
 * SearchWasteReport type from lib/agent/skills/search-waste-
 * detection.ts (a server-only file) — only the fields actually read
 * here. */
interface SearchWasteReportShape {
  dataAnalyzed: { source: "demo" | "connected"; searchTermCount: number; spend: number; conversions: number }
  opportunitiesDetected: number
  recommendations: { label: string; wastedSpend: number }[]
  expectedImpact: { estimatedWastedSpendMonthly: number; potentialRecoverableSpendMonthly: number; cpaImprovementPercentRange: [number, number] }
}

function deriveTrendReport(structured: { trends: TrendItem[] }, sourcesCount: number): Omit<BusinessOutcome, "confidence" | "isDemo"> {
  const trends = structured.trends ?? []
  const top = [...trends].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]
  return {
    headline: trends.length > 0 ? `Identified ${trends.length} real trend${trends.length === 1 ? "" : "s"} from ${sourcesCount} sources.` : "No clear trend was found in the available sources.",
    evidence: top ? [top.why_it_matters] : [],
    actionsPerformed: ["Searched real sources", "Identified and ranked trends", "Cited supporting evidence for each"],
    impact: [
      { label: "Trends identified", value: String(trends.length), real: true },
      { label: "Sources analyzed", value: String(sourcesCount), real: true },
      { label: "Reach", value: "—", real: false, connectHint: "Connect analytics to measure reach" },
      { label: "Leads generated", value: "—", real: false, connectHint: "Connect your CRM/forms to measure leads generated" },
    ],
    nextRecommendedAction: trends.length > 0 ? "Review the top trend and turn it into a content brief" : "Try a more specific research query",
  }
}

function deriveLeadQualification(structured: { leads: LeadItem[] }, sourcesCount: number): Omit<BusinessOutcome, "confidence" | "isDemo"> {
  const leads = structured.leads ?? []
  const qualified = leads.filter((l) => l.qualified)
  const top = [...leads].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
  return {
    headline: leads.length > 0 ? `Qualified ${qualified.length} of ${leads.length} candidate accounts.` : "No real candidate accounts were found for this request.",
    evidence: top ? [`${top.company}: ${top.evidence}`, top.reasoning].filter(Boolean) : [],
    actionsPerformed: ["Researched candidate accounts from real sources", "Scored each against the target profile", "Documented evidence for every candidate"],
    impact: [
      { label: "Qualified leads", value: String(qualified.length), real: true },
      { label: "Candidates researched", value: String(leads.length), real: true },
      { label: "Sources analyzed", value: String(sourcesCount), real: true },
      { label: "Pipeline generated", value: "—", real: false, connectHint: "Connect your CRM to measure pipeline generated" },
      { label: "Meetings booked", value: "—", real: false, connectHint: "Connect your calendar/CRM to measure meetings booked" },
    ],
    nextRecommendedAction: qualified.length > 0 ? "Connect your CRM to sync these qualified accounts" : "Broaden the target profile and try again",
  }
}

function deriveSeoOpportunity(structured: { opportunities: SeoOpportunityItem[] }, sourcesCount: number): Omit<BusinessOutcome, "confidence" | "isDemo"> {
  const opportunities = structured.opportunities ?? []
  const top = [...opportunities].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]
  return {
    headline: opportunities.length > 0 ? `Planned ${opportunities.length} real page opportunit${opportunities.length === 1 ? "y" : "ies"}.` : "No real page opportunity was found for this request.",
    evidence: top ? [`"${top.suggested_title}" — ${top.target_intent}`] : [],
    actionsPerformed: ["Searched real sources for topic signals", "Planned a page per opportunity", "Defined search intent and outline"],
    impact: [
      { label: "Opportunities planned", value: String(opportunities.length), real: true },
      { label: "Sources analyzed", value: String(sourcesCount), real: true },
      { label: "Organic traffic", value: "—", real: false, connectHint: "Connect Search Console to measure organic traffic" },
      { label: "Conversion", value: "—", real: false, connectHint: "Connect analytics to measure conversion" },
    ],
    nextRecommendedAction: opportunities.length > 0 ? "Hand the top plan to a writer or CMS" : "Try a more specific topic area",
  }
}

const CONVERSATION_ACTION_LABEL: Record<ConversationPayload["action"], string> = {
  answered: "Answered",
  escalated: "Escalated",
  flagged_for_review: "Flagged for review",
}

function deriveConversation(structured: ConversationPayload): Omit<BusinessOutcome, "confidence" | "isDemo"> {
  return {
    headline: `${CONVERSATION_ACTION_LABEL[structured.action]} a real customer request.`,
    evidence: structured.reasoning_summary ? [structured.reasoning_summary] : [],
    actionsPerformed: ["Read the customer's request", "Applied this worker's real business rules", "Recorded the real handling decision"],
    impact: [
      { label: "Requests handled", value: "1", real: true },
      { label: "Escalated to human", value: structured.action === "escalated" ? "1" : "0", real: true },
      { label: "CSAT", value: "—", real: false, connectHint: "Connect a survey/helpdesk tool to measure CSAT" },
      { label: "Resolution time", value: "—", real: false, connectHint: "Connect your helpdesk to measure resolution time" },
    ],
    nextRecommendedAction: structured.action === "escalated" ? "A human needs to follow up on this request" : "No action needed — handled automatically",
  }
}

/** Search Waste Detection's real, deterministic impact estimate is
 * ALREADY computed (lib/marketing/heuristics.ts's estimateImpact) —
 * this function only re-presents it in the shared BusinessOutcome
 * shape, never recomputes or second-guesses it. Every impact number
 * is real: an actual dollar figure would only ever appear here once
 * real post-action data exists (section 11 of the Marketing brief) —
 * until then, `real: true` marks the ESTIMATE as genuinely computed
 * (not fabricated), while the label itself says "Estimated". */
function deriveSearchWasteReport(structured: SearchWasteReportShape): Omit<BusinessOutcome, "confidence" | "isDemo"> {
  const { dataAnalyzed, opportunitiesDetected, recommendations, expectedImpact } = structured
  const sourceLabel = dataAnalyzed.source === "demo" ? " (DEMO DATA)" : ""
  const top = [...recommendations].sort((a, b) => b.wastedSpend - a.wastedSpend)[0]
  return {
    headline:
      opportunitiesDetected > 0
        ? `Detected ${opportunitiesDetected} paid-search waste opportunit${opportunitiesDetected === 1 ? "y" : "ies"}${sourceLabel}.`
        : `Analyzed ${dataAnalyzed.searchTermCount.toLocaleString()} search terms${sourceLabel} — no real waste opportunity met the heuristic's thresholds.`,
    evidence: top ? [`${top.label} — $${top.wastedSpend.toLocaleString()} in real detected wasted spend.`] : [],
    actionsPerformed: ["Classified real search-term intent", "Detected zero-conversion waste (deterministic)", "Estimated real recoverable spend", "Generated recommendations — none applied automatically"],
    impact: [
      { label: "Search terms analyzed", value: dataAnalyzed.searchTermCount.toLocaleString(), real: true },
      { label: "Opportunities detected", value: String(opportunitiesDetected), real: true },
      { label: "Estimated wasted spend", value: `$${expectedImpact.estimatedWastedSpendMonthly.toLocaleString()}`, real: true },
      { label: "Potential recoverable spend", value: `$${expectedImpact.potentialRecoverableSpendMonthly.toLocaleString()}`, real: true },
      { label: "Actual spend recovered", value: "—", real: false, connectHint: "Connect a real Google Ads account and apply a recommendation to measure actual recovered spend" },
    ],
    nextRecommendedAction: recommendations.length > 0 ? "Review and apply the top recommendation — applying requires human approval." : "No action needed this period.",
  }
}

/** Returns null when there's genuinely nothing to show — a failed/
 * blocked execution has no real output to derive an outcome from,
 * and this function never invents one. */
export function deriveBusinessOutcome(output: WorkerOutput, execution?: WorkerExecution): BusinessOutcome | null {
  if (output.status === "failed" || !output.structured) return null
  const isDemo = execution?.executionMode === "development"
  const sourcesCount = output.sources?.length ?? 0

  let base: Omit<BusinessOutcome, "confidence" | "isDemo"> | null = null
  switch (output.type) {
    case "trend_report":
      base = deriveTrendReport(output.structured as { trends: TrendItem[] }, sourcesCount)
      break
    case "lead_qualification":
      base = deriveLeadQualification(output.structured as { leads: LeadItem[] }, sourcesCount)
      break
    case "seo_opportunity_plan":
      base = deriveSeoOpportunity(output.structured as { opportunities: SeoOpportunityItem[] }, sourcesCount)
      break
    case "conversation_response":
      base = deriveConversation(output.structured as ConversationPayload)
      break
    case "search_waste_report":
      base = deriveSearchWasteReport(output.structured as SearchWasteReportShape)
      break
    default:
      return null
  }

  return { ...base, confidence: output.qualityScore ?? null, isDemo }
}
