/* ================================================================== *
 * CONNECTOR REGISTRY — the one place connectors are registered and
 * discovered. Same shape as lib/agent/skills/registry.ts and
 * lib/agent/tools/registry.ts: a static array + typed lookups. No
 * connector-specific logic belongs anywhere else — an API route or a
 * UI component asks this registry, never hardcodes a provider name.
 * ================================================================== */

import "server-only"

import type { Connection, ConnectorAction, ConnectorCapability, ConnectorDefinition, ConnectorTrigger, CustomConnector, CustomConnectorRestConfig, CustomConnectorStatus } from "./types"
import { customConnectorConnectorId } from "./custom-connector-id"
import { listDynamicConnectorSummaries } from "./dynamic"
import { buildMcpConnector } from "./mcp-connector"
import { emitConnectorExecutionCompleted, emitConnectorExecutionFailed, emitConnectorExecutionStarted, type ConnectorExecutionFields } from "./observability"
import { googleAnalyticsConnector } from "./providers/google-analytics"
import { salesforceConnector } from "./providers/salesforce"
import { slackConnector } from "./providers/slack"
import { testConnector } from "./test-connector"
import { classifyNormalizedError } from "@/lib/agent/errors"
import type { ToolAction, ToolActionResult, ToolContext, ToolDefinition } from "@/lib/agent/types"
import { recordConnectionHealth } from "@/lib/db/repo"

/** The one MCP server this deployment knows about, if any. Real: reads
 * real env vars, registers a real (if unconfigured) Connector either
 * way — see lib/connectors/mcp-connector.ts. Setting MCP_SERVER_URL
 * is a same-shaped change to a .env file; nothing here needs editing
 * to point WhiteHabbit at a different MCP server. */
const mcpConnector = buildMcpConnector({
  id: "connector_mcp",
  name: process.env.MCP_SERVER_NAME || "MCP Server",
  endpointUrl: process.env.MCP_SERVER_URL || undefined,
  authHeaderEnvVar: process.env.MCP_SERVER_URL ? "MCP_SERVER_AUTH_TOKEN" : undefined,
})

/** Real, functional entries first; disabled placeholders after — kept
 * in the SAME registry (not a separate list) so the UI has one real
 * source of truth for "what connectors exist at all," per section 11's
 * requirement to show not-yet-available providers honestly rather
 * than omitting them or faking a Connect button for them.
 *
 * Every placeholder below is architecture-only: enabled: false,
 * empty capabilities, buildTools() that never runs (the API layer
 * refuses to create a Connection for a disabled connector — see
 * app/api/connections/route.ts). Adding a real provider later means
 * adding one real ConnectorDefinition here; nothing else in this file,
 * the Tool Registry, or the Worker Runtime changes. */
const PLACEHOLDER_CONNECTORS: ConnectorDefinition[] = [
  {
    id: "connector_google",
    name: "Google",
    description: "Gmail, Google Sheets, Drive, Calendar. Not yet implemented — architecture only.",
    provider: "google",
    category: "productivity",
    authenticationType: "oauth2",
    capabilities: [],
    enabled: false,
    buildTools: () => [],
  },
  {
    id: "connector_meta",
    name: "Meta",
    description: "Instagram and other Meta platform capabilities. Not yet implemented — architecture only.",
    provider: "meta",
    category: "advertising",
    authenticationType: "oauth2",
    capabilities: [],
    enabled: false,
    buildTools: () => [],
  },
  {
    id: "connector_microsoft365",
    name: "Microsoft 365",
    description: "Outlook, Teams, SharePoint. Not yet implemented — architecture only.",
    provider: "microsoft",
    category: "productivity",
    authenticationType: "oauth2",
    capabilities: [],
    enabled: false,
    buildTools: () => [],
  },
  {
    id: "connector_hubspot",
    name: "HubSpot",
    description: "CRM, marketing and sales pipeline. Not yet implemented — architecture only.",
    provider: "hubspot",
    category: "crm",
    authenticationType: "oauth2",
    capabilities: [],
    enabled: false,
    buildTools: () => [],
  },
  {
    id: "connector_notion",
    name: "Notion",
    description: "Pages, databases, docs. Not yet implemented — architecture only.",
    provider: "notion",
    category: "productivity",
    authenticationType: "oauth2",
    capabilities: [],
    enabled: false,
    buildTools: () => [],
  },
  {
    id: "connector_asana",
    name: "Asana",
    description: "Tasks and project tracking. Not yet implemented — architecture only.",
    provider: "asana",
    category: "productivity",
    authenticationType: "oauth2",
    capabilities: [],
    enabled: false,
    buildTools: () => [],
  },
  {
    id: "connector_jira",
    name: "Jira",
    description: "Issues and project tracking. Not yet implemented — architecture only.",
    provider: "atlassian",
    category: "productivity",
    authenticationType: "oauth2",
    capabilities: [],
    enabled: false,
    buildTools: () => [],
  },
  {
    id: "connector_google_ads",
    name: "Google Ads",
    description: "Campaign management and performance. Not yet implemented — architecture only.",
    provider: "google",
    category: "advertising",
    authenticationType: "oauth2",
    capabilities: [],
    enabled: false,
    buildTools: () => [],
  },
  {
    id: "connector_meta_ads",
    name: "Meta Ads",
    description: "Campaign management and performance. Not yet implemented — architecture only.",
    provider: "meta",
    category: "advertising",
    authenticationType: "oauth2",
    capabilities: [],
    enabled: false,
    buildTools: () => [],
  },
  {
    id: "connector_stripe",
    name: "Stripe",
    description: "Payments, subscriptions, revenue. Not yet implemented — architecture only.",
    provider: "stripe",
    category: "finance",
    authenticationType: "api_key",
    capabilities: [],
    enabled: false,
    buildTools: () => [],
  },
]

export const CONNECTOR_REGISTRY: ConnectorDefinition[] = [testConnector, slackConnector, salesforceConnector, googleAnalyticsConnector, mcpConnector, ...PLACEHOLDER_CONNECTORS]

export function registerConnector(connector: ConnectorDefinition): void {
  if (CONNECTOR_REGISTRY.some((c) => c.id === connector.id)) {
    throw new Error(`Connector "${connector.id}" is already registered.`)
  }
  CONNECTOR_REGISTRY.push(connector)
}

export function getConnector(id: string): ConnectorDefinition | undefined {
  return CONNECTOR_REGISTRY.find((c) => c.id === id)
}

export function listConnectors(): ConnectorDefinition[] {
  return CONNECTOR_REGISTRY
}

export function getConnectorCapabilities(id: string): ConnectorCapability[] {
  return getConnector(id)?.capabilities ?? []
}

/* ================================================================== *
 * CATALOG MERGE — connector platform audit, Fase D7. GET /api/connectors
 * (app/api/connectors/route.ts) needs ONE list combining built-in
 * (CONNECTOR_REGISTRY, static) and custom (custom_connectors, real
 * per-org rows) connectors, so the Connector Hub and Worker Studio's
 * Integrations step both see the full, real catalog without either
 * needing a second fetch or a second merge implemented differently.
 * A built-in id never collides with a custom one: every custom
 * connector's summary id is prefixed via customConnectorConnectorId()
 * (lib/connectors/custom-connector-id.ts) — "custom_cconn_<uuid>" —
 * which also makes it the exact connectorId a Connection row for that
 * custom connector uses (see app/api/custom-connectors/[id]/test/
 * route.ts), so Worker Studio's existing connections-driven UI
 * (components/studio/build-panel.tsx) picks up a connected custom
 * connector with ZERO code changes there — genuinely "discovered", not
 * reimplemented, matching the audit's own section 13 expectation.
 * ================================================================== */
export interface ConnectorSummary {
  id: string
  name: string
  description: string
  provider: string
  category: string
  authenticationType: string
  capabilities: ConnectorCapability[]
  actions: ConnectorAction[]
  triggers: ConnectorTrigger[]
  enabled: boolean
  /** "built-in" = a static, code-defined ConnectorDefinition; "custom"
   * = an org-added custom_connectors row. Purely a UI badge signal —
   * every downstream consumer (Tool Registry, tool-runner, approval
   * gate) already treats both identically, per the audit's own
   * confirmation that no second execution path exists. */
  origin: "built-in" | "custom"
  /** Only meaningful for origin "custom" — a custom connector has no
   * separate Connection row to derive this from by default (unlike a
   * built-in connector, whose live state always comes from its own
   * Connection). Mirrors CustomConnector.status exactly. */
  status?: CustomConnectorStatus
}

function builtinToSummary(c: ConnectorDefinition): ConnectorSummary {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    provider: c.provider,
    category: c.category ?? "other",
    authenticationType: c.authenticationType,
    capabilities: c.capabilities,
    actions: c.actions ?? [],
    triggers: c.triggers ?? [],
    enabled: c.enabled,
    origin: "built-in",
  }
}

function customToSummary(row: CustomConnector): ConnectorSummary {
  const authenticationType = row.kind === "mcp" ? "mcp" : (row.config as CustomConnectorRestConfig).authType
  return {
    id: customConnectorConnectorId(row.id),
    name: row.name,
    description: row.description ?? "",
    provider: row.kind === "mcp" ? "mcp" : "custom-rest",
    category: row.category ?? "custom",
    authenticationType,
    capabilities: [],
    // The generic "call" action (custom-rest.ts) is deliberately
    // excluded here — it's always delete/high (Fase D5) by design,
    // not a friendly per-action toggle; only real, described,
    // individually-risk-derived discovered actions are ever exposed
    // to a per-action Worker Studio permission grid.
    actions: row.discoveredTools,
    triggers: [],
    enabled: true,
    origin: "custom",
    status: row.status,
  }
}

/** Real, org-scoped merge — built-in connectors are the same for
 * every org (a fact about the deployed code); custom connectors are
 * this org's own rows only (listDynamicConnectorSummaries is already
 * org-scoped end to end — see lib/connectors/dynamic.ts). */
export async function listAllConnectors(orgId: string): Promise<ConnectorSummary[]> {
  const builtin = CONNECTOR_REGISTRY.map(builtinToSummary)
  const custom = (await listDynamicConnectorSummaries(orgId)).map(customToSummary)
  return [...builtin, ...custom]
}

/** Wraps one real ToolAction.run so every real connector call —
 * regardless of provider, regardless of whether it succeeds or fails —
 * opportunistically records real connection health (section 23/27)
 * AND emits the real connector_execution_started/completed/failed
 * events (connector platform audit, Fase D9): the single chokepoint
 * every connector action already flows through (getConnectorTools()
 * is what toolsMapForOrg() and the direct-Approve path both call), so
 * this is the ONE place that needed either write, not a change
 * scattered across every provider adapter. Never changes the action's
 * own real result — purely observability side effects after the fact. */
function withHealthTracking(connection: Connection, toolId: string, action: ToolAction): (input: unknown, ctx: ToolContext) => Promise<ToolActionResult> {
  return async (input, ctx) => {
    const started = Date.now()
    const fields: ConnectorExecutionFields = { connectorId: connection.connectorId, connectionId: connection.id, toolId, actionId: action.id }
    emitConnectorExecutionStarted(ctx, fields)
    const result = await action.run(input, ctx)
    const latencyMs = result.durationMs ?? Date.now() - started
    const normalized = result.ok ? undefined : classifyNormalizedError({ errorCode: result.errorCode, error: result.error, retryAfterMs: result.retryAfterMs })
    if (result.ok) {
      emitConnectorExecutionCompleted(ctx, fields, { durationMs: latencyMs, httpStatus: result.httpStatus })
    } else {
      emitConnectorExecutionFailed(ctx, fields, { durationMs: latencyMs, httpStatus: result.httpStatus, errorCode: result.errorCode })
    }
    // Awaited (one small, already-indexed UPDATE) so health is
    // immediately consistent with the call that just happened — but a
    // health-write failure itself must never fail or mask the real
    // action's own already-real result.
    try {
      await recordConnectionHealth(connection.id, connection.organizationId, { ok: result.ok, errorCode: normalized, latencyMs })
    } catch {
      /* observability write failure — never masks the real action result */
    }
    return result
  }
}

/** Real ToolDefinitions for one specific Connection — only ever
 * meaningful for a connector that's actually enabled AND a connection
 * that's actually connected; returns [] otherwise rather than
 * throwing, since "no tools available" is the correct, honest answer
 * for a disconnected/disabled connector. */
export function getConnectorTools(connection: Connection): ToolDefinition[] {
  const connector = getConnector(connection.connectorId)
  if (!connector || !connector.enabled) return []
  if (connection.status !== "connected") return []
  const tools = connector.buildTools(connection)
  return tools.map((tool) => ({ ...tool, actions: tool.actions.map((action) => ({ ...action, run: withHealthTracking(connection, tool.id, action) })) }))
}
