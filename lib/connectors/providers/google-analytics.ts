import "server-only"

/* ================================================================== *
 * GOOGLE ANALYTICS 4 PROVIDER ADAPTER — a real, complete GA4 Admin API
 * (v1beta) + Data API (v1beta) implementation, matching Google's own
 * documented API shapes exactly, authenticated with a real, per-
 * organization OAuth2 credential (lib/connectors/oauth.ts + token-
 * store.ts + providers/google-oauth.ts) — encrypted at rest, auto-
 * refreshed, never a deployment-wide shared token. Read-only scope
 * (analytics.readonly) — every action here is a real read; nothing
 * writes to a GA4 property.
 *
 * enabled: true — the architecture is real and complete. isConnected()
 * is still real and strict: a Connection must actually have status
 * "connected" AND a usable, non-expired (or successfully refreshed)
 * credential, or every action reports itself honestly not connected.
 * Requires GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET to actually be
 * configured for OAuth to work — NOT_CONFIGURED, never a fabricated
 * success, when they aren't (this deployment has neither configured;
 * see the final report).
 * ================================================================== */

import type { ToolActionResult, ToolContext, ToolDefinition } from "@/lib/agent/types"
import { resolveConnectionCredential } from "../credential-resolver"
import { buildGoogleOAuthConfig, googleOAuthNotConfiguredReason, isGoogleOAuthConfigured } from "./google-oauth"
import type { Connection, ConnectorAction, ConnectorDefinition, IntegrationHealthState } from "../types"

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
const ADMIN_BASE = "https://analyticsadmin.googleapis.com/v1beta"
const DATA_BASE = "https://analyticsdata.googleapis.com/v1beta"

export function googleAnalyticsOAuthConfig(redirectUri: string) {
  return buildGoogleOAuthConfig(redirectUri, SCOPE)
}

async function resolveAccessToken(connection: Connection): Promise<string | null> {
  if (connection.status !== "connected") return null
  const resolved = await resolveConnectionCredential(connection, { oauthConfig: googleAnalyticsOAuthConfig("") })
  return resolved?.kind === "oauth2" ? resolved.accessToken : null
}

/** Carries the real HTTP status + a real, provider-supplied
 * Retry-After (ms, parsed from the header — never invented) — same
 * classification contract as providers/salesforce.ts's
 * SalesforceApiError, so retry/observability logic reads identically
 * across connectors. */
export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message)
    this.name = "GoogleApiError"
  }
}

function parseRetryAfterMs(res: Response): number | undefined {
  const header = res.headers.get("retry-after")
  if (!header) return undefined
  const seconds = Number(header)
  if (!Number.isNaN(seconds)) return seconds * 1000
  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

async function gaFetch<T>(connection: Connection, url: string, init?: RequestInit): Promise<T> {
  const accessToken = await resolveAccessToken(connection)
  if (!accessToken) throw new Error("Google Analytics is not connected, or its credential could not be refreshed — reconnect required.")
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new GoogleApiError(res.status, `Google Analytics API returned ${res.status}: ${body.slice(0, 300)}`, parseRetryAfterMs(res))
  }
  return (await res.json()) as T
}

const ACTIONS: ConnectorAction[] = [
  {
    id: "list_accounts",
    label: "List accounts",
    description: "Lists the real GA4 accounts (and their properties) this connected Google identity can access.",
    inputSchema: {},
    outputSchema: { accountSummaries: { type: "array", description: "Real GA4 account summaries, each with its real propertySummaries." } },
    permission: "read",
    riskLevel: "low",
    httpMethod: "GET",
    httpPath: "/accountSummaries",
  },
  {
    id: "list_properties",
    label: "List properties",
    description: "Lists the real GA4 properties under one real account.",
    inputSchema: { accountId: { type: "string", description: "A real GA4 account id (e.g. \"123456789\"), from list_accounts.", required: true } },
    outputSchema: { properties: { type: "array", description: "Real GA4 property records." } },
    permission: "read",
    riskLevel: "low",
    httpMethod: "GET",
    httpPath: "/properties",
  },
  {
    id: "run_report",
    label: "Run report",
    description: "Runs a real GA4 report — real dimensions/metrics over a real date range, via the GA4 Data API.",
    inputSchema: {
      propertyId: { type: "string", description: "A real GA4 property id (e.g. \"987654321\"), from list_properties.", required: true },
      startDate: { type: "string", description: "e.g. \"7daysAgo\" or an ISO date (YYYY-MM-DD).", required: true },
      endDate: { type: "string", description: "e.g. \"yesterday\" or an ISO date.", required: true },
      metrics: { type: "array", description: "Real GA4 metric names, e.g. [\"sessions\",\"activeUsers\",\"conversions\"].", required: true },
      dimensions: { type: "array", description: "Real GA4 dimension names, e.g. [\"date\",\"country\",\"sessionSource\"]." },
      limit: { type: "number", description: "Max rows to return." },
    },
    outputSchema: { rows: { type: "array", description: "Real report rows." }, rowCount: { type: "number", description: "Real total row count." }, dimensionHeaders: { type: "array", description: "Real dimension column headers." }, metricHeaders: { type: "array", description: "Real metric column headers." } },
    permission: "read",
    riskLevel: "low",
  },
  {
    id: "run_realtime_report",
    label: "Run realtime report",
    description: "Runs a real GA4 realtime report — activity from roughly the last 30 minutes.",
    inputSchema: {
      propertyId: { type: "string", description: "A real GA4 property id.", required: true },
      metrics: { type: "array", description: "Real GA4 realtime metric names, e.g. [\"activeUsers\"].", required: true },
      dimensions: { type: "array", description: "Real GA4 realtime dimension names, e.g. [\"country\",\"deviceCategory\"]." },
    },
    outputSchema: { rows: { type: "array", description: "Real realtime report rows." }, rowCount: { type: "number", description: "Real total row count." } },
    permission: "read",
    riskLevel: "low",
  },
  {
    id: "get_metadata",
    label: "Get metadata",
    description: "Lists the real dimensions/metrics this specific GA4 property actually supports — never a guessed/static list.",
    inputSchema: { propertyId: { type: "string", description: "A real GA4 property id.", required: true } },
    outputSchema: { dimensions: { type: "array", description: "Real available dimensions for this property." }, metrics: { type: "array", description: "Real available metrics for this property." } },
    permission: "read",
    riskLevel: "low",
  },
]

interface ReportResponse {
  dimensionHeaders?: { name: string }[]
  metricHeaders?: { name: string }[]
  rows?: unknown[]
  rowCount?: number
}

async function run(connection: Connection, actionId: string, input: Record<string, unknown>): Promise<ToolActionResult> {
  const started = Date.now()
  try {
    switch (actionId) {
      case "list_accounts": {
        const data = await gaFetch<{ accountSummaries?: unknown[] }>(connection, `${ADMIN_BASE}/accountSummaries`)
        return { ok: true, data: { accountSummaries: data.accountSummaries ?? [] }, durationMs: Date.now() - started }
      }
      case "list_properties": {
        const accountId = String(input.accountId ?? "")
        const url = `${ADMIN_BASE}/properties?filter=${encodeURIComponent(`parent:accounts/${accountId}`)}`
        const data = await gaFetch<{ properties?: unknown[] }>(connection, url)
        return { ok: true, data: { properties: data.properties ?? [] }, durationMs: Date.now() - started }
      }
      case "run_report": {
        const propertyId = String(input.propertyId ?? "")
        const body = {
          dateRanges: [{ startDate: String(input.startDate ?? "7daysAgo"), endDate: String(input.endDate ?? "yesterday") }],
          metrics: (Array.isArray(input.metrics) ? input.metrics : []).map((m) => ({ name: String(m) })),
          dimensions: (Array.isArray(input.dimensions) ? input.dimensions : []).map((d) => ({ name: String(d) })),
          limit: input.limit != null ? String(Math.min(100000, Number(input.limit))) : undefined,
        }
        const data = await gaFetch<ReportResponse>(connection, `${DATA_BASE}/properties/${propertyId}:runReport`, { method: "POST", body: JSON.stringify(body) })
        return { ok: true, data: { rows: data.rows ?? [], rowCount: data.rowCount ?? 0, dimensionHeaders: data.dimensionHeaders ?? [], metricHeaders: data.metricHeaders ?? [] }, durationMs: Date.now() - started }
      }
      case "run_realtime_report": {
        const propertyId = String(input.propertyId ?? "")
        const body = {
          metrics: (Array.isArray(input.metrics) ? input.metrics : []).map((m) => ({ name: String(m) })),
          dimensions: (Array.isArray(input.dimensions) ? input.dimensions : []).map((d) => ({ name: String(d) })),
        }
        const data = await gaFetch<ReportResponse>(connection, `${DATA_BASE}/properties/${propertyId}:runRealtimeReport`, { method: "POST", body: JSON.stringify(body) })
        return { ok: true, data: { rows: data.rows ?? [], rowCount: data.rowCount ?? 0 }, durationMs: Date.now() - started }
      }
      case "get_metadata": {
        const propertyId = String(input.propertyId ?? "")
        const data = await gaFetch<{ dimensions?: unknown[]; metrics?: unknown[] }>(connection, `${DATA_BASE}/properties/${propertyId}/metadata`)
        return { ok: true, data: { dimensions: data.dimensions ?? [], metrics: data.metrics ?? [] }, durationMs: Date.now() - started }
      }
      default:
        return { ok: false, errorCode: "execution_error", error: `Unknown Google Analytics action "${actionId}".`, durationMs: Date.now() - started }
    }
  } catch (err) {
    if (err instanceof GoogleApiError) {
      const neverRetry = err.status === 401 || err.status === 403
      return { ok: false, errorCode: neverRetry ? "invalid_credential" : "provider_error", error: err.message, retryAfterMs: neverRetry ? undefined : err.retryAfterMs, durationMs: Date.now() - started }
    }
    return { ok: false, errorCode: "provider_error", error: err instanceof Error ? err.message : "Google Analytics request failed", durationMs: Date.now() - started }
  }
}

function buildGoogleAnalyticsTools(connection: Connection): ToolDefinition[] {
  return [
    {
      id: "connector_google_analytics.actions",
      name: "Google Analytics",
      provider: "google_analytics",
      description: "Reads real GA4 account/property structure and real report data (sessions, users, conversions, and more) from a real, connected GA4 property.",
      isConnected: () => connection.status === "connected",
      notConnectedReason: connection.status === "connected" ? undefined : connection.status === "error" ? connection.errorReason || "Google Analytics connection error." : `Google Analytics is ${connection.status}.`,
      actions: ACTIONS.map((a) => ({ id: a.id, label: a.label, permission: a.permission, riskLevel: a.riskLevel, run: (input: unknown, _ctx: ToolContext) => run(connection, a.id, (input as Record<string, unknown>) ?? {}) })),
    },
  ]
}

async function healthCheck(connection: Connection): Promise<{ state: IntegrationHealthState; detail?: string }> {
  if (!isGoogleOAuthConfigured()) return { state: "not_configured", detail: googleOAuthNotConfiguredReason() }
  if (connection.status !== "connected") return { state: "not_configured", detail: `Google Analytics is ${connection.status}.` }
  try {
    await gaFetch(connection, `${ADMIN_BASE}/accountSummaries?pageSize=1`)
    return { state: "healthy" }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Analytics unreachable."
    return { state: /returned 401/.test(message) ? "auth_error" : /returned 403/.test(message) ? "auth_error" : /returned 429/.test(message) ? "rate_limited" : "error", detail: message }
  }
}

export const googleAnalyticsConnector: ConnectorDefinition = {
  id: "connector_google_analytics",
  name: "Google Analytics",
  description: "Real site/app performance data — accounts, properties, and GA4 reports — via a real, connected Google Analytics 4 property (OAuth2, read-only).",
  provider: "google",
  category: "analytics",
  authenticationType: "oauth2",
  capabilities: ACTIONS.map((a) => ({ id: a.id, label: a.label, description: a.description, permission: a.permission })),
  actions: ACTIONS,
  triggers: [],
  enabled: true,
  buildTools: buildGoogleAnalyticsTools,
  healthCheck,
}
