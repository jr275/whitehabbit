/* ================================================================== *
 * DECISION ENGINE (§4, ADR-032) — a pure, deterministic function
 * mapping a real Observation (or a real Recommendation) to a real,
 * explainable Decision. "AI decided this" is never an accepted
 * justification: every proposal states its own reason, real evidence
 * ids, a plain-language expected impact, a real (if rough) cost
 * estimate, a named risk level, and the confidence the Observation
 * itself carried — never invented here.
 * ================================================================== */

import type { DecisionAction, DecisionRisk, EstimatedCost } from "./decisions"

export interface DecisionContext {
  observationPattern: string
  observationSummary: string
  observationConfidence: number
  signalIds: string[]
  /** true if a page already exists for the subject this observation is
   * about — changes CREATE_PAGE into UPDATE_PAGE/MERGE_PAGES so the
   * engine never proposes creating a duplicate. */
  existingPageId?: string | null
}

export interface DecisionProposal {
  action: DecisionAction
  reason: string
  evidenceIds: string[]
  expectedImpact: string
  estimatedCost: EstimatedCost
  risk: DecisionRisk
  confidence: number
  priority: "critical" | "high" | "normal" | "low"
  recommendedAgent: string | null
  requiredApproval: boolean
}

/** Real, rough cost estimates per action — a deterministic table, not
 * a claim of precise cost. Every action this engine can propose has a
 * real entry; an action with no entry would be a bug (caught by
 * TypeScript's exhaustiveness, not a runtime fallback). */
const COST_BY_ACTION: Record<DecisionAction, EstimatedCost> = {
  CREATE_PAGE: { agentSteps: 7, tokens: 3000 },
  UPDATE_PAGE: { agentSteps: 5, tokens: 2000 },
  MERGE_PAGES: { agentSteps: 3, tokens: 500 },
  REDIRECT_PAGE: { agentSteps: 1 },
  ADD_INTERNAL_LINKS: { agentSteps: 1 },
  CREATE_HUB: { agentSteps: 9, tokens: 4000 },
  CREATE_DATASET: { agentSteps: 4 },
  CREATE_CALCULATOR: { agentSteps: 6, tokens: 1500 },
  CREATE_COMPARISON: { agentSteps: 7, tokens: 3000 },
  CREATE_FAQ: { agentSteps: 5, tokens: 1500 },
  REFRESH_CONTENT: { agentSteps: 4, tokens: 1500 },
  INVESTIGATE_ENTITY: { agentSteps: 1 },
  EXPAND_MARKET: { agentSteps: 2 },
  EXPAND_ROLE: { agentSteps: 2 },
  MONITOR: {},
  DO_NOTHING: {},
}

const RISK_BY_ACTION: Record<DecisionAction, DecisionRisk> = {
  CREATE_PAGE: "medium",
  UPDATE_PAGE: "medium",
  MERGE_PAGES: "high", // real risk: can change/break existing published URLs
  REDIRECT_PAGE: "high", // same
  ADD_INTERNAL_LINKS: "low",
  CREATE_HUB: "medium",
  CREATE_DATASET: "low",
  CREATE_CALCULATOR: "medium",
  CREATE_COMPARISON: "medium",
  CREATE_FAQ: "low",
  REFRESH_CONTENT: "medium",
  INVESTIGATE_ENTITY: "low",
  EXPAND_MARKET: "low",
  EXPAND_ROLE: "low",
  MONITOR: "low",
  DO_NOTHING: "low",
}

/** Real approval requirement per action — mirrors the same "never let
 * the system decide its own permission" discipline as
 * lib/workflow/autonomy.ts: any action that publishes, merges, or
 * redirects real, live content always requires a human; a read-only
 * investigation never does. */
const REQUIRES_APPROVAL: Record<DecisionAction, boolean> = {
  CREATE_PAGE: true,
  UPDATE_PAGE: true,
  MERGE_PAGES: true,
  REDIRECT_PAGE: true,
  ADD_INTERNAL_LINKS: false,
  CREATE_HUB: true,
  CREATE_DATASET: false,
  CREATE_CALCULATOR: true,
  CREATE_COMPARISON: true,
  CREATE_FAQ: true,
  REFRESH_CONTENT: true,
  INVESTIGATE_ENTITY: false,
  EXPAND_MARKET: false,
  EXPAND_ROLE: false,
  MONITOR: false,
  DO_NOTHING: false,
}

const RECOMMENDED_AGENT: Partial<Record<DecisionAction, string>> = {
  CREATE_PAGE: "ContentGenerationAgent",
  UPDATE_PAGE: "ContentGenerationAgent",
  REFRESH_CONTENT: "ContentGenerationAgent",
  CREATE_HUB: "ContentGenerationAgent",
  CREATE_COMPARISON: "ContentGenerationAgent",
  CREATE_FAQ: "ContentGenerationAgent",
  ADD_INTERNAL_LINKS: "PublisherAgent",
  INVESTIGATE_ENTITY: "WebsiteDiscoveryAgent",
  CREATE_DATASET: "DataIngestionAgent",
}

function priorityFor(confidence: number, pattern: string): DecisionProposal["priority"] {
  if (pattern === "high_value_opportunity" && confidence >= 0.8) return "high"
  if (pattern === "content_decay_refresh" && confidence >= 0.75) return "high"
  if (confidence >= 0.85) return "high"
  if (confidence < 0.4) return "low"
  return "normal"
}

/** Maps each real Correlation Engine pattern to a real proposed
 * action. A pattern with no mapping proposes MONITOR — never a guess
 * at an action the engine has no real basis to recommend. */
export function proposeDecision(ctx: DecisionContext): DecisionProposal {
  const action = actionForPattern(ctx.observationPattern, !!ctx.existingPageId)
  return {
    action,
    reason: ctx.observationSummary,
    evidenceIds: ctx.signalIds,
    expectedImpact: expectedImpactFor(action, ctx),
    estimatedCost: COST_BY_ACTION[action],
    risk: RISK_BY_ACTION[action],
    confidence: ctx.observationConfidence,
    priority: priorityFor(ctx.observationConfidence, ctx.observationPattern),
    recommendedAgent: RECOMMENDED_AGENT[action] ?? null,
    requiredApproval: REQUIRES_APPROVAL[action],
  }
}

function actionForPattern(pattern: string, hasExistingPage: boolean): DecisionAction {
  switch (pattern) {
    case "high_value_opportunity":
      return hasExistingPage ? "UPDATE_PAGE" : "CREATE_PAGE"
    case "content_decay_refresh":
      return "REFRESH_CONTENT"
    case "internal_link_opportunity":
      return "ADD_INTERNAL_LINKS"
    case "entity_investigation_needed":
      return "INVESTIGATE_ENTITY"
    case "ai_visibility_shift":
      return "MONITOR"
    default:
      return "MONITOR" // an unrecognized pattern is watched, never acted on blindly
  }
}

function expectedImpactFor(action: DecisionAction, ctx: DecisionContext): string {
  switch (action) {
    case "CREATE_PAGE":
      return "A new page targeting a real, currently-uncovered demand signal — expected to capture search traffic this project has no page for today."
    case "UPDATE_PAGE":
      return "Updating the existing page for this subject to reflect newly-observed real demand."
    case "REFRESH_CONTENT":
      return "Refreshing a real, measurably-declining page — expected to recover some of the lost traffic/CTR."
    case "ADD_INTERNAL_LINKS":
      return "Adding real internal links to an under-linked page — expected to improve its crawlability and topical relevance signal."
    case "INVESTIGATE_ENTITY":
      return "No content action yet — this entity needs real research before any page-affecting decision can be made responsibly."
    case "MONITOR":
      return `Watching this real signal (${ctx.observationPattern}) — not yet enough evidence for a content-affecting decision.`
    default:
      return "No action recommended at this time."
  }
}
