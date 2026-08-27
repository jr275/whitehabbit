import "server-only"

/* ================================================================== *
 * DYNAMIC CONNECTORS BRIDGE — section 4/11/12/14 of the connectivity
 * platform brief. Turns a real, org-added custom_connectors row
 * (MCP server or Custom REST Connector) into ordinary ToolDefinition
 * objects, exactly the shape the static CONNECTOR_REGISTRY already
 * produces — so lib/agent/tools/connector-tools.ts's toolsMapForOrg()
 * needs exactly one new branch (checked here, not scattered) to merge
 * dynamic tools in alongside static ones. Nothing about the Tool
 * Registry, tool-runner, approval gate, or retry/idempotency changes.
 *
 * Discovery (real MCP tool listing) happens at connect/sync time —
 * see discoverDynamicMcpTools(), called from a real sync action — and
 * is cached on the row (discoveredTools), matching the exact pattern
 * lib/connectors/mcp-connector.ts's static single-server MCP connector
 * already established.
 * ================================================================== */

import { getConnectionByConnectorId, getCustomConnector, listCustomConnectors } from "@/lib/db/repo"
import { customConnectorConnectorId } from "./custom-connector-id"
import { resolveConnectionCredential } from "./credential-resolver"
import { buildCustomRestTools } from "./custom-rest"
import { mcpCallTool, mcpInitialize, mcpListTools, McpClientError, type McpToolDescriptor } from "./mcp-client"
import { emitConnectorExecutionCompleted, emitConnectorExecutionFailed, emitConnectorExecutionStarted, type ConnectorExecutionFields } from "./observability"
import type { ConnectorAction, CustomConnector, CustomConnectorMcpConfig } from "./types"
import type { ToolAction, ToolActionResult, ToolContext, ToolDefinition } from "@/lib/agent/types"

function isMcpConfig(config: CustomConnector["config"]): config is CustomConnectorMcpConfig {
  return "endpointUrl" in config
}

/** Resolves through the one authoritative credential-resolution
 * boundary (lib/connectors/credential-resolver.ts) — see custom-
 * rest.ts's resolveAuthHeaders for the identical reasoning applied to
 * REST connectors. */
async function resolveMcpHeaders(row: CustomConnector): Promise<Record<string, string>> {
  const connection = await getConnectionByConnectorId(row.organizationId, customConnectorConnectorId(row.id))
  if (!connection) return {}
  const resolved = await resolveConnectionCredential(connection)
  if (resolved?.kind === "generic" && resolved.credential.type === "mcp_bearer") return { authorization: `Bearer ${resolved.credential.token}` }
  return {}
}

/** Real, live discovery — called from a connect-time/re-sync action,
 * never from buildTools() itself. Returns the real descriptors the
 * operator's own MCP server actually reported; throws (never a
 * fabricated list) if it can't be reached. */
export async function discoverDynamicMcpTools(row: CustomConnector): Promise<{ serverName: string; tools: McpToolDescriptor[] }> {
  if (!isMcpConfig(row.config)) throw new McpClientError("Not an MCP connector.")
  const headers = await resolveMcpHeaders(row)
  const server = await mcpInitialize(row.config.endpointUrl, headers)
  const tools = await mcpListTools(row.config.endpointUrl, headers)
  return { serverName: server.name, tools }
}

/** MCP gives no reliable risk/permission signal (same reasoning as
 * lib/connectors/mcp-connector.ts's static server) — every discovered
 * tool is conservatively external_communication/high, always
 * requiring human approval, until an operator reclassifies it. */
export function mcpDescriptorsToActions(tools: McpToolDescriptor[]): ConnectorAction[] {
  return tools.map((t) => ({
    id: t.name,
    label: t.name,
    description: t.description || "MCP tool — no description provided by the server.",
    inputSchema: {},
    outputSchema: {},
    permission: "external_communication",
    riskLevel: "high",
  }))
}

function buildDynamicMcpTools(row: CustomConnector): ToolDefinition[] {
  if (!isMcpConfig(row.config)) return []
  const connected = row.status === "connected"
  const endpointUrl = row.config.endpointUrl
  return [
    {
      id: `custom_${row.id}.mcp`,
      name: row.name,
      provider: "mcp",
      description: row.description ?? `MCP server at ${endpointUrl}.`,
      isConnected: () => connected,
      notConnectedReason: connected ? undefined : `${row.name} is ${row.status}.`,
      actions: row.discoveredTools.map((descriptor) => ({
        id: descriptor.id,
        label: descriptor.label,
        permission: descriptor.permission,
        riskLevel: descriptor.riskLevel,
        run: async (input: unknown, _ctx: ToolContext): Promise<ToolActionResult> => {
          const started = Date.now()
          try {
            const headers = await resolveMcpHeaders(row)
            const result = await mcpCallTool(endpointUrl, headers, descriptor.id, (input as Record<string, unknown>) ?? {})
            return { ok: !result.isError, data: result, durationMs: Date.now() - started }
          } catch (err) {
            return { ok: false, errorCode: "provider_error", error: err instanceof McpClientError ? err.message : "MCP call failed", durationMs: Date.now() - started }
          }
        },
      })),
    },
  ]
}

/** Wraps one real dynamic-connector ToolAction.run so every call —
 * built-in's own registry.ts's getConnectorTools() equivalent —
 * emits the real connector_execution_started/completed/failed events
 * (connector platform audit, Fase D9). connectionId is deliberately
 * omitted: a custom connector's default credential path has no live
 * Connection identity driving THIS execution in this phase (see
 * lib/connectors/observability.ts's ConnectorExecutionFields comment)
 * — never a fabricated correlation to a row nothing here actually
 * consulted. */
function withConnectorObservability(row: CustomConnector, toolId: string, action: ToolAction): (input: unknown, ctx: ToolContext) => Promise<ToolActionResult> {
  const fields: ConnectorExecutionFields = { connectorId: customConnectorConnectorId(row.id), toolId, actionId: action.id }
  return async (input, ctx) => {
    const started = Date.now()
    emitConnectorExecutionStarted(ctx, fields)
    const result = await action.run(input, ctx)
    const durationMs = result.durationMs ?? Date.now() - started
    if (result.ok) {
      emitConnectorExecutionCompleted(ctx, fields, { durationMs, httpStatus: result.httpStatus })
    } else {
      emitConnectorExecutionFailed(ctx, fields, { durationMs, httpStatus: result.httpStatus, errorCode: result.errorCode })
    }
    return result
  }
}

/** The one real integration point: toolsMapForOrg() calls this for
 * every real, connected custom_connectors row alongside its existing
 * static-connector loop — same "honest empty list" contract
 * lib/connectors/registry.ts's getConnectorTools() already follows
 * for a disabled/disconnected static connector. Synchronous (building
 * the ToolDefinition list needs nothing beyond the row itself; only
 * an actual call's credential resolution is async, inside each
 * action's own run()), so merging this into toolsMapForOrg's existing
 * loop needs no extra DB round trip. */
export function buildDynamicConnectorTools(row: CustomConnector): ToolDefinition[] {
  if (row.status !== "connected") return []
  let tools: ToolDefinition[]
  if (row.kind === "rest") tools = buildCustomRestTools(row)
  else if (row.kind === "mcp") tools = buildDynamicMcpTools(row)
  else return []
  return tools.map((tool) => ({ ...tool, actions: tool.actions.map((action) => ({ ...action, run: withConnectorObservability(row, tool.id, action) })) }))
}

/** Org-scoped single-connector lookup + build — used by routes that
 * need one connector's tools directly (e.g. a "View tools" UI action)
 * without pulling the whole org's list. */
export async function getDynamicConnectorTools(connectorId: string, orgId: string): Promise<ToolDefinition[]> {
  const row = await getCustomConnector(connectorId, orgId)
  if (!row) return []
  return buildDynamicConnectorTools(row)
}

/** For listing/display purposes (e.g. a future Marketplace/Studio
 * view) — every real dynamic connector this org has added, in the
 * same shape a static ConnectorDefinition's summary fields carry. */
export async function listDynamicConnectorSummaries(orgId: string): Promise<CustomConnector[]> {
  return listCustomConnectors(orgId)
}
