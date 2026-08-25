import "server-only"

/* ================================================================== *
 * CONNECTOR TOOLS -> TOOL REGISTRY — the exact integration point
 * requested by the Connector Foundation brief: Connector Tools become
 * ordinary entries in the same Map<string, ToolDefinition> the
 * Worker Runtime already builds from the static TOOL_REGISTRY
 * (lib/agent/tools/registry.ts:158's toolsMap(), consumed by
 * lib/agent/runtime.ts). No second tool map, no second runtime, no
 * second permission system — a Connector Tool that reaches ctx.tools
 * goes through runToolAction() (lib/agent/tool-runner.ts) exactly
 * like Web Search or the LLM tool.
 *
 * NOT yet wired into lib/agent/runtime.ts's real execution path in
 * Phase 1 — there is no real connector tool a Worker would need
 * (Gmail/Sheets/etc. don't exist yet), and the one that does exist
 * (the internal test connector) exists to be proven correct here and
 * in tests, not to be exposed to production Worker executions. See
 * the Phase 1 report's architecture section for this exact boundary.
 * ================================================================== */

import { listConnections } from "@/lib/db/repo"
import { getConnectorTools } from "@/lib/connectors/registry"
import { toolsMap } from "./registry"
import type { ToolDefinition } from "@/lib/agent/types"

/** Native tools (unchanged) merged with the org's real, CONNECTED
 * connectors' real tools. A native tool id always wins on collision —
 * a connector can extend the catalog, never shadow a built-in. */
export async function toolsMapForOrg(orgId: string): Promise<Map<string, ToolDefinition>> {
  const map = toolsMap()
  const connections = await listConnections(orgId)
  for (const connection of connections) {
    if (connection.status !== "connected") continue
    for (const tool of getConnectorTools(connection)) {
      if (!map.has(tool.id)) map.set(tool.id, tool)
    }
  }
  return map
}
