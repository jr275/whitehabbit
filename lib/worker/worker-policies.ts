/* ================================================================== *
 * WORKER POLICIES — real rules that gate execution.
 *
 * Policies are not decoration: they are evaluated by the runtime
 * before an action is taken. A failed policy check produces an
 * APPROVAL_REQUIRED gate instead of silently proceeding.
 * ================================================================== */

import type { Autonomy, Policy, Worker } from "./worker-model"

export interface ActionContext {
  actionType: string // e.g. "outbound_email"
  confidence: number // 0-100
  riskLevel: "low" | "medium" | "high"
}

export interface PolicyDecision {
  requiresApproval: boolean
  reason: string | null
  policyText: string | null
}

/** The confidence floor for outbound actions, derived from policies. */
export function confidenceFloor(worker: Worker): number | null {
  const p = worker.policies.find((x) => x.kind === "confidence_threshold")
  return p?.threshold ?? null
}

/**
 * Decide whether an action may execute autonomously or must pause for a
 * human. This is deterministic and inspectable — the same inputs always
 * produce the same gate.
 */
export function evaluateAction(worker: Worker, ctx: ActionContext): PolicyDecision {
  // 1. explicit confidence-threshold policy on outbound actions
  const floor = confidenceFloor(worker)
  const threshold = worker.policies.find((x) => x.kind === "confidence_threshold")
  if (
    floor != null &&
    ctx.actionType === "outbound_email" &&
    ctx.confidence < floor
  ) {
    return {
      requiresApproval: true,
      reason: `Confidence ${ctx.confidence}% is below the ${floor}% policy floor for outbound email.`,
      policyText: threshold?.text ?? null,
    }
  }

  // 2. autonomy level gating
  const gate = autonomyGate(worker.autonomy, ctx.riskLevel)
  if (gate) {
    return {
      requiresApproval: true,
      reason: gate,
      policyText: `Autonomy is set to ${worker.autonomy.toUpperCase()}.`,
    }
  }

  return { requiresApproval: false, reason: null, policyText: null }
}

/** Autonomy determines which risk levels may run without a human. */
function autonomyGate(autonomy: Autonomy, risk: "low" | "medium" | "high"): string | null {
  if (autonomy === "high") return null // high autonomy runs everything
  if (autonomy === "medium") {
    return risk === "high"
      ? "Medium autonomy pauses high-risk actions for approval."
      : null
  }
  // low autonomy pauses anything that isn't trivially low risk
  return risk === "low"
    ? null
    : "Low autonomy requires approval for any important action."
}

/** Does a policy string look like a confidence-threshold rule? Parse it. */
export function parsePolicy(text: string): Pick<Policy, "kind" | "threshold" | "appliesTo"> {
  const m = text.match(/(\d{1,3})\s*%/)
  const mentionsOutbound = /outbound|email|send/i.test(text)
  const mentionsConfidence = /confiden/i.test(text)
  if (m && (mentionsConfidence || mentionsOutbound)) {
    return {
      kind: "confidence_threshold",
      threshold: Math.min(100, Math.max(0, parseInt(m[1], 10))),
      appliesTo: "outbound_email",
    }
  }
  return { kind: "custom" }
}
