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
 * Wired into lib/agent/runtime.ts's real execution path (executeTask/
 * resumeTask/retryFailedStage all call toolsMapForOrg) — a connected
 * connector's real tools (Salesforce, Slack, MCP, the Internal Test
 * Connector, a Custom REST Connector) are genuinely reachable by any
 * skill a Worker runs, subject to the same permission/approval gate
 * every native tool goes through.
 * ================================================================== */

import { listConnections, listCustomConnectors } from "@/lib/db/repo"
import { buildDynamicConnectorTools } from "@/lib/connectors/dynamic"
import { getConnectorTools } from "@/lib/connectors/registry"
import { toolsMap } from "./registry"
import type { ToolDefinition } from "@/lib/agent/types"

/** Native tools (unchanged) merged with the org's real, CONNECTED
 * connectors' real tools — both static (Salesforce/Slack/MCP/the
 * Internal Test Connector — lib/connectors/registry.ts's
 * CONNECTOR_REGISTRY) and dynamic (org-added MCP servers/Custom REST
 * Connectors — lib/connectors/dynamic.ts's custom_connectors bridge).
 * A native tool id always wins on collision — a connector can extend
 * the catalog, never shadow a built-in. */
export async function toolsMapForOrg(orgId: string): Promise<Map<string, ToolDefinition>> {
  const map = toolsMap()

  const connections = await listConnections(orgId)
  for (const connection of connections) {
    if (connection.status !== "connected") continue
    for (const tool of getConnectorTools(connection)) {
      if (!map.has(tool.id)) map.set(tool.id, tool)
    }
  }

  const customConnectors = await listCustomConnectors(orgId)
  for (const row of customConnectors) {
    for (const tool of buildDynamicConnectorTools(row)) {
      if (!map.has(tool.id)) map.set(tool.id, tool)
    }
  }

  return map
}
