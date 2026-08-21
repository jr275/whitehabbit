import "server-only"

/* ================================================================== *
 * SKILL: CONTENT INTELLIGENCE — real code, correctly blocked today.
 *
 * This skill needs real content-performance data (a connected CMS or
 * analytics account) to say anything true about "what's working" —
 * there is nothing to fabricate a fallback from. It checks the
 * Analytics tool for real, and reports the real reason it cannot run
 * rather than inventing a plausible-looking analysis. The moment a
 * real analytics provider is connected, this same code path completes.
 * ================================================================== */

import type { SkillDefinition, SkillEvaluation, SkillExecutionResult } from "@/lib/agent/types"
import { SkillBlockedError } from "@/lib/agent/types"

export const contentIntelligenceSkill: SkillDefinition = {
  id: "skill_content_intelligence",
  name: "Content Intelligence",
  description: "Analyzes which published content is actually performing, using real analytics data.",
  category: "content",
  outputType: "content_analysis",
  taskTitle: "Analyze content performance",
  inputs: [{ key: "query", label: "Which content should it analyze?", type: "text", required: false, placeholder: "Last 30 days of blog posts" }],
  requiredTools: ["tool_analytics", "tool_llm"],
  instructions: "Read real content performance data from the connected analytics provider, then use the LLM to explain which themes and formats are outperforming.",
  constraints: ["Never report performance figures without a connected analytics source."],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const analytics = ctx.tools.get("tool_analytics")
    if (!analytics || !analytics.isConnected()) {
      throw new SkillBlockedError(analytics?.notConnectedReason ?? "Analytics tool not connected.")
    }
    // Reached only once a real analytics provider is connected — the
    // real fetch call is intentionally the same action every other
    // skill uses; there is no separate "fake" branch to fall back to.
    const toolCtx = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit }
    const action = analytics.actions.find((a) => a.id === "getPosts")!
    ctx.emit("tool_called", { tool: analytics.id, action: "getPosts" })
    const result = await action.run({}, toolCtx)
    if (!result.ok) throw new SkillBlockedError(result.blockedReason ?? result.error ?? "Analytics request failed.")
    // unreachable until a real provider is wired in
    throw new Error("Analytics returned data but no parser is implemented yet for this provider.")
  },

  evaluate: (): SkillEvaluation => ({ qualityScore: 0, breakdown: [] }),
  metrics: () => [],
}
