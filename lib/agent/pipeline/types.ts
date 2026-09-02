import "server-only"

/* ================================================================== *
 * MARKETING LEAD OPERATIONS — shared pipeline types.
 *
 * The real stage sequence (order matters — it is the execution
 * graph): objective_intake -> research -> qualification ->
 * llm_scoring -> decision -> salesforce_action -> slack_notify.
 * ================================================================== */

import type { PipelineObjective, PipelineStageKey, PipelineStageRecord, PipelineState } from "@/lib/workforce/model"

export const STAGE_ORDER: { key: PipelineStageKey; label: string }[] = [
  { key: "objective_intake", label: "Objective intake" },
  { key: "research", label: "Research" },
  { key: "qualification", label: "Qualification" },
  { key: "llm_scoring", label: "LLM scoring" },
  { key: "decision", label: "Decision" },
  { key: "salesforce_action", label: "Salesforce action" },
  { key: "slack_notify", label: "Slack notification" },
]

/** Real research output — see section 2. Every field the source data
 * doesn't actually support stays null; never guessed. */
export interface ResearchCandidate {
  id: string
  company: string
  website: string | null
  industry: string | null
  location: string | null
  employeeRange: string | null
  evidence: string
  source: string
  confidence: number
}

export interface QualificationResult {
  candidateId: string
  qualificationScore: number
  qualificationReasons: string[]
  missingInformation: string[]
  confidence: number
}

export interface LlmScoreResult {
  id: string
  leadScore: number
  qualification: "qualified" | "not_qualified"
  reasoningSummary: string
  recommendedAction: string
}

export type DecisionTier = "high_priority" | "review" | "low_priority"
export type DecisionAction = "update_lead_and_notify" | "update_lead_only" | "no_action"

export interface Decision {
  candidateId: string
  tier: DecisionTier
  action: DecisionAction
  reason: string
}

export interface SalesforceActionOutcome {
  mode: "created" | "updated"
  leadId: string
  fields: Record<string, unknown>
}

export interface SlackNotifyOutcome {
  channel: string
  ts: string
}

/** The skill's real, persisted structured output — what the Outputs
 * Hub and Business Events read. Every candidate below carries the
 * real work done on it; only the single top-ranked candidate (see
 * pickTopCandidate) proceeds through decision/salesforce/slack — an
 * honest, tractable scope for one linear execution graph, not a
 * silent limitation (see the skill's own header comment). */
export interface MarketingLeadOpsPayload {
  objective: PipelineObjective
  candidatesFound: number
  research: ResearchCandidate[]
  qualifications: QualificationResult[]
  scores: LlmScoreResult[]
  decision: Decision | null
  topCandidate: (ResearchCandidate & { qualification?: QualificationResult; score?: LlmScoreResult }) | null
  salesforceAction: (SalesforceActionOutcome & { status: "completed" | "blocked" | "failed" | "waiting_for_approval" | "rejected" | "skipped"; detail?: string }) | null
  slackNotification: (SlackNotifyOutcome & { status: "completed" | "blocked" | "failed" | "waiting_for_approval" | "rejected" | "skipped"; detail?: string }) | null
}

export type { PipelineObjective, PipelineStageKey, PipelineStageRecord, PipelineState }
