/* ================================================================== *
 * BUSINESS EVENTS — derives real BusinessEvent rows from a real,
 * completed WorkerOutput. Called exactly once per completed execution
 * (lib/agent/runtime.ts, right after the output itself is persisted),
 * so one execution can never produce two contradictory business
 * results (section 10) — this function is pure and deterministic
 * over the output it's given.
 *
 * Every event this function returns is grounded in the skill's own
 * real structured output — never invented because a domain "should"
 * have an event. A skill whose output type has no real business
 * event mapping yet (content_analysis, engagement_analysis — both
 * honestly blocked, no real output ever exists to derive from)
 * returns [] : there is nothing to say happened until there is.
 *
 * TAXONOMY (section 6) — real event types this system can produce
 * today, and the domain metric key each summarizes into. This list is
 * open — a new Skill adds a new case here, never a schema change:
 *
 *   Sales           lead_qualified            -> qualified_leads
 *   Marketing       content_opportunity_identified -> content_opportunities_identified
 *   Marketing       page_opportunity_planned  -> page_opportunities_planned
 *   Customer Success ticket_resolved          -> tickets_resolved
 *   Customer Success ticket_escalated         -> escalations
 *   Customer Success ticket_flagged           -> tickets_flagged
 *
 * NOT yet real (need a real Connector Connection this product
 * doesn't have — Connector Foundation Phase 1 is architecture only):
 * opportunity_created, meeting_booked, campaign_published,
 * invoice_processed, cost_saved, customer_retained. These are never
 * fabricated here.
 * ================================================================== */

import type { WorkerOutput } from "./model"

export interface DerivedBusinessEvent {
  type: string
  entityId?: string
  entityType?: string
  numericValue?: number
  confidence?: number
  source: string
  payload: Record<string, unknown>
  /** Which of this output's real MetricEmission keys (skill.metrics())
   * this event is the evidence for — lib/agent/runtime.ts uses this to
   * set MetricRecord.businessEventId, never a second metrics system. */
  relatedMetricKeys: string[]
}

interface LeadItem {
  company: string
  evidence: string
  reasoning: string
  qualified: boolean
  score: number
}
interface TrendItem {
  name: string
  why_it_matters: string
  confidence: number
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

function fromLeadQualification(structured: { leads: LeadItem[] }): DerivedBusinessEvent[] {
  const qualified = (structured.leads ?? []).filter((l) => l.qualified)
  if (qualified.length === 0) return []
  return [
    {
      type: "lead_qualified",
      entityType: "account_batch",
      numericValue: qualified.length,
      confidence: Math.round(qualified.reduce((s, l) => s + l.score, 0) / qualified.length),
      source: "skill:skill_lead_qualification",
      payload: { accounts: qualified.map((l) => ({ company: l.company, score: l.score, evidence: l.evidence, reasoning: l.reasoning })) },
      relatedMetricKeys: ["leads_qualified"],
    },
  ]
}

function fromTrendReport(structured: { trends: TrendItem[] }): DerivedBusinessEvent[] {
  const trends = structured.trends ?? []
  if (trends.length === 0) return []
  return [
    {
      type: "content_opportunity_identified",
      entityType: "trend_batch",
      numericValue: trends.length,
      confidence: Math.round(trends.reduce((s, t) => s + (t.confidence ?? 0), 0) / trends.length),
      source: "skill:skill_trend_research",
      payload: { trends: trends.map((t) => ({ name: t.name, why_it_matters: t.why_it_matters, confidence: t.confidence })) },
      relatedMetricKeys: ["trends_identified"],
    },
  ]
}

function fromSeoOpportunity(structured: { opportunities: SeoOpportunityItem[] }): DerivedBusinessEvent[] {
  const opportunities = structured.opportunities ?? []
  if (opportunities.length === 0) return []
  return [
    {
      type: "page_opportunity_planned",
      entityType: "page_opportunity_batch",
      numericValue: opportunities.length,
      confidence: Math.round(opportunities.reduce((s, o) => s + (o.confidence ?? 0), 0) / opportunities.length),
      source: "skill:skill_seo_opportunity",
      payload: { opportunities: opportunities.map((o) => ({ topic: o.topic, title: o.suggested_title, intent: o.target_intent, confidence: o.confidence })) },
      relatedMetricKeys: ["opportunities_identified"],
    },
  ]
}

const CONVERSATION_EVENT_TYPE: Record<ConversationPayload["action"], string> = {
  answered: "ticket_resolved",
  escalated: "ticket_escalated",
  flagged_for_review: "ticket_flagged",
}

function fromConversation(structured: ConversationPayload): DerivedBusinessEvent[] {
  return [
    {
      type: CONVERSATION_EVENT_TYPE[structured.action],
      entityType: "conversation",
      numericValue: 1,
      source: "skill:skill_customer_conversation",
      payload: { action: structured.action, reasoning_summary: structured.reasoning_summary },
      relatedMetricKeys: ["escalated"],
    },
  ]
}

/** Returns [] when there's genuinely no real business event to
 * record — a failed/blocked execution, or a skill whose output type
 * has no mapping yet. Never guesses. */
export function deriveBusinessEvents(output: WorkerOutput): DerivedBusinessEvent[] {
  if (output.status === "failed" || !output.structured) return []
  switch (output.type) {
    case "lead_qualification":
      return fromLeadQualification(output.structured as { leads: LeadItem[] })
    case "trend_report":
      return fromTrendReport(output.structured as { trends: TrendItem[] })
    case "seo_opportunity_plan":
      return fromSeoOpportunity(output.structured as { opportunities: SeoOpportunityItem[] })
    case "conversation_response":
      return fromConversation(output.structured as ConversationPayload)
    default:
      return []
  }
}

/** Reference taxonomy per Super Agent domain (section 6) — which
 * metric keys THIS deployment can actually produce today (backed by
 * a real Skill above) vs. which are architecturally anticipated but
 * need a real data connection this product doesn't have yet. Used by
 * the Business Impact dashboard to render an honest "not yet
 * connected" row instead of omitting the metric silently. */
export interface DomainMetricDef {
  key: string
  label: string
  real: boolean
}

export const DOMAIN_METRIC_TAXONOMY: Record<string, DomainMetricDef[]> = {
  sales: [
    { key: "leads_qualified", label: "Qualified leads", real: true },
    { key: "candidates_researched", label: "Candidates researched", real: true },
    { key: "pipeline_influenced", label: "Pipeline influenced", real: false },
    { key: "meetings_booked", label: "Meetings booked", real: false },
    { key: "opportunities_created", label: "Opportunities created", real: false },
    { key: "revenue_influenced", label: "Revenue influenced", real: false },
  ],
  marketing: [
    { key: "trends_identified", label: "Content opportunities identified", real: true },
    { key: "opportunities_identified", label: "Page opportunities planned", real: true },
    { key: "leads_generated", label: "Leads generated", real: false },
    { key: "campaign_revenue", label: "Campaign revenue", real: false },
    { key: "cac", label: "CAC", real: false },
    { key: "engagement", label: "Engagement", real: false },
  ],
  customer_success: [
    { key: "escalated", label: "Escalated to human", real: true },
    { key: "conversation_quality", label: "Response quality", real: true },
    { key: "tickets_resolved", label: "Tickets resolved", real: false },
    { key: "resolution_time", label: "Resolution time", real: false },
    { key: "csat", label: "CSAT", real: false },
    { key: "retention", label: "Retention", real: false },
  ],
  operations: [
    { key: "tasks_automated", label: "Tasks automated", real: false },
    { key: "hours_saved", label: "Hours saved", real: false },
    { key: "errors_avoided", label: "Errors avoided", real: false },
    { key: "cost_saved", label: "Cost saved", real: false },
  ],
  finance: [
    { key: "invoices_processed", label: "Invoices processed", real: false },
    { key: "cash_recovered", label: "Cash recovered", real: false },
    { key: "reconciliation_accuracy", label: "Reconciliation accuracy", real: false },
  ],
}
