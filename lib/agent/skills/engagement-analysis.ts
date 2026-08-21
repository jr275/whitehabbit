import "server-only"

/* ================================================================== *
 * SKILL: ENGAGEMENT ANALYSIS — real code, correctly blocked today.
 *
 * Needs real audience engagement data (Instagram insights via a
 * connected Analytics tool). Same honesty rule as Content Intelligence:
 * report the real block, never a plausible-looking number.
 * ================================================================== */

import type { SkillDefinition, SkillEvaluation, SkillExecutionResult } from "@/lib/agent/types"
import { SkillBlockedError } from "@/lib/agent/types"

export const engagementAnalysisSkill: SkillDefinition = {
  id: "skill_engagement_analysis",
  name: "Engagement Analysis",
  description: "Analyzes real audience engagement (reach, comments, saves) from a connected analytics provider.",
  category: "communication",
  outputType: "engagement_analysis",
  taskTitle: "Analyze engagement",
  inputs: [{ key: "query", label: "What should it look at?", type: "text", required: false, placeholder: "Last week's posts" }],
  requiredTools: ["tool_analytics", "tool_llm"],
  instructions: "Read real engagement data (reach, likes, comments, saves) from the connected analytics provider, then use the LLM to explain what is driving engagement.",
  constraints: ["Never report engagement figures without a connected analytics source."],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const analytics = ctx.tools.get("tool_analytics")
    if (!analytics || !analytics.isConnected()) {
      throw new SkillBlockedError(analytics?.notConnectedReason ?? "Analytics tool not connected.")
    }
    const toolCtx = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit }
    const action = analytics.actions.find((a) => a.id === "getInsights")!
    ctx.emit("tool_called", { tool: analytics.id, action: "getInsights" })
    const result = await action.run({}, toolCtx)
    if (!result.ok) throw new SkillBlockedError(result.blockedReason ?? result.error ?? "Analytics request failed.")
    throw new Error("Analytics returned data but no parser is implemented yet for this provider.")
  },

  evaluate: (): SkillEvaluation => ({ qualityScore: 0, breakdown: [] }),
  metrics: () => [],
}
