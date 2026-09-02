import "server-only"

/* POST /api/connectors/mcp/sync — real MCP tool discovery + connect.
 *
 * The one connector-specific endpoint in the Integration Runtime: MCP
 * has no interactive OAuth step to complete first (a configured MCP
 * server is either reachable now or it isn't), so "connect" and "sync
 * tools" are the same real action. This is the ONLY place MCP-specific
 * logic lives — the Agent Runtime itself (lib/agent/runtime.ts) still
 * only ever sees the resulting ToolDefinitions, never anything MCP-
 * specific (section "PHASE 14 — Provider-Agnostic Agent Runtime"). */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError, ValidationError } from "@/lib/api-error"
import { createConnection, listConnections, recordAudit, updateConnectionStatus } from "@/lib/db/repo"
import { getConnector } from "@/lib/connectors/registry"
import { discoverMcpTools, type McpServerConfig } from "@/lib/connectors/mcp-connector"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

const CONNECTOR_ID = "connector_mcp"

export async function POST() {
  return withApiHandler("connectors.mcp_sync", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("connection_create", organizationId)

    const connector = getConnector(CONNECTOR_ID)
    if (!connector) throw new NotFoundError()
    if (!connector.enabled) throw new ValidationError("No MCP server is configured (MCP_SERVER_URL is unset).")

    const config: McpServerConfig = {
      id: CONNECTOR_ID,
      name: connector.name,
      endpointUrl: process.env.MCP_SERVER_URL || undefined,
      authHeaderEnvVar: process.env.MCP_SERVER_URL ? "MCP_SERVER_AUTH_TOKEN" : undefined,
    }

    const existing = (await listConnections(organizationId)).find((c) => c.connectorId === CONNECTOR_ID)

    try {
      const { serverName, tools } = await discoverMcpTools(config)
      const metadata = { mcpTools: tools, serverName, toolCount: tools.length }
      const connection = existing
        ? await updateConnectionStatus(existing.id, organizationId, { status: "connected", errorReason: null, displayName: serverName, metadata, userId })
        : await createConnection({ orgId: organizationId, userId, connectorId: CONNECTOR_ID, authType: connector.authenticationType, status: "connected", displayName: serverName, metadata })
      await recordAudit({ orgId: organizationId, userId, action: "connection_connected", resourceType: "connection", resourceId: connection!.id, metadata: { connectorId: CONNECTOR_ID, toolCount: tools.length } })
      return NextResponse.json({ connection, toolCount: tools.length })
    } catch (err) {
      const message = err instanceof Error ? err.message : "MCP sync failed."
      const connection = existing
        ? await updateConnectionStatus(existing.id, organizationId, { status: "error", errorReason: message, userId })
        : await createConnection({ orgId: organizationId, userId, connectorId: CONNECTOR_ID, authType: connector.authenticationType, status: "error", metadata: {} })
      await recordAudit({ orgId: organizationId, userId, action: "connection_created", resourceType: "connection", resourceId: connection!.id, metadata: { connectorId: CONNECTOR_ID, error: message } })
      throw new ValidationError(message)
    }
  })
}
