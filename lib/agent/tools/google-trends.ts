import "server-only"

/* ================================================================== *
 * GOOGLE TRENDS TOOL — genuinely NOT CONNECTED.
 *
 * Google Trends has no public, keyed API — a real integration needs
 * either Google's restricted Trends API partner access or a licensed
 * third-party proxy, neither of which exists in this deployment. Same
 * honest pattern as tool_analytics/tool_news: always blocked, with the
 * real reason, never a fabricated trend curve.
 * ================================================================== */

import type { ToolActionResult, ToolDefinition } from "@/lib/agent/types"

const NOT_CONNECTED = "No Google Trends access connected — requires Google Trends API partner access or a licensed third-party provider."

async function blocked(): Promise<ToolActionResult> {
  return { ok: false, blocked: true, blockedReason: NOT_CONNECTED, durationMs: 0 }
}

export const googleTrendsTool: ToolDefinition = {
  id: "tool_google_trends",
  name: "Google Trends",
  provider: "Not connected",
  description: "Reads real search-interest trend data as a cultural/market intelligence source.",
  isConnected: () => false,
  notConnectedReason: NOT_CONNECTED,
  actions: [{ id: "search", label: "Search", permission: "read", riskLevel: "low", run: blocked }],
}
