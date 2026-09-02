import "server-only"

/* ================================================================== *
 * SOCIAL SIGNALS TOOL — genuinely NOT CONNECTED.
 *
 * No social platform API (X/Twitter API, Reddit API, ...) is wired to
 * this environment. Same honest pattern as tool_analytics/tool_news/
 * tool_google_trends: always blocked, with the real reason, never a
 * fabricated conversation volume.
 * ================================================================== */

import type { ToolActionResult, ToolDefinition } from "@/lib/agent/types"

const NOT_CONNECTED = "No social platform connected — configure a social API credential (e.g. X API, Reddit API) to enable this source."

async function blocked(): Promise<ToolActionResult> {
  return { ok: false, blocked: true, blockedReason: NOT_CONNECTED, durationMs: 0 }
}

export const socialSignalsTool: ToolDefinition = {
  id: "tool_social_signals",
  name: "Social Signals",
  provider: "Not connected",
  description: "Reads real social conversation volume and sentiment as a cultural/market intelligence source.",
  isConnected: () => false,
  notConnectedReason: NOT_CONNECTED,
  actions: [{ id: "search", label: "Search", permission: "read", riskLevel: "low", run: blocked }],
}
