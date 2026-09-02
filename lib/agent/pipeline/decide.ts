import "server-only"

/* ================================================================== *
 * DETERMINISTIC DECISION ENGINE — section 5. Runs AFTER the LLM,
 * exactly the deterministic thresholds the spec names. The LLM's
 * leadScore is an input to this policy, never the decision itself —
 * this function is the only place that decides whether a real,
 * external, possibly-destructive action is even attempted.
 * ================================================================== */

import type { Decision, LlmScoreResult, PipelineObjective } from "./types"

const HIGH_PRIORITY_THRESHOLD = 80
const REVIEW_THRESHOLD = 60

export function decide(score: LlmScoreResult, objective: PipelineObjective): Decision {
  const wantsUpdate = objective.requestedActions.length === 0 || objective.requestedActions.some((a) => /update|crm|salesforce/i.test(a))
  const wantsNotify = objective.requestedActions.length === 0 || objective.requestedActions.some((a) => /slack|notify/i.test(a))

  if (score.leadScore >= HIGH_PRIORITY_THRESHOLD) {
    return {
      candidateId: score.id,
      tier: "high_priority",
      action: wantsUpdate && wantsNotify ? "update_lead_and_notify" : wantsUpdate ? "update_lead_only" : "no_action",
      reason: `Lead score ${score.leadScore} >= ${HIGH_PRIORITY_THRESHOLD} — HIGH PRIORITY.`,
    }
  }
  if (score.leadScore >= REVIEW_THRESHOLD) {
    return {
      candidateId: score.id,
      tier: "review",
      action: wantsUpdate ? "update_lead_only" : "no_action",
      reason: `Lead score ${score.leadScore} in [${REVIEW_THRESHOLD}, ${HIGH_PRIORITY_THRESHOLD}) — REVIEW: record the finding, do not notify.`,
    }
  }
  return {
    candidateId: score.id,
    tier: "low_priority",
    action: "no_action",
    reason: `Lead score ${score.leadScore} < ${REVIEW_THRESHOLD} — LOW PRIORITY: no CRM write, no notification.`,
  }
}
