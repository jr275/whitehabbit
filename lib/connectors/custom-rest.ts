import "server-only"

/* ================================================================== *
 * CUSTOM REST CONNECTOR — section 14/16 of the connectivity platform
 * brief. Real, org-configured base URL + auth (api_key/bearer_token/
 * basic_auth, resolved from the same encrypted credential store every
 * other real credential in this system uses — lib/db/repo.ts's
 * getCustomConnectorCredential). Produces ordinary ToolDefinition
 * objects — goes through the exact same tool-runner/approval/retry
 * path as every native/OAuth2 connector tool, never a parallel
 * execution engine.
 *
 * Two kinds of action, both real:
 *   - a generic "call" action (method/path/headers/query/body) always
 *     available, for ad hoc use;
 *   - one real ToolAction per discovered ConnectorAction (from an
 *     OpenAPI import — lib/connectors/openapi-import.ts — or a
 *     hand-declared entry), each with its own real input schema.
 * ================================================================== */

import { getCustomConnectorCredential } from "@/lib/db/repo"
import type { ToolAction, ToolActionResult, ToolContext, ToolDefinition } from "@/lib/agent/types"
import type { ConnectorAction, CustomConnector, CustomConnectorRestConfig } from "./types"

function isRestConfig(config: CustomConnector["config"]): config is CustomConnectorRestConfig {
  return "baseUrl" in config
}

interface RestCallInput {
  method?: string
  path: string
  query?: Record<string, string>
  headers?: Record<string, string>
  body?: unknown
}

async function resolveAuthHeaders(row: CustomConnector): Promise<Record<string, string>> {
  if (!isRestConfig(row.config) || row.config.authType === "none") return {}
  const credential = await getCustomConnectorCredential(row.id, row.organizationId)
  if (!credential) return {}
  if (credential.type === "api_key" && isRestConfig(row.config)) {
    return { [row.config.apiKeyHeader || "X-API-Key"]: credential.value }
  }
  if (credential.type === "bearer_token") return { authorization: `Bearer ${credential.token}` }
  if (credential.type === "basic_auth") return { authorization: `Basic ${Buffer.from(`${credential.username}:${credential.password}`).toString("base64")}` }
  return {}
}

async function callRest(row: CustomConnector, input: RestCallInput): Promise<ToolActionResult> {
  const started = Date.now()
  if (!isRestConfig(row.config)) return { ok: false, errorCode: "execution_error", error: "Not a REST connector.", durationMs: 0 }
  try {
    const authHeaders = await resolveAuthHeaders(row)
    const url = new URL(row.config.baseUrl.replace(/\/$/, "") + (input.path.startsWith("/") ? input.path : `/${input.path}`))
    for (const [k, v] of Object.entries(input.query ?? {})) url.searchParams.set(k, v)

    const method = (input.method ?? "GET").toUpperCase()
    const res = await fetch(url.toString(), {
      method,
      headers: { "content-type": "application/json", accept: "application/json", ...authHeaders, ...(input.headers ?? {}) },
      body: method === "GET" || method === "DELETE" ? undefined : input.body != null ? JSON.stringify(input.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
    const durationMs = Date.now() - started
    const contentType = res.headers.get("content-type") ?? ""
    const data = contentType.includes("application/json") ? await res.json().catch(() => null) : await res.text()

    if (!res.ok) {
      return { ok: false, errorCode: res.status === 401 || res.status === 403 ? "invalid_credential" : "provider_error", error: `HTTP ${res.status}: ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`, durationMs, retryAfterMs: parseRetryAfter(res.headers.get("retry-after")) }
    }
    return { ok: true, data, durationMs }
  } catch (err) {
    return { ok: false, errorCode: "provider_error", error: err instanceof Error ? err.message : "Custom REST connector call failed.", durationMs: Date.now() - started }
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  return Number.isFinite(seconds) ? seconds * 1000 : undefined
}

/** Every discovered action gets a real, individually-invocable
 * ToolAction whose input is exactly the caller's declared fields
 * (never the raw method/path/query wrapper) — the httpMethod/httpPath
 * baked into the ConnectorAction itself supplies the rest. */
function actionToToolAction(row: CustomConnector, action: ConnectorAction): ToolAction {
  return {
    id: action.id,
    label: action.label,
    permission: action.permission,
    riskLevel: action.riskLevel,
    run: async (input: unknown, _ctx: ToolContext) => {
      const body = (input as Record<string, unknown>) ?? {}
      let path = action.httpPath ?? "/"
      const remaining: Record<string, unknown> = { ...body }
      // Real path-parameter substitution — {id} etc. — never left literal.
      path = path.replace(/\{(\w+)\}/g, (_, key) => {
        const v = remaining[key]
        delete remaining[key]
        return v != null ? encodeURIComponent(String(v)) : `{${key}}`
      })
      const method = action.httpMethod ?? "GET"
      const query = method === "GET" || method === "DELETE" ? (remaining as Record<string, string>) : undefined
      return callRest(row, { method, path, query, body: query ? undefined : remaining })
    },
  }
}

export function buildCustomRestTools(row: CustomConnector): ToolDefinition[] {
  const connected = row.status === "connected" && isRestConfig(row.config)
  const genericAction: ToolAction = {
    id: "call",
    label: "Call endpoint",
    permission: "write",
    riskLevel: "medium",
    run: (input: unknown, _ctx: ToolContext) => callRest(row, input as RestCallInput),
  }
  return [
    {
      id: `custom_${row.id}.actions`,
      name: row.name,
      provider: "custom-rest",
      description: row.description ?? `A custom REST connector at ${isRestConfig(row.config) ? row.config.baseUrl : "an unconfigured endpoint"}.`,
      isConnected: () => connected,
      notConnectedReason: connected ? undefined : `${row.name} is ${row.status}.`,
      actions: [genericAction, ...row.discoveredTools.map((a) => actionToToolAction(row, a))],
    },
  ]
}
