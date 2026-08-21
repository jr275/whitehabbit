import "server-only"

/* ================================================================== *
 * ANALYTICS TOOL — genuinely NOT CONNECTED.
 *
 * No analytics account (Instagram, GA, CMS insights, ...) is wired to
 * this environment. Rather than fabricate engagement numbers, this
 * tool always reports blocked with a real, actionable reason. Any
 * skill that requires it (Engagement Analysis) will correctly fail to
 * complete until a real provider is connected — that failure is the
 * honest behavior, not a bug to hide.
 * ================================================================== */

import type { ToolActionResult, ToolDefinition } from "@/lib/agent/types"

const NOT_CONNECTED = "Analytics account not connected — no Instagram/CMS/GA credentials configured."

async function blocked(): Promise<ToolActionResult> {
  return { ok: false, blocked: true, blockedReason: NOT_CONNECTED, durationMs: 0 }
}

export const analyticsTool: ToolDefinition = {
  id: "tool_analytics",
  name: "Analytics",
  provider: "Not connected",
  description: "Reads engagement and performance metrics from a connected analytics provider.",
  isConnected: () => false,
  notConnectedReason: NOT_CONNECTED,
  actions: [
    { id: "getInsights", label: "Get insights", permission: "read", riskLevel: "low", run: blocked },
    { id: "getPosts", label: "Get posts", permission: "read", riskLevel: "low", run: blocked },
    { id: "getComments", label: "Get comments", permission: "read", riskLevel: "low", run: blocked },
  ],
}
