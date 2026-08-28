import "server-only"

/* ================================================================== *
 * DECISION -> ACTION PLAN RESOLVER (Phase 7, §2, ADR-038) — a real
 * DecisionActionResolver. Input: a real, approved IntelligenceDecision.
 * Output: a real ActionPlan describing exactly how (or whether) it can
 * actually be executed against this codebase's real, existing
 * capabilities — never a duplicate of the closed DecisionAction
 * taxonomy (lib/intelligence/decisions.ts), only a mapping onto it.
 *
 * `executionPolicy` is the honest core of this resolver:
 *   - "workflow"    -> a real, existing WorkflowPipeline can execute this
 *                      (content_generation, today's only real one)
 *   - "synchronous" -> a real, existing, fast, non-workflow function can
 *                      execute this within one drain tick (internal
 *                      links, Deep Research)
 *   - "noop"        -> the action requires no real execution (MONITOR,
 *                      DO_NOTHING) — a real, honest immediate success
 *   - "blocked"      -> no real execution path exists in this codebase
 *                      yet. Never silently succeeds; never invents one.
 * ================================================================== */

import type { DecisionAction, DecisionPriority, DecisionRisk, EstimatedCost, IntelligenceDecision } from "./decisions"
import type { AgentCapability, AgentType } from "@/lib/workflow/permissions"
import { getPage } from "@/lib/pages/repo"

export type ActionExecutionPolicy = "workflow" | "synchronous" | "noop" | "blocked"
export type ActionPlanStatus = "supported" | "unsupported"

export interface ActionPlan {
  decisionId: string
  orgId: string
  projectId: string
  actionType: DecisionAction
  targetEntityId: string | null
  targetMarketId: string | null
  targetPageId: string | null
  targetOpportunityId: string | null
  agentType: AgentType | null
  workflowType: "content_generation" | null
  priority: DecisionPriority
  riskLevel: DecisionRisk
  requiredCapabilities: AgentCapability[]
  estimatedCost: EstimatedCost
  estimatedDurationMs: number | null
  approvalRequirement: boolean
  executionPolicy: ActionExecutionPolicy
  status: ActionPlanStatus
  unsupportedReason: string | null
}

/* Real, TypeScript-exhaustive per-action-type mapping — every one of
 * the 16 closed DecisionAction values has a real, reviewed entry here.
 * Extending real execution coverage means adding a real function this
 * table points at, never flipping a flag. */
const EXECUTION_POLICY_BY_ACTION: Record<DecisionAction, ActionExecutionPolicy> = {
  CREATE_PAGE: "workflow",
  UPDATE_PAGE: "workflow",
  REFRESH_CONTENT: "workflow",
  CREATE_HUB: "workflow",
  CREATE_COMPARISON: "workflow",
  CREATE_FAQ: "workflow",
  ADD_INTERNAL_LINKS: "synchronous",
  INVESTIGATE_ENTITY: "synchronous",
  MONITOR: "noop",
  DO_NOTHING: "noop",
  MERGE_PAGES: "blocked", // no real page-merge function exists yet
  REDIRECT_PAGE: "blocked", // no real redirect function exists yet
  CREATE_DATASET: "blocked", // ingestDataset() exists but needs a real (dataSource, externalId) the Decision doesn't carry — never guessed
  CREATE_CALCULATOR: "blocked", // no real calculator-generation capability exists — the content pipeline writes prose, not an interactive widget
  EXPAND_MARKET: "blocked", // no real market-expansion workflow exists yet
  EXPAND_ROLE: "blocked", // no real role-expansion workflow exists yet
}

const UNSUPPORTED_REASON: Partial<Record<DecisionAction, string>> = {
  MERGE_PAGES: "No real page-merge execution path exists in this codebase yet.",
  REDIRECT_PAGE: "No real redirect execution path exists in this codebase yet.",
  CREATE_DATASET: "A real dataset-ingestion function exists (lib/intelligence/connectors/repo.ts#ingestDataset) but requires a specific real DataSource + external dataset id this Decision does not carry — never guessed.",
  CREATE_CALCULATOR: "No real calculator/interactive-widget generation capability exists yet — the content pipeline only produces prose.",
  EXPAND_MARKET: "No real market-expansion execution path exists in this codebase yet.",
  EXPAND_ROLE: "No real role-expansion execution path exists in this codebase yet.",
}

const REQUIRED_CAPABILITIES_BY_ACTION: Record<DecisionAction, AgentCapability[]> = {
  CREATE_PAGE: ["write_page_brief", "write_content_draft", "write_page_version"],
  UPDATE_PAGE: ["write_page_brief", "write_content_draft", "write_page_version"],
  REFRESH_CONTENT: ["write_page_brief", "write_content_draft", "write_page_version"],
  CREATE_HUB: ["write_page_brief", "write_content_draft", "write_page_version"],
  CREATE_COMPARISON: ["write_page_brief", "write_content_draft", "write_page_version"],
  CREATE_FAQ: ["write_page_brief", "write_content_draft", "write_page_version"],
  ADD_INTERNAL_LINKS: ["write_internal_links"],
  INVESTIGATE_ENTITY: ["run_research"],
  MONITOR: [],
  DO_NOTHING: [],
  MERGE_PAGES: [],
  REDIRECT_PAGE: [],
  CREATE_DATASET: [],
  CREATE_CALCULATOR: [],
  EXPAND_MARKET: [],
  EXPAND_ROLE: [],
}

const AGENT_TYPE_BY_ACTION: Partial<Record<DecisionAction, AgentType>> = {
  CREATE_PAGE: "ContentGenerationAgent",
  UPDATE_PAGE: "ContentGenerationAgent",
  REFRESH_CONTENT: "ContentGenerationAgent",
  CREATE_HUB: "ContentGenerationAgent",
  CREATE_COMPARISON: "ContentGenerationAgent",
  CREATE_FAQ: "ContentGenerationAgent",
  ADD_INTERNAL_LINKS: "PublisherAgent",
  INVESTIGATE_ENTITY: "WebsiteDiscoveryAgent",
}

/* Real, rough duration estimates (ms) — mirrors the honesty discipline
 * of decision-engine.ts's own EstimatedCost table: a plausible order
 * of magnitude, never a false-precision SLA. Workflow-backed actions
 * are unbounded (depend on real LLM latency) so null is the honest
 * value, not a guess. */
const ESTIMATED_DURATION_MS: Record<DecisionAction, number | null> = {
  CREATE_PAGE: null,
  UPDATE_PAGE: null,
  REFRESH_CONTENT: null,
  CREATE_HUB: null,
  CREATE_COMPARISON: null,
  CREATE_FAQ: null,
  ADD_INTERNAL_LINKS: 2_000,
  INVESTIGATE_ENTITY: 3_000,
  MONITOR: 0,
  DO_NOTHING: 0,
  MERGE_PAGES: null,
  REDIRECT_PAGE: null,
  CREATE_DATASET: null,
  CREATE_CALCULATOR: null,
  EXPAND_MARKET: null,
  EXPAND_ROLE: null,
}

/** The real DecisionActionResolver (§2). Never persisted as its own
 * row — always freshly resolved from the Decision's own real, current
 * fields plus one real lookup (an existing page's linked opportunity)
 * when the subject is a page, so a plan is never stale relative to the
 * real data it describes. */
export async function resolveActionPlan(decision: IntelligenceDecision): Promise<ActionPlan> {
  const executionPolicy = EXECUTION_POLICY_BY_ACTION[decision.action]
  const status: ActionPlanStatus = executionPolicy === "blocked" ? "unsupported" : "supported"

  let targetEntityId: string | null = null
  let targetPageId: string | null = null
  let targetOpportunityId: string | null = null
  const targetMarketId: string | null = null

  if (decision.subjectType === "entity" && decision.subjectId) {
    targetEntityId = decision.subjectId
  } else if (decision.subjectType === "page" && decision.subjectId) {
    targetPageId = decision.subjectId
    const page = await getPage(decision.subjectId, decision.orgId)
    targetOpportunityId = page?.opportunityId ?? null
  } else if (decision.subjectType === "opportunity" && decision.subjectId) {
    targetOpportunityId = decision.subjectId
  }

  return {
    decisionId: decision.id,
    orgId: decision.orgId,
    projectId: decision.projectId,
    actionType: decision.action,
    targetEntityId,
    targetMarketId,
    targetPageId,
    targetOpportunityId,
    agentType: AGENT_TYPE_BY_ACTION[decision.action] ?? null,
    workflowType: executionPolicy === "workflow" ? "content_generation" : null,
    priority: decision.priority,
    riskLevel: decision.risk,
    requiredCapabilities: REQUIRED_CAPABILITIES_BY_ACTION[decision.action],
    estimatedCost: decision.estimatedCost,
    estimatedDurationMs: ESTIMATED_DURATION_MS[decision.action],
    approvalRequirement: decision.requiredApproval,
    executionPolicy,
    status,
    unsupportedReason: UNSUPPORTED_REASON[decision.action] ?? null,
  }
}
