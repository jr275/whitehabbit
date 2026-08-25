/* ================================================================== *
 * CONNECTOR FOUNDATION — types.
 *
 * A Connector is a STATIC, code-defined capability catalog — the same
 * pattern as lib/workforce/catalog.ts's SKILL_CATALOG/TOOL_CATALOG.
 * "Which connectors exist" is a fact about the deployed code, not
 * per-organization state, so it is never a database table.
 *
 * A Connection is the one genuinely per-organization, stateful fact:
 * "this org has connected (or attempted to connect) to this
 * Connector." That's real, mutable, must-persist state — the one new
 * database table this phase adds (see migrations/0002_connectors.sql).
 *
 * Nothing here is a second execution/permission system: a Connector's
 * tools are ordinary ToolDefinition objects (lib/agent/types.ts) and
 * go through the exact same tool-runner.ts / toolExecutionBoundary()
 * every native tool already goes through — see
 * lib/agent/tools/connector-tools.ts.
 * ================================================================== */

import type { ToolDefinition, ToolPermission } from "@/lib/agent/types"

export type ConnectorAuthType = "none" | "api_key" | "oauth2" | "service_account" | "mcp"

/** A capability is a named unit of what a Connector can do — the thing
 * a future OAuth scope request or MCP tool-discovery result maps onto.
 * Kept deliberately smaller than a full ToolDefinition: a capability
 * describes intent ("read Gmail messages"); the connector's
 * buildTools() turns enabled capabilities into real, executable
 * ToolDefinitions once a Connection exists. */
export interface ConnectorCapability {
  id: string
  label: string
  description: string
  /** Maps 1:1 onto the existing ToolPermission vocabulary
   * (lib/agent/types.ts / lib/workforce/model.ts's HIGH_RISK_PERMISSIONS)
   * — never a second permission taxonomy. */
  permission: ToolPermission
}

/** A real, code-defined connector — providers this system knows HOW to
 * connect to, whether or not any organization has actually connected
 * yet. Phase 1 registers exactly one: the internal test connector.
 * Google/Meta/Slack/etc. are added the same way in later phases —
 * this shape does not change. */
export interface ConnectorDefinition {
  id: string
  name: string
  description: string
  provider: string
  authenticationType: ConnectorAuthType
  capabilities: ConnectorCapability[]
  /** false = architecturally known but not yet implemented — the UI
   * must show "Authentication coming in a later phase" and must never
   * offer a Connect button that can't actually do anything. */
  enabled: boolean
  metadata?: Record<string, unknown>
  /** Builds this connector's REAL ToolDefinitions for one specific,
   * already-CONNECTED Connection. Never called for a disconnected
   * Connection — see lib/agent/tools/connector-tools.ts. Each
   * connector owns its own execution logic; the registry never
   * special-cases a provider by name. */
  buildTools: (connection: Connection) => ToolDefinition[]
}

/** Mirrors the vocabulary the product brief asked for; DISCONNECTED
 * and REVOKED are kept distinct (a user-initiated disconnect vs. the
 * provider itself invalidating access) even though both currently
 * resolve to the same "not usable" behavior — real audit/observability
 * value in keeping them apart, per section 12's event list. */
export type ConnectionStatus = "not_connected" | "connecting" | "connected" | "error" | "revoked" | "disconnected"

export const CONNECTION_STATUSES: ConnectionStatus[] = ["not_connected", "connecting", "connected", "error", "revoked", "disconnected"]

/** The org-scoped, persisted fact of a connection attempt/result.
 * Never holds a secret directly — `metadata` is for non-secret,
 * real, operator-visible facts only (e.g. which test fixture connected,
 * or later: which Google account email, which Slack workspace name).
 * A real OAuth token store is explicitly Phase 2+ scope (see the
 * report's Known Limitations) — this shape has a place for it
 * (`credentialRef`) without inventing a table for it now. */
export interface Connection {
  id: string
  organizationId: string
  connectorId: string
  status: ConnectionStatus
  authType: ConnectorAuthType
  /** The external system's own identifier for what got connected
   * (an email, a workspace id, a project id) — never a secret. */
  externalAccountId?: string
  displayName?: string
  /** Non-secret only. Enforced by convention here and by the API
   * layer never accepting a `metadata` key that looks like a secret
   * (see app/api/connections/route.ts). */
  metadata: Record<string, unknown>
  /** Opaque pointer to where a real credential would live once Phase 2
   * adds a secret store — never populated in Phase 1, never a token
   * itself. */
  credentialRef?: string
  errorReason?: string
  createdAt: number
  updatedAt: number
}
