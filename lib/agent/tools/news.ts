import "server-only"

/* ================================================================== *
 * NEWS TOOL — genuinely NOT CONNECTED.
 *
 * No news API (NewsAPI, GDELT, a licensed feed, ...) is wired to this
 * environment. Rather than fabricate headlines, this tool always
 * reports blocked with a real, actionable reason — the same honest
 * pattern as tool_analytics. skill_cultural_intelligence does not
 * require this tool (it stays web-search-only until a real news source
 * exists), so a worker is never blocked by this specifically; it exists
 * so the real, not-yet-connected state is visible in the System Health
 * panel rather than simply absent.
 * ================================================================== */

import type { ToolActionResult, ToolDefinition } from "@/lib/agent/types"

const NOT_CONNECTED = "No news provider connected — configure a news API credential (e.g. NewsAPI, GDELT) to enable this source."

async function blocked(): Promise<ToolActionResult> {
  return { ok: false, blocked: true, blockedReason: NOT_CONNECTED, durationMs: 0 }
}

export const newsTool: ToolDefinition = {
  id: "tool_news",
  name: "News",
  provider: "Not connected",
  description: "Searches real, current news coverage as a cultural/market intelligence source.",
  isConnected: () => false,
  notConnectedReason: NOT_CONNECTED,
  actions: [{ id: "search", label: "Search", permission: "read", riskLevel: "low", run: blocked }],
}
