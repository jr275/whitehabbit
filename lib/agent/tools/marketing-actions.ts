import "server-only"

/* ================================================================== *
 * MARKETING ACTIONS TOOL — the real, permission-gated boundary for
 * "apply this marketing recommendation" (negative keyword, budget
 * change, campaign pause, targeting change — section 10's exact
 * examples).
 *
 * Every action here is declared permission: "write" or "financial",
 * riskLevel: "high" — HIGH_RISK_PERMISSIONS (lib/workforce/model.ts)
 * means runToolAction() (lib/agent/tool-runner.ts) ALWAYS throws
 * ApprovalRequiredError before run() executes, exactly like any other
 * high-risk connector action. This is a plain native tool (same
 * pattern as lib/agent/tools/analytics.ts), not a Connector — it
 * needs no external credential to exist, only a human's approval to
 * fire.
 *
 * HONEST SCOPE: there is no real Google Ads/Meta Ads write API in
 * this codebase (lib/marketing/google-ads-data.ts's header explains
 * why). run() never fakes a live ad-account change. Once approved, it
 * performs the one real, honest thing it can: records that a human
 * genuinely authorized this specific action, with this specific
 * input, and reports — truthfully — that no connected ad account
 * exists to apply it to externally yet. This still exercises the real
 * approval gate end-to-end (a real Approval row, a real human
 * decision, a real persisted result) without pretending an external
 * system was touched. The day a real Ads connector exists, only this
 * function's body changes — the gate, the Skill, and the UI do not.
 * ================================================================== */

import { isGoogleAdsConnected } from "@/lib/marketing/google-ads-data"
import type { ToolActionResult, ToolContext, ToolDefinition } from "@/lib/agent/types"

export interface MarketingActionResult {
  applied: boolean
  action: string
  input: Record<string, unknown>
  note: string
}

async function applyIfConnected(actionLabel: string, input: Record<string, unknown>): Promise<ToolActionResult<MarketingActionResult>> {
  const started = Date.now()
  if (isGoogleAdsConnected()) {
    // See file header — unreachable today (isGoogleAdsConnected() is
    // real and honest, and no real adapter exists yet to actually
    // apply this).
    return { ok: false, error: "No Google Ads write adapter is implemented yet.", errorCode: "provider_error", durationMs: Date.now() - started }
  }
  return {
    ok: true,
    data: { applied: false, action: actionLabel, input, note: "Recorded — no connected Google Ads account to apply this to externally yet. Connect a real ad account to make this action live." },
    durationMs: Date.now() - started,
  }
}

export const marketingActionsTool: ToolDefinition = {
  id: "tool_marketing_actions",
  name: "Marketing Actions",
  provider: "WhiteHabbit",
  description: "Applies a marketing recommendation (negative keyword, budget change, campaign pause, targeting change) — every action requires human approval before it runs.",
  isConnected: () => true,
  actions: [
    {
      id: "add_negative_keyword",
      label: "Add negative keyword",
      permission: "write",
      riskLevel: "high",
      run: async (input, _ctx: ToolContext) => applyIfConnected("add_negative_keyword", input as Record<string, unknown>),
    },
    {
      id: "adjust_budget",
      label: "Adjust campaign budget",
      permission: "financial",
      riskLevel: "high",
      run: async (input, _ctx: ToolContext) => applyIfConnected("adjust_budget", input as Record<string, unknown>),
    },
    {
      id: "pause_campaign",
      label: "Pause campaign",
      permission: "write",
      riskLevel: "high",
      run: async (input, _ctx: ToolContext) => applyIfConnected("pause_campaign", input as Record<string, unknown>),
    },
    {
      id: "change_targeting",
      label: "Change targeting",
      permission: "write",
      riskLevel: "high",
      run: async (input, _ctx: ToolContext) => applyIfConnected("change_targeting", input as Record<string, unknown>),
    },
  ],
}
