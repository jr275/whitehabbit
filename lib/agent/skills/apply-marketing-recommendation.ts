import "server-only"

/* ================================================================== *
 * SKILL: APPLY MARKETING RECOMMENDATION — the real, separate, always-
 * gated action a Search Waste Optimization Report's recommendations
 * point at (Recommendation.applyActionId/applyInput,
 * lib/agent/skills/search-waste-detection.ts).
 *
 * Deliberately its own skill, not folded into Search Waste Detection's
 * execute(): the analysis is read-only and always completes; APPLYING
 * one specific recommendation is a separate, high-risk write action —
 * every real call here goes through tool_marketing_actions
 * (lib/agent/tools/marketing-actions.ts), whose actions are all
 * permission: "write"/"financial", riskLevel: "high" — so
 * runToolAction() (lib/agent/tool-runner.ts) ALWAYS throws
 * ApprovalRequiredError here, exactly once, before anything runs. This
 * skill implements no resume(): per SkillDefinition's own documented
 * fallback, Approve runs the one captured action in isolation via
 * POST /api/approvals/[id]/decide — the same honest mechanism every
 * other non-resumable skill in this codebase already relies on.
 * ================================================================== */

import { runToolAction } from "@/lib/agent/tool-runner"
import type { SkillDefinition, SkillEvaluation, SkillExecutionResult } from "@/lib/agent/types"
import { SkillBlockedError } from "@/lib/agent/types"
import type { MarketingActionResult } from "@/lib/agent/tools/marketing-actions"

const APPLY_ACTION_IDS = ["add_negative_keyword", "review_targeting", "adjust_budget", "pause_campaign", "change_targeting"] as const
type ApplyActionId = (typeof APPLY_ACTION_IDS)[number]

/* "review_targeting" has no dedicated Marketing Actions tool action —
 * it maps onto the closest real write action (change_targeting), so
 * every recommendation type resolves to a real, gated ToolAction. */
const ACTION_ID_MAP: Record<ApplyActionId, string> = {
  add_negative_keyword: "add_negative_keyword",
  review_targeting: "change_targeting",
  adjust_budget: "adjust_budget",
  pause_campaign: "pause_campaign",
  change_targeting: "change_targeting",
}

export interface ApplyRecommendationResult {
  actionApplied: string
  opportunityId?: string
  result: MarketingActionResult
}

export const applyMarketingRecommendationSkill: SkillDefinition = {
  id: "skill_apply_marketing_recommendation",
  name: "Apply Marketing Recommendation",
  description: "Applies exactly one marketing recommendation (negative keyword, budget, pause, targeting) — always requires human approval before it runs.",
  category: "marketing",
  outputType: "marketing_recommendation_result",
  taskTitle: "Apply a marketing recommendation",
  inputs: [
    { key: "applyActionId", label: "Action (add_negative_keyword | review_targeting | adjust_budget | pause_campaign | change_targeting)", type: "text", required: true, placeholder: "add_negative_keyword" },
    { key: "opportunityId", label: "Opportunity id (from the Search Waste Optimization Report)", type: "text", required: false },
    { key: "matchedTerms", label: "Matched search terms — comma-separated (optional)", type: "text", required: false },
    { key: "suggestedNegativeKeywords", label: "Suggested negative keywords — comma-separated (optional)", type: "text", required: false },
  ],
  requiredTools: ["tool_marketing_actions"],
  instructions: "Applies exactly one already-recommended marketing action. Never invents a new recommendation — the input must come from a real Search Waste Optimization Report.",
  constraints: ["Never applies more than one action per execution.", "Always requires human approval — this skill never has an integrations override that could bypass it."],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const requested = ctx.input.applyActionId?.trim() as ApplyActionId
    if (!APPLY_ACTION_IDS.includes(requested)) {
      throw new Error(`"${ctx.input.applyActionId}" is not a real applyActionId. Must be one of: ${APPLY_ACTION_IDS.join(", ")}.`)
    }
    const toolActionId = ACTION_ID_MAP[requested]

    const tool = ctx.tools.get("tool_marketing_actions")
    if (!tool) throw new SkillBlockedError("Marketing Actions tool is not registered on this worker.")
    const action = tool.actions.find((a) => a.id === toolActionId)
    if (!action) throw new Error(`Marketing Actions tool has no "${toolActionId}" action.`)

    const input = {
      opportunityId: ctx.input.opportunityId || undefined,
      matchedTerms: (ctx.input.matchedTerms ?? "").split(",").map((t) => t.trim()).filter(Boolean),
      suggestedNegativeKeywords: (ctx.input.suggestedNegativeKeywords ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    }

    ctx.emit("tool_called", { tool: tool.id, toolName: tool.name, action: toolActionId, input })
    // This is the real, single approval-gate call — runToolAction()
    // throws ApprovalRequiredError here (both actions are declared
    // high-risk) before action.run() ever executes. No try/catch: an
    // ApprovalRequiredError must propagate all the way out of
    // execute() so the runtime creates a real, persisted Approval row
    // — swallowing it here would silently skip the gate.
    const result = await runToolAction<MarketingActionResult>(tool.id, tool.name, action, input, { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit })
    ctx.emit("tool_completed", { tool: tool.id, durationMs: result.durationMs, ok: result.ok })

    if (!result.ok || !result.data) throw new Error(result.error ?? "Applying the recommendation failed.")

    const payload: ApplyRecommendationResult = { actionApplied: toolActionId, opportunityId: ctx.input.opportunityId, result: result.data }
    return {
      structured: payload,
      summary: result.data.note,
      sources: [],
    }
  },

  evaluate: (result): SkillEvaluation => {
    const payload = result.structured as ApplyRecommendationResult
    // "action correctness" (product brief section 12) — the one real,
    // structural check available for a single-action skill: did the
    // real tool action that was declared get the one that actually ran.
    const actionCorrect = !!payload.actionApplied
    return {
      qualityScore: actionCorrect ? 100 : 0,
      breakdown: [{ label: "Action correctness", score: actionCorrect ? 100 : 0, note: actionCorrect ? `Applied "${payload.actionApplied}" exactly as approved.` : "No action was recorded." }],
    }
  },

  metrics: (result) => {
    const payload = result.structured as ApplyRecommendationResult
    return [{ key: "marketing_action_applied", kind: "operational", value: payload.result.applied ? 1 : 0 }]
  },
}
