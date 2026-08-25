/* ================================================================== *
 * CONNECTOR REGISTRY — the one place connectors are registered and
 * discovered. Same shape as lib/agent/skills/registry.ts and
 * lib/agent/tools/registry.ts: a static array + typed lookups. No
 * connector-specific logic belongs anywhere else — an API route or a
 * UI component asks this registry, never hardcodes a provider name.
 * ================================================================== */

import type { Connection, ConnectorCapability, ConnectorDefinition } from "./types"
import { buildMcpConnector } from "./mcp-connector"
import { salesforceConnector } from "./providers/salesforce"
import { slackConnector } from "./providers/slack"
import { testConnector } from "./test-connector"
import type { ToolDefinition } from "@/lib/agent/types"

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
    id: "connector_google_analytics",
    name: "Google Analytics",
    description: "Real site/app performance data. Not yet implemented — architecture only.",
    provider: "google",
    category: "analytics",
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

export const CONNECTOR_REGISTRY: ConnectorDefinition[] = [testConnector, slackConnector, salesforceConnector, mcpConnector, ...PLACEHOLDER_CONNECTORS]

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

/** Real ToolDefinitions for one specific Connection — only ever
 * meaningful for a connector that's actually enabled AND a connection
 * that's actually connected; returns [] otherwise rather than
 * throwing, since "no tools available" is the correct, honest answer
 * for a disconnected/disabled connector. */
export function getConnectorTools(connection: Connection): ToolDefinition[] {
  const connector = getConnector(connection.connectorId)
  if (!connector || !connector.enabled) return []
  if (connection.status !== "connected") return []
  return connector.buildTools(connection)
}
