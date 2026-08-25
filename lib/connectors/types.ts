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

import type { RiskLevel, ToolDefinition, ToolPermission } from "@/lib/agent/types"

export type ConnectorAuthType = "none" | "api_key" | "oauth2" | "service_account" | "bearer_token" | "webhook" | "mcp"

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

/** A minimal, dependency-free JSON-Schema-shaped field description —
 * enough to validate a real action's input/output without adding a
 * new schema-validation library. `required` lives on the field itself
 * (not a separate array) so a field's own description stays next to
 * whether it's required, matching SkillInputField's existing shape
 * (lib/agent/types.ts) rather than inventing a second convention. */
export interface ConnectorSchemaField {
  type: "string" | "number" | "boolean" | "array" | "object"
  description: string
  required?: boolean
  /** For type "array"/"object" only — real nested shape, never left
   * implicit. Optional: a field can stay untyped-inside (e.g. a
   * provider's own opaque JSON) without inventing a fake shape for it. */
  properties?: Record<string, ConnectorSchemaField>
}

export type ConnectorSchema = Record<string, ConnectorSchemaField>

/** A typed, executable unit of what a Connector can do — the richer
 * sibling of ConnectorCapability. Every real provider manifest (Slack,
 * Salesforce, ...) declares its actions here with a real input/output
 * shape matching that provider's own documented API — never a vague
 * capability label. A connector's buildTools() still produces the
 * actual executable ToolDefinition/ToolAction (lib/agent/types.ts);
 * `actions` is the typed manifest that ToolDefinition is built from,
 * kept separate so the Integration Studio can render/validate a real
 * schema without importing server-only execution code. */
export interface ConnectorAction {
  id: string
  label: string
  description: string
  inputSchema: ConnectorSchema
  outputSchema: ConnectorSchema
  permission: ToolPermission
  riskLevel: RiskLevel
  /** Real-time call budget in ms, when the adapter enforces one beyond
   * the shared default (see each provider adapter's own fetch call,
   * e.g. AbortSignal.timeout(...)) — declarative documentation of an
   * enforced value, never a second timeout mechanism. */
  timeoutMs?: number
  /** The exact same RetryPolicy shape lib/agent/retry.ts's withRetry()
   * already takes — declaring it here documents what an action's own
   * adapter passes to that shared function, never a parallel retry
   * implementation. Omitted when an action isn't retried (e.g. a
   * write the caller must not silently repeat). */
  retryPolicy?: { maxRetries: number; baseDelayMs: number; maxDelayMs: number }
  /** Requests/min this provider is documented to allow, when known —
   * informational (surfaced in Studio/the connector marketplace), not
   * yet a second enforced limiter; a provider's own 429 + Retry-After
   * is what the real retry policy above actually reacts to. */
  rateLimit?: { requestsPerMinute?: number; concurrency?: number }
  /** Whether calling this action twice with the same input is safe to
   * treat as a no-op repeat — mirrors the real idempotency ledger
   * (action_executions, lib/agent/pipeline/idempotency.ts) semantics
   * a resumable skill already relies on for its own actions; a plain
   * (non-pipeline) action reads this as documentation only today. */
  idempotencySupported?: boolean
  /** This action's own revision, independent of the connector's
   * overall `version` (ConnectorDefinition) — bumps when its real
   * input/output shape changes, so a persisted reference (e.g. a
   * generated-from-OpenAPI action) can detect drift against a
   * re-imported spec. */
  version?: string
  /** Set only for a Custom REST Connector action (lib/connectors/
   * custom-rest.ts) — the real HTTP method + path template (e.g.
   * "/v1/leads/{id}") this action calls against its connector's
   * configured base URL, generated from an OpenAPI operation
   * (lib/connectors/openapi-import.ts) or hand-declared. Absent for
   * every native/OAuth2 connector action, which owns its own request
   * logic directly. */
  httpMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  httpPath?: string
}

/** How this Connector can notify WhiteHabbit that something happened,
 * independent of any Worker actively calling an action — section 5.
 * `enabled` mirrors ConnectorDefinition's own honesty rule: a trigger
 * that isn't real yet is still named (so the full intended surface is
 * visible) but never offered as something a user can actually turn on. */
export interface ConnectorTrigger {
  id: string
  type: "webhook" | "polling" | "schedule" | "event"
  label: string
  description: string
  /** e.g. "salesforce.lead.created", "slack.message.received" —
   * the real event-name vocabulary this trigger fires under, once a
   * real subscription exists. */
  eventName: string
  enabled: boolean
}

/** A real, code-defined connector — providers this system knows HOW to
 * connect to, whether or not any organization has actually connected
 * yet. Phase 1 registered exactly one: the internal test connector.
 * Google/Meta/Slack/etc. are added the same way in later phases —
 * this shape does not change. */
export interface ConnectorDefinition {
  id: string
  name: string
  description: string
  provider: string
  category?: string
  authenticationType: ConnectorAuthType
  capabilities: ConnectorCapability[]
  /** The typed action/trigger manifest (section 4/5) — optional so
   * every existing connector (which only ever declared `capabilities`)
   * keeps compiling unchanged; a new connector should declare these
   * instead of/alongside capabilities. Real for every connector that
   * has them declared here, even when `enabled` is false — the action
   * SHAPE is real (matches that provider's own documented API) even
   * though there is no credential to actually call it yet. */
  actions?: ConnectorAction[]
  triggers?: ConnectorTrigger[]
  /** false = architecturally known but not yet implemented — the UI
   * must show "Authentication coming in a later phase" and must never
   * offer a Connect button that can't actually do anything. */
  enabled: boolean
  /** This connector definition's own revision — informational, bumped
   * when its real action/trigger shape changes. Distinct from each
   * ConnectorAction's own optional `version`. */
  version?: string
  metadata?: Record<string, unknown>
  /** Builds this connector's REAL ToolDefinitions for one specific,
   * already-CONNECTED Connection. Never called for a disconnected
   * Connection — see lib/agent/tools/connector-tools.ts. Each
   * connector owns its own execution logic; the registry never
   * special-cases a provider by name. */
  buildTools: (connection: Connection) => ToolDefinition[]
  /** A real, live check of this specific connector's reachability —
   * beyond "is a Connection row marked connected" (which can go stale:
   * a revoked OAuth token, a rate limit, a provider outage). Optional:
   * a connector with no real way to cheaply health-check itself (the
   * internal test connector, most disabled placeholders) omits this
   * and is reported from Connection.status alone — never a fabricated
   * live check. */
  healthCheck?: (connection: Connection) => Promise<{ state: IntegrationHealthState; detail?: string }>
}

/** Richer than the LLM/intelligence ProviderHealth's HealthState
 * (app/api/system/health/route.ts) — a real external integration has
 * failure modes those providers don't need to distinguish: an
 * authenticated-but-now-invalid credential is different from a
 * healthy-but-currently-rate-limited one, and both are different from
 * "never configured at all". */
export type IntegrationHealthState = "healthy" | "degraded" | "not_configured" | "auth_error" | "rate_limited" | "error"

/** Mirrors the vocabulary the product brief asked for; DISCONNECTED
 * and REVOKED are kept distinct (a user-initiated disconnect vs. the
 * provider itself invalidating access) even though both currently
 * resolve to the same "not usable" behavior — real audit/observability
 * value in keeping them apart, per section 12's event list.
 *
 * REAUTH_REQUIRED is real and wired: lib/connectors/token-store.ts's
 * getValidAccessToken() sets it in the two cases that genuinely mean
 * "an operator must reconnect" — no refresh token available, or a real
 * refresh attempt was rejected by the provider — replacing what used
 * to be a generic "error" for those two specific, actionable cases.
 *
 * EXPIRED is declared for completeness (connector platform audit,
 * gap #4) but deliberately NOT set by any code path yet: a token's
 * real expiresAt lives only in the encrypted oauth_credentials row,
 * never surfaced on the Connection object any API response returns —
 * proactively computing/displaying "expired" (as opposed to the
 * REAUTH_REQUIRED the system already detects reactively, the moment a
 * call actually needs the token) would need that expiry timestamp
 * exposed first. Never fabricate a state nothing can actually observe. */
export type ConnectionStatus = "not_connected" | "connecting" | "connected" | "expired" | "reauth_required" | "error" | "revoked" | "disconnected"

export const CONNECTION_STATUSES: ConnectionStatus[] = ["not_connected", "connecting", "connected", "expired", "reauth_required", "error", "revoked", "disconnected"]

/* ================================================================== *
 * DYNAMIC CONNECTORS — section 4/11/14: MCP servers and Custom REST
 * Connectors an organization adds itself, rather than a provider this
 * deployment's own code defines ahead of time. A CustomConnector row
 * (migrations/0010_custom_connectors.sql) is real, per-organization,
 * mutable state — same category of fact Connection already is — and
 * lib/connectors/dynamic.ts turns each row into an ordinary
 * ConnectorDefinition at request time, merged alongside the static
 * CONNECTOR_REGISTRY everywhere connectors are resolved. Nothing
 * downstream needs a second code path for "dynamic" vs. "static".
 * ================================================================== */

export type CustomConnectorKind = "mcp" | "rest"
export type CustomConnectorStatus = "not_connected" | "connected" | "error"

export interface CustomConnectorRestConfig {
  baseUrl: string
  authType: "none" | "api_key" | "bearer_token" | "basic_auth"
  /** For api_key auth: which header carries it (e.g. "X-API-Key").
   * Never the key's own value — that lives only in the encrypted
   * credential, resolved at call time. */
  apiKeyHeader?: string
}

export interface CustomConnectorMcpConfig {
  endpointUrl: string
}

export interface CustomConnector {
  id: string
  organizationId: string
  kind: CustomConnectorKind
  name: string
  description?: string
  config: CustomConnectorRestConfig | CustomConnectorMcpConfig
  /** Real, cached discovery/import result — MCP tool descriptors, or
   * ConnectorAction entries generated from an OpenAPI import
   * (lib/connectors/openapi-import.ts). Never hand-authored per row;
   * always the output of a real discovery/parse step. */
  discoveredTools: ConnectorAction[]
  status: CustomConnectorStatus
  errorReason?: string
  createdAt: number
  updatedAt: number
}

/** The one flexible credential shape every custom-connector authType
 * maps onto — encrypted as a single JSON blob (see the migration's
 * header comment), never a secret in `config` or any API response. */
export type CustomConnectorCredential = { type: "api_key"; value: string } | { type: "bearer_token"; token: string } | { type: "basic_auth"; username: string; password: string } | { type: "mcp_bearer"; token: string }

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
  /** Real, persisted health tracking (section 23) — distinct from a
   * live healthCheck() call: these are facts about the LAST real
   * check/call, recorded by lib/db/repo.ts's recordConnectionHealth(),
   * called from POST /api/connections/[id]/test (an explicit check)
   * and opportunistically after every real connector tool call
   * (lib/connectors/registry.ts's getConnectorTools() wrapping). Never
   * inferred from credentials merely existing. */
  lastCheckedAt?: number
  lastSuccessAt?: number
  lastErrorAt?: number
  lastErrorCode?: string
  lastLatencyMs?: number
}
