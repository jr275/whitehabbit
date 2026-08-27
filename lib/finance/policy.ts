/* ================================================================== *
 * POLICY ENGINE (§18) — minimal, real evaluation. NOT a general policy
 * language: a small, fixed set of guardrails matching the examples the
 * Worker Studio already shows as Policies (Condition -> Outcome).
 *
 * evaluatePolicy() is a pure function over a ProposedAction and a list
 * of Policy predicates — it never reads frontend/session state, so a
 * client can never talk its way past a policy by lying about context
 * (§18: "Never infer authorization from frontend state").
 * ================================================================== */

import type { Policy, PolicyDecisionStatus, PolicyEvaluationResult, ProposedAction } from "./types"

/** The default financial guardrails this engine ships with (§18's own
 * examples). A real Worker's `behaviors` (BehaviorRule[], free-text
 * Condition->Action) remain the Studio's separate, operator-authored
 * display layer — these are additive, structured, and evaluated for
 * real; the two are never conflated. */
export const DEFAULT_FINANCIAL_POLICIES: Policy[] = [
  {
    id: "policy_amount_100k",
    description: "Actions over $100,000 require Finance Manager approval.",
    matches: (a) => a.amount > 100_000 && a.amount <= 1_000_000,
    outcome: "APPROVAL_REQUIRED",
    requiredApprover: "Finance Manager",
    reason: "Proposed amount exceeds $100,000.",
  },
  {
    id: "policy_amount_1m",
    description: "Actions over $1,000,000 require CFO approval.",
    matches: (a) => a.amount > 1_000_000,
    outcome: "APPROVAL_REQUIRED",
    requiredApprover: "CFO",
    reason: "Proposed amount exceeds $1,000,000.",
  },
  {
    id: "policy_new_counterparty",
    description: "Actions involving a new counterparty require Controller approval.",
    matches: (a) => a.isNewCounterparty,
    outcome: "APPROVAL_REQUIRED",
    requiredApprover: "Controller",
    reason: "The counterparty has no prior relationship on record.",
  },
  {
    id: "policy_high_risk_autonomous",
    description: "High or critical-risk actions may never execute autonomously.",
    matches: (a) => a.risk === "high" || a.risk === "critical",
    outcome: "BLOCKED",
    reason: "Action risk tier is high/critical — autonomous execution is prohibited regardless of autonomy level.",
  },
]

const STATUS_RANK: Record<PolicyDecisionStatus, number> = { ALLOWED: 0, APPROVAL_REQUIRED: 1, BLOCKED: 2 }

/** Evaluates one proposed action against a list of policies. The most
 * restrictive matched outcome wins (BLOCKED > APPROVAL_REQUIRED >
 * ALLOWED) — a policy can only ever make an action MORE restricted,
 * never less. */
export function evaluatePolicy(action: ProposedAction, policies: Policy[] = DEFAULT_FINANCIAL_POLICIES): PolicyEvaluationResult {
  const matched = policies.filter((p) => p.matches(action))
  if (matched.length === 0) {
    return { status: "ALLOWED", matchedPolicies: [], reasons: [] }
  }
  const worst = matched.reduce((acc, p) => (STATUS_RANK[p.outcome] > STATUS_RANK[acc.outcome] ? p : acc), matched[0])
  return {
    status: worst.outcome,
    matchedPolicies: matched.map((p) => p.id),
    requiredApprover: matched.find((p) => p.requiredApprover)?.requiredApprover,
    reasons: matched.map((p) => p.reason),
  }
}
