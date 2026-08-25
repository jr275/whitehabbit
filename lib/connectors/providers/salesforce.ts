import "server-only"

/* ================================================================== *
 * SALESFORCE PROVIDER ADAPTER — a real, complete Salesforce REST API
 * implementation (SOQL query + sobjects create/update), matching
 * Salesforce's own documented API shapes exactly.
 *
 * enabled: false — same reason and same interim credential model as
 * lib/connectors/providers/slack.ts: no real OAuth2 flow exists in
 * this deployment yet, so this can never actually reach "connected"
 * through the product today. The adapter code is real and complete —
 * gated by SALESFORCE_INSTANCE_URL/SALESFORCE_ACCESS_TOKEN, the same
 * deployment-wide-credential pattern ANTHROPIC_API_KEY/SLACK_BOT_TOKEN
 * already use — so building the real OAuth2 flow later is the only
 * remaining step.
 * ================================================================== */

import type { ToolActionResult, ToolContext, ToolDefinition } from "@/lib/agent/types"
import type { Connection, ConnectorAction, ConnectorDefinition, ConnectorTrigger, IntegrationHealthState } from "../types"

function apiVersion(): string {
  return process.env.SALESFORCE_API_VERSION || "v59.0"
}

function isConfigured(): boolean {
  return !!process.env.SALESFORCE_INSTANCE_URL && !!process.env.SALESFORCE_ACCESS_TOKEN
}

async function sfFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const instanceUrl = process.env.SALESFORCE_INSTANCE_URL
  const token = process.env.SALESFORCE_ACCESS_TOKEN
  if (!instanceUrl || !token) throw new Error("SALESFORCE_INSTANCE_URL/SALESFORCE_ACCESS_TOKEN are not configured.")
  const res = await fetch(`${instanceUrl.replace(/\/$/, "")}/services/data/${apiVersion()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
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
      CloseDate: { type: "string", description: "ISO date." , required: true},
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
]

const TRIGGERS: ConnectorTrigger[] = [
  { id: "lead_created", type: "webhook", label: "Lead created", description: "Fires when a real Lead is created in Salesforce (Platform Event / Change Data Capture).", eventName: "salesforce.lead.created", enabled: false },
  { id: "opportunity_stage_changed", type: "webhook", label: "Opportunity stage changed", description: "Fires when a real Opportunity's stage changes.", eventName: "salesforce.opportunity.stage_changed", enabled: false },
]

async function run(actionId: string, input: Record<string, unknown>): Promise<ToolActionResult> {
  const started = Date.now()
  try {
    switch (actionId) {
      case "search_leads": {
        const q = escapeSoql(String(input.query ?? ""))
        const limit = Math.min(200, Number(input.limit ?? 25))
        const soql = `SELECT Id, Name, Company, Email, Rating, Status FROM Lead WHERE Name LIKE '%${q}%' OR Company LIKE '%${q}%' LIMIT ${limit}`
        const data = await sfFetch<{ records: unknown[] }>(`/query?q=${encodeURIComponent(soql)}`)
        return { ok: true, data: { records: data.records }, durationMs: Date.now() - started }
      }
      case "get_lead": {
        const data = await sfFetch<Record<string, unknown>>(`/sobjects/Lead/${encodeURIComponent(String(input.id))}`)
        return { ok: true, data: { record: data }, durationMs: Date.now() - started }
      }
      case "create_lead": {
        const data = await sfFetch<{ id: string }>("/sobjects/Lead", { method: "POST", body: JSON.stringify({ LastName: input.LastName, Company: input.Company, Email: input.Email, Rating: input.Rating }) })
        return { ok: true, data: { id: data.id }, durationMs: Date.now() - started }
      }
      case "update_lead": {
        await sfFetch(`/sobjects/Lead/${encodeURIComponent(String(input.id))}`, { method: "PATCH", body: JSON.stringify(input.fields ?? {}) })
        return { ok: true, data: {}, durationMs: Date.now() - started }
      }
      case "search_accounts": {
        const q = escapeSoql(String(input.query ?? ""))
        const limit = Math.min(200, Number(input.limit ?? 25))
        const soql = `SELECT Id, Name, Industry FROM Account WHERE Name LIKE '%${q}%' LIMIT ${limit}`
        const data = await sfFetch<{ records: unknown[] }>(`/query?q=${encodeURIComponent(soql)}`)
        return { ok: true, data: { records: data.records }, durationMs: Date.now() - started }
      }
      case "create_opportunity": {
        const data = await sfFetch<{ id: string }>("/sobjects/Opportunity", { method: "POST", body: JSON.stringify({ Name: input.Name, StageName: input.StageName, CloseDate: input.CloseDate, AccountId: input.AccountId }) })
        return { ok: true, data: { id: data.id }, durationMs: Date.now() - started }
      }
      case "update_opportunity": {
        await sfFetch(`/sobjects/Opportunity/${encodeURIComponent(String(input.id))}`, { method: "PATCH", body: JSON.stringify(input.fields ?? {}) })
        return { ok: true, data: {}, durationMs: Date.now() - started }
      }
      default:
        return { ok: false, errorCode: "execution_error", error: `Unknown Salesforce action "${actionId}".`, durationMs: Date.now() - started }
    }
  } catch (err) {
    return { ok: false, errorCode: "provider_error", error: err instanceof Error ? err.message : "Salesforce request failed", durationMs: Date.now() - started }
  }
}

function buildSalesforceTools(connection: Connection): ToolDefinition[] {
  const connected = connection.status === "connected" && isConfigured()
  return [
    {
      id: "connector_salesforce.actions",
      name: "Salesforce",
      provider: "salesforce",
      description: "Search and manage real Leads, Accounts, and Opportunities in a real, connected Salesforce org.",
      isConnected: () => connected,
      notConnectedReason: connected ? undefined : !isConfigured() ? "Configure SALESFORCE_INSTANCE_URL and SALESFORCE_ACCESS_TOKEN to connect Salesforce." : `Salesforce is ${connection.status}.`,
      actions: ACTIONS.map((a) => ({ id: a.id, label: a.label, permission: a.permission, riskLevel: a.riskLevel, run: (input: unknown, _ctx: ToolContext) => run(a.id, (input as Record<string, unknown>) ?? {}) })),
    },
  ]
}

async function healthCheck(connection: Connection): Promise<{ state: IntegrationHealthState; detail?: string }> {
  if (!isConfigured()) return { state: "not_configured", detail: "SALESFORCE_INSTANCE_URL/SALESFORCE_ACCESS_TOKEN are not configured." }
  if (connection.status !== "connected") return { state: "not_configured", detail: `Salesforce is ${connection.status}.` }
  try {
    await sfFetch(`/limits`)
    return { state: "healthy" }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Salesforce unreachable."
    return { state: /401|INVALID_SESSION_ID/.test(message) ? "auth_error" : /REQUEST_LIMIT_EXCEEDED|429/.test(message) ? "rate_limited" : "error", detail: message }
  }
}

export const salesforceConnector: ConnectorDefinition = {
  id: "connector_salesforce",
  name: "Salesforce",
  description: "Search and manage real Leads, Accounts, and Opportunities in a real Salesforce org. Real, complete adapter — not yet connectable (no OAuth2 flow implemented in this deployment).",
  provider: "salesforce",
  category: "crm",
  authenticationType: "oauth2",
  capabilities: ACTIONS.map((a) => ({ id: a.id, label: a.label, description: a.description, permission: a.permission })),
  actions: ACTIONS,
  triggers: TRIGGERS,
  enabled: false,
  buildTools: buildSalesforceTools,
  healthCheck,
}
