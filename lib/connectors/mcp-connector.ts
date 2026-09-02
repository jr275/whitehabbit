import "server-only"

/* ================================================================== *
 * MCP CONNECTOR — registers an MCP server as a first-class Connector
 * (section 6). Its discovered tools become ordinary ToolDefinition
 * objects, going through the exact same tool-runner.ts/
 * toolExecutionBoundary() every native and Connector tool already
 * does — a skill calling an MCP tool looks identical to it calling
 * Web Search. This is the literal mechanism behind "the Agent should
 * not care whether a tool is native, MCP, REST, or GraphQL".
 *
 * Tool discovery (mcp-client.ts's mcpListTools()) happens once, at
 * connect time — see discoverAndCacheMcpTools() below, wired to
 * POST /api/connectors/mcp/sync — not on every execution. Discovered
 * tool descriptors are cached in the real Connection row's `metadata`
 * (non-secret: names/descriptions/schemas, never a credential), and
 * buildTools() reads that cache synchronously, matching the existing
 * ConnectorDefinition.buildTools contract every other connector
 * already implements.
 *
 * MCP tool descriptors carry no standard risk/permission annotation —
 * an MCP tool CAN write or delete even though the protocol gives no
 * reliable signal that it does. Defaulting to "read"/low risk would be
 * unsafe (it would let a destructive MCP tool run without approval).
 * Every MCP tool is therefore conservatively classified
 * external_communication/high — it always requires human approval
 * (lib/workforce/model.ts's HIGH_RISK_PERMISSIONS) until an operator
 * has reviewed and the platform later supports a real per-tool
 * reclassification. Safety over convenience.
 * ================================================================== */

import type { ToolActionResult, ToolContext, ToolDefinition } from "@/lib/agent/types"
import { mcpCallTool, mcpInitialize, mcpListTools, McpClientError, type McpToolDescriptor } from "./mcp-client"
import type { Connection, ConnectorDefinition, IntegrationHealthState } from "./types"

export interface McpServerConfig {
  id: string
  name: string
  /** undefined = no real server configured — the connector is
   * registered (so the capability is visible) but stays disabled. */
  endpointUrl?: string
  /** Name of an env var holding a bearer token, if this server needs
   * one. The token itself is never read into this config object or
   * logged — only looked up at call time. */
  authHeaderEnvVar?: string
}

function authHeaders(config: McpServerConfig): Record<string, string> {
  if (!config.authHeaderEnvVar) return {}
  const token = process.env[config.authHeaderEnvVar]
  return token ? { authorization: `Bearer ${token}` } : {}
}

function mcpToolToToolDefinition(descriptor: McpToolDescriptor, config: McpServerConfig, connection: Connection): ToolDefinition {
  return {
    id: `mcp_${config.id}.${descriptor.name}`,
    name: descriptor.name,
    provider: config.name,
    description: descriptor.description || "MCP tool — no description provided by the server.",
    isConnected: () => connection.status === "connected",
    notConnectedReason: connection.status !== "connected" ? `${config.name} is ${connection.status}.` : undefined,
    actions: [
      {
        id: "call",
        label: descriptor.name,
        // See file header: MCP gives no reliable risk signal, so every
        // MCP tool call requires human approval by default.
        permission: "external_communication",
        riskLevel: "high",
        run: async (input: unknown, _ctx: ToolContext): Promise<ToolActionResult> => {
          const started = Date.now()
          if (!config.endpointUrl) return { ok: false, blocked: true, blockedReason: `${config.name} has no configured endpoint.`, durationMs: 0 }
          try {
            const result = await mcpCallTool(config.endpointUrl, authHeaders(config), descriptor.name, (input as Record<string, unknown>) ?? {})
            return { ok: !result.isError, data: result, durationMs: Date.now() - started }
          } catch (err) {
            return { ok: false, errorCode: "provider_error", error: err instanceof McpClientError ? err.message : "MCP call failed", durationMs: Date.now() - started }
          }
        },
      },
    ],
  }
}

/** Real, live discovery — called from a connect-time sync action
 * (POST /api/connectors/mcp/sync), never from buildTools() itself
 * (which must stay synchronous). Returns the real descriptors an
 * operator's own MCP server actually reported; throws (never returns
 * a fabricated list) if the server can't be reached. */
export async function discoverMcpTools(config: McpServerConfig): Promise<{ serverName: string; tools: McpToolDescriptor[] }> {
  if (!config.endpointUrl) throw new McpClientError(`${config.name} has no configured endpoint.`)
  const headers = authHeaders(config)
  const server = await mcpInitialize(config.endpointUrl, headers)
  const tools = await mcpListTools(config.endpointUrl, headers)
  return { serverName: server.name, tools }
}

export function buildMcpConnector(config: McpServerConfig): ConnectorDefinition {
  const configured = !!config.endpointUrl

  const healthCheck = configured
    ? async (connection: Connection): Promise<{ state: IntegrationHealthState; detail?: string }> => {
        if (connection.status !== "connected") return { state: "not_configured", detail: `${config.name} is ${connection.status}.` }
        try {
          await mcpInitialize(config.endpointUrl!, authHeaders(config))
          return { state: "healthy" }
        } catch (err) {
          return { state: "error", detail: err instanceof Error ? err.message : "MCP server unreachable." }
        }
      }
    : undefined

  return {
    id: config.id,
    name: config.name,
    description: configured
      ? `MCP server at ${config.endpointUrl} — its real tools appear here once synced.`
      : "Register an MCP server to expose its real tools through the same Tool/Action abstraction every native tool uses. Not yet configured — architecture only.",
    provider: "mcp",
    category: "developer",
    authenticationType: "mcp",
    capabilities: [],
    actions: [],
    triggers: [],
    enabled: configured,
    buildTools: (connection: Connection): ToolDefinition[] => {
      const cached = (connection.metadata?.mcpTools as McpToolDescriptor[] | undefined) ?? []
      return cached.map((t) => mcpToolToToolDefinition(t, config, connection))
    },
    healthCheck,
  }
}
