import "server-only"

/* POST /api/custom-connectors/[id]/test — a real, live "Test
 * connection" check (mirrors app/api/connections/[id]/test's own
 * reasoning: a genuine reachability probe, never an inference from
 * "a credential/config exists").
 *
 * Connector platform audit, Fase D6/D17. This is what actually earns
 * status: "connected" — creation (POST /api/custom-connectors) and
 * setting a credential (POST .../credential) both deliberately never
 * touch status themselves. For a REST connector this is a bare GET
 * against the connector's own configured origin, through the exact
 * safeFetch/SSRF/redirect/size-cap path every real call already uses
 * (lib/connectors/custom-rest.ts's testCustomRestConnector). For an
 * MCP connector, a real handshake + tool listing IS the reachability
 * check — there's no separate "ping" in this protocol — so a
 * successful test also refreshes discoveredTools, the same "connect
 * and sync are the same real act for MCP" reasoning
 * app/api/connectors/mcp/sync/route.ts already established for the
 * static single-server MCP connector.
 *
 * Fase D7: also upserts a real `connections` row (connectorId =
 * customConnectorConnectorId(id), the same "custom_<id>" convention
 * Fase D2 established) mirroring the result — the one thing that lets
 * Worker Studio's existing connections-driven Integrations step
 * (components/studio/build-panel.tsx) pick up a connected custom
 * connector with zero code changes there, exactly like the static MCP
 * sync route already does for the single-server MCP connector. */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError } from "@/lib/api-error"
import { ensureConnectionForCustomConnector, getCustomConnector, recordAudit, updateConnectionStatus, updateCustomConnectorDiscovery } from "@/lib/db/repo"
import { testCustomRestConnector } from "@/lib/connectors/custom-rest"
import type { CustomConnector } from "@/lib/connectors/types"
import { discoverDynamicMcpTools, mcpDescriptorsToActions } from "@/lib/connectors/dynamic"
import { McpClientError } from "@/lib/connectors/mcp-client"
import type { Connection } from "@/lib/connectors/types"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

/** Real upsert — one mirrored Connection row per (org, custom
 * connector), matching how every other real "connect" flow in this
 * codebase either creates or updates a single row rather than
 * accumulating duplicates on repeated tests
 * (app/api/connectors/mcp/sync/route.ts's same existing/create
 * branching). Delegates the "does a Connection already exist"
 * half to lib/db/repo.ts's ensureConnectionForCustomConnector (Phase
 * 2A — the same function credential-set now also calls, so a
 * Connection created there and one created here are the exact same
 * row, never a duplicate), then records this test's real result. */
async function upsertConnectionForCustomConnector(orgId: string, userId: string | undefined, connector: CustomConnector, ok: boolean, errorReason?: string, displayName?: string): Promise<Connection> {
  const authType = connector.kind === "mcp" ? "mcp" : "api_key"
  const connection = await ensureConnectionForCustomConnector(orgId, userId, connector.id, connector.name, authType)
  return (await updateConnectionStatus(connection.id, orgId, { status: ok ? "connected" : "error", errorReason: ok ? null : (errorReason ?? "Unreachable."), displayName: displayName ?? connector.name, userId }))!
}

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("custom_connectors.test", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("custom_connector_test", organizationId)
    const { id } = await params
    const connector = await getCustomConnector(id, organizationId)
    if (!connector) throw new NotFoundError()

    if (connector.kind === "rest") {
      const result = await testCustomRestConnector(connector)
      const updated = await updateCustomConnectorDiscovery(id, organizationId, {
        status: result.ok ? "connected" : "error",
        errorReason: result.ok ? null : (result.error ?? "Unreachable."),
      })
      await upsertConnectionForCustomConnector(organizationId, userId, connector, result.ok, result.error)
      await recordAudit({ orgId: organizationId, userId, action: "custom_connector_tested", resourceType: "custom_connector", resourceId: id, metadata: { ok: result.ok } })
      return NextResponse.json({ health: { ok: result.ok, latencyMs: result.latencyMs, error: result.error }, connector: updated })
    }

    // kind === "mcp"
    try {
      const { serverName, tools } = await discoverDynamicMcpTools(connector)
      const updated = await updateCustomConnectorDiscovery(id, organizationId, { status: "connected", errorReason: null, discoveredTools: mcpDescriptorsToActions(tools) })
      await upsertConnectionForCustomConnector(organizationId, userId, connector, true, undefined, serverName || connector.name)
      await recordAudit({ orgId: organizationId, userId, action: "custom_connector_tested", resourceType: "custom_connector", resourceId: id, metadata: { ok: true, serverName, toolCount: tools.length } })
      return NextResponse.json({ health: { ok: true, serverName, toolCount: tools.length }, connector: updated })
    } catch (err) {
      const message = err instanceof McpClientError ? err.message : err instanceof Error ? err.message : "Could not reach the MCP server."
      const updated = await updateCustomConnectorDiscovery(id, organizationId, { status: "error", errorReason: message })
      await upsertConnectionForCustomConnector(organizationId, userId, connector, false, message)
      await recordAudit({ orgId: organizationId, userId, action: "custom_connector_tested", resourceType: "custom_connector", resourceId: id, metadata: { ok: false } })
      return NextResponse.json({ health: { ok: false, error: message }, connector: updated })
    }
  })
}
