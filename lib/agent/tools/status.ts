import "server-only"

/* Live, real connectivity status for each tool — computed fresh on
 * every read, never cached as a stale fact in a stored worker. */

import { getTool } from "./registry"

export function liveToolStatus(toolId: string): { connected: boolean; reason?: string; provider: string } {
  const tool = getTool(toolId)
  if (!tool) return { connected: false, reason: "Unknown tool.", provider: "Unknown" }
  const connected = tool.isConnected()
  // tool.provider is a live getter for tool_llm (reflects LLM_PROVIDER),
  // a plain string for everything else — read fresh either way.
  return { connected, reason: connected ? undefined : tool.notConnectedReason, provider: tool.provider }
}
