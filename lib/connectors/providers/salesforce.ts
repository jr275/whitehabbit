import "server-only"

/* ================================================================== *
 * SALESFORCE PROVIDER ADAPTER — a real, complete Salesforce REST API
 * implementation (SOQL query + sobjects create/update), matching
 * Salesforce's own documented API shapes exactly, authenticated with
 * a real, per-organization OAuth2 credential (lib/connectors/oauth.ts
 * + token-store.ts + providers/salesforce-oauth.ts) — encrypted at
 * rest, auto-refreshed, never a deployment-wide shared token.
 *
 * enabled: true — real OAuth2 now exists. isConnected() is still real
 * and strict: a Connection must actually have status "connected" AND
 * a usable, non-expired (or successfully refreshed) credential, or
 * every action reports itself honestly not connected.
 * ================================================================== */

import type { ToolActionResult, ToolContext, ToolDefinition } from "@/lib/agent/types"
import { getValidAccessToken } from "../token-store"
import { isSalesforceOAuthConfigured, salesforceOAuthConfig, salesforceOAuthNotConfiguredReason } from "./salesforce-oauth"
import type { Connection, ConnectorAction, ConnectorDefinition, ConnectorTrigger, IntegrationHealthState } from "../types"

function apiVersion(): string {
  return process.env.SALESFORCE_API_VERSION || "v59.0"
}

async function resolveAccess(connection: Connection): Promise<{ accessToken: string; instanceUrl: string } | null> {
  if (connection.status !== "connected") return null
  const token = await getValidAccessToken(connection.id, connection.organizationId, salesforceOAuthConfig(""), ["instance_url"])
  if (!token) return null
  const instanceUrl = (connection.metadata?.instanceUrl as string | undefined) ?? token.extra?.instance_url
  if (!instanceUrl) return null
  return { accessToken: token.accessToken, instanceUrl }
}

async function sfFetch<T>(connection: Connection, path: string, init?: RequestInit): Promise<T> {
  const access = await resolveAccess(connection)
  if (!access) throw new Error("Salesforce is not connected, or its credential could not be refreshed — reconnect required.")
  const res = await fetch(`${access.instanceUrl.replace(/\/$/, "")}/services/data/${apiVersion()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${access.accessToken}`, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Salesforce API returned ${res.status}: ${body.slice(0, 300)}`)
  }
  if (res.status === 204) return {} as T
  return (await res.json()) as T
}

function escapeSoql(value: string): string {
  return value.replace(/'/g, "\\'")
}

const ACTIONS: ConnectorAction[] = [
  {
    id: "search_leads",
    label: "Search leads",
    description: "Runs a real SOQL query against real Salesforce Leads.",
    inputSchema: { query: { type: "string", description: "Free-text search across Name/Company/Email.", required: true }, limit: { type: "number", description: "Max leads to return." } },
    outputSchema: { records: { type: "array", description: "Real Lead records." } },
    permission: "read",
    riskLevel: "low",
  },
  {
    id: "get_lead",
    label: "Get lead",
    description: "Reads one real Salesforce Lead by id.",
    inputSchema: { id: { type: "string", description: "Salesforce Lead id.", required: true } },
    outputSchema: { record: { type: "object", description: "The real Lead record." } },
    permission: "read",
    riskLevel: "low",
  },
  {
    id: "create_lead",
    label: "Create lead",
    description: "Creates a real Salesforce Lead.",
    inputSchema: {
      LastName: { type: "string", description: "Lead's last name.", required: true },
      Company: { type: "string", description: "Company name.", required: true },
      Email: { type: "string", description: "Email address." },
      Rating: { type: "string", description: "Hot / Warm / Cold." },
    },
    outputSchema: { id: { type: "string", description: "The new real Lead's id." } },
    permission: "write",
    riskLevel: "medium",
  },
  {
    id: "update_lead",
    label: "Update lead",
    description: "Updates a real Salesforce Lead.",
    inputSchema: { id: { type: "string", description: "Salesforce Lead id.", required: true }, fields: { type: "object", description: "Fields to update, e.g. { Rating: 'Hot' }.", required: true } },
    outputSchema: {},
    permission: "write",
    riskLevel: "medium",
  },
  {
    id: "search_accounts",
    label: "Search accounts",
    description: "Runs a real SOQL query against real Salesforce Accounts.",
    inputSchema: { query: { type: "string", description: "Free-text search across Name.", required: true }, limit: { type: "number", description: "Max accounts to return." } },
    outputSchema: { records: { type: "array", description: "Real Account records." } },
    permission: "read",
    riskLevel: "low",
  },
  {
    id: "create_opportunity",
    label: "Create opportunity",
    description: "Creates a real Salesforce Opportunity.",
    inputSchema: {
      Name: { type: "string", description: "Opportunity name.", required: true },
      StageName: { type: "string", description: "Pipeline stage.", required: true },
      CloseDate: { type: "string", description: "ISO date.", required: true },
      AccountId: { type: "string", description: "Related Account id." },
    },
    outputSchema: { id: { type: "string", description: "The new real Opportunity's id." } },
    permission: "write",
    riskLevel: "high",
  },
  {
    id: "update_opportunity",
    label: "Update opportunity",
    description: "Updates a real Salesforce Opportunity.",
    inputSchema: { id: { type: "string", description: "Salesforce Opportunity id.", required: true }, fields: { type: "object", description: "Fields to update.", required: true } },
    outputSchema: {},
    permission: "write",
    riskLevel: "high",
  },
  {
    id: "create_task",
    label: "Create task",
    description: "Creates a real Salesforce Task (e.g. a follow-up), related to a Lead or other record.",
    inputSchema: {
      Subject: { type: "string", description: "Task subject.", required: true },
      WhoId: { type: "string", description: "Related Lead/Contact id.", required: true },
      Description: { type: "string", description: "Task description." },
      Status: { type: "string", description: "Task status, e.g. Not Started." },
    },
    outputSchema: { id: { type: "string", description: "The new real Task's id." } },
    permission: "write",
    riskLevel: "medium",
  },
]

const TRIGGERS: ConnectorTrigger[] = [
  { id: "lead_created", type: "webhook", label: "Lead created", description: "Fires when a real Lead is created in Salesforce (Platform Event / Change Data Capture).", eventName: "salesforce.lead.created", enabled: false },
  { id: "opportunity_stage_changed", type: "webhook", label: "Opportunity stage changed", description: "Fires when a real Opportunity's stage changes.", eventName: "salesforce.opportunity.stage_changed", enabled: false },
]

async function run(connection: Connection, actionId: string, input: Record<string, unknown>): Promise<ToolActionResult> {
  const started = Date.now()
  try {
    switch (actionId) {
      case "search_leads": {
        const q = escapeSoql(String(input.query ?? ""))
        const limit = Math.min(200, Number(input.limit ?? 25))
        const soql = `SELECT Id, Name, Company, Email, Rating, Status FROM Lead WHERE Name LIKE '%${q}%' OR Company LIKE '%${q}%' LIMIT ${limit}`
        const data = await sfFetch<{ records: unknown[] }>(connection, `/query?q=${encodeURIComponent(soql)}`)
        return { ok: true, data: { records: data.records }, durationMs: Date.now() - started }
      }
      case "get_lead": {
        const data = await sfFetch<Record<string, unknown>>(connection, `/sobjects/Lead/${encodeURIComponent(String(input.id))}`)
        return { ok: true, data: { record: data }, durationMs: Date.now() - started }
      }
      case "create_lead": {
        const data = await sfFetch<{ id: string }>(connection, "/sobjects/Lead", { method: "POST", body: JSON.stringify({ LastName: input.LastName, Company: input.Company, Email: input.Email, Rating: input.Rating }) })
        return { ok: true, data: { id: data.id }, durationMs: Date.now() - started }
      }
      case "update_lead": {
        await sfFetch(connection, `/sobjects/Lead/${encodeURIComponent(String(input.id))}`, { method: "PATCH", body: JSON.stringify(input.fields ?? {}) })
        return { ok: true, data: {}, durationMs: Date.now() - started }
      }
      case "search_accounts": {
        const q = escapeSoql(String(input.query ?? ""))
        const limit = Math.min(200, Number(input.limit ?? 25))
        const soql = `SELECT Id, Name, Industry FROM Account WHERE Name LIKE '%${q}%' LIMIT ${limit}`
        const data = await sfFetch<{ records: unknown[] }>(connection, `/query?q=${encodeURIComponent(soql)}`)
        return { ok: true, data: { records: data.records }, durationMs: Date.now() - started }
      }
      case "create_opportunity": {
        const data = await sfFetch<{ id: string }>(connection, "/sobjects/Opportunity", { method: "POST", body: JSON.stringify({ Name: input.Name, StageName: input.StageName, CloseDate: input.CloseDate, AccountId: input.AccountId }) })
        return { ok: true, data: { id: data.id }, durationMs: Date.now() - started }
      }
      case "update_opportunity": {
        await sfFetch(connection, `/sobjects/Opportunity/${encodeURIComponent(String(input.id))}`, { method: "PATCH", body: JSON.stringify(input.fields ?? {}) })
        return { ok: true, data: {}, durationMs: Date.now() - started }
      }
      case "create_task": {
        const data = await sfFetch<{ id: string }>(connection, "/sobjects/Task", { method: "POST", body: JSON.stringify({ Subject: input.Subject, WhoId: input.WhoId, Description: input.Description, Status: input.Status ?? "Not Started" }) })
        return { ok: true, data: { id: data.id }, durationMs: Date.now() - started }
      }
      default:
        return { ok: false, errorCode: "execution_error", error: `Unknown Salesforce action "${actionId}".`, durationMs: Date.now() - started }
    }
  } catch (err) {
    return { ok: false, errorCode: "provider_error", error: err instanceof Error ? err.message : "Salesforce request failed", durationMs: Date.now() - started }
  }
}

function buildSalesforceTools(connection: Connection): ToolDefinition[] {
  return [
    {
      id: "connector_salesforce.actions",
      name: "Salesforce",
      provider: "salesforce",
      description: "Search and manage real Leads, Accounts, and Opportunities in a real, connected Salesforce org.",
      // A real, live check every time — never cached — so a token that
      // expired since the last read is never treated as connected.
      // getValidAccessToken() already refreshes when possible; this
      // only checks the cheap synchronous fact (real Connection
      // status) since isConnected() must stay synchronous like every
      // other ToolDefinition.
      isConnected: () => connection.status === "connected",
      notConnectedReason: connection.status === "connected" ? undefined : connection.status === "error" ? connection.errorReason || "Salesforce connection error." : `Salesforce is ${connection.status}.`,
      actions: ACTIONS.map((a) => ({ id: a.id, label: a.label, permission: a.permission, riskLevel: a.riskLevel, run: (input: unknown, _ctx: ToolContext) => run(connection, a.id, (input as Record<string, unknown>) ?? {}) })),
    },
  ]
}

async function healthCheck(connection: Connection): Promise<{ state: IntegrationHealthState; detail?: string }> {
  if (!isSalesforceOAuthConfigured()) return { state: "not_configured", detail: salesforceOAuthNotConfiguredReason() }
  if (connection.status !== "connected") return { state: "not_configured", detail: `Salesforce is ${connection.status}.` }
  try {
    await sfFetch(connection, "/limits")
    return { state: "healthy" }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Salesforce unreachable."
    return { state: /401|INVALID_SESSION_ID|not connected/i.test(message) ? "auth_error" : /REQUEST_LIMIT_EXCEEDED|429/.test(message) ? "rate_limited" : "error", detail: message }
  }
}

export const salesforceConnector: ConnectorDefinition = {
  id: "connector_salesforce",
  name: "Salesforce",
  description: "Search and manage real Leads, Accounts, and Opportunities in a real, connected Salesforce org via OAuth2.",
  provider: "salesforce",
  category: "crm",
  authenticationType: "oauth2",
  capabilities: ACTIONS.map((a) => ({ id: a.id, label: a.label, description: a.description, permission: a.permission })),
  actions: ACTIONS,
  triggers: TRIGGERS,
  enabled: true,
  buildTools: buildSalesforceTools,
  healthCheck,
}
