import "server-only"

/* Live, real connectivity status for each tool — computed fresh on
 * every read, never cached as a stale fact in a stored worker. */

import { getTool } from "./registry"

export function liveToolStatus(toolId: string): { connected: boolean; reason?: string } {
  const tool = getTool(toolId)
  if (!tool) return { connected: false, reason: "Unknown tool." }
  const connected = tool.isConnected()
  return { connected, reason: connected ? undefined : tool.notConnectedReason }
}
