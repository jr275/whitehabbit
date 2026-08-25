/* ================================================================== *
 * CONNECTOR REGISTRY — the one place connectors are registered and
 * discovered. Same shape as lib/agent/skills/registry.ts and
 * lib/agent/tools/registry.ts: a static array + typed lookups. No
 * connector-specific logic belongs anywhere else — an API route or a
 * UI component asks this registry, never hardcodes a provider name.
 * ================================================================== */

import type { Connection, ConnectorCapability, ConnectorDefinition } from "./types"
import { testConnector } from "./test-connector"
import type { ToolDefinition } from "@/lib/agent/types"

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
    authenticationType: "oauth2",
    capabilities: [],
    enabled: false,
    buildTools: () => [],
  },
  {
    id: "connector_slack",
    name: "Slack",
    description: "Slack workspace integration. Not yet implemented — architecture only.",
    provider: "slack",
    authenticationType: "oauth2",
    capabilities: [],
    enabled: false,
    buildTools: () => [],
  },
]

export const CONNECTOR_REGISTRY: ConnectorDefinition[] = [testConnector, ...PLACEHOLDER_CONNECTORS]

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
