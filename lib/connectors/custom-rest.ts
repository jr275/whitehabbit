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
import { readBoundedText, safeFetch } from "@/lib/security/safe-fetch"
import { UnsafeUrlError } from "@/lib/security/ssrf-guard"
import type { ConnectorAction, CustomConnector, CustomConnectorRestConfig } from "./types"

const DEFAULT_TIMEOUT_MS = 20_000

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

/** Real caller-supplied headers, minus anything that would collide
 * (case-insensitively) with the real resolved auth header — a Worker/
 * LLM-controlled input.headers must never be able to override or strip
 * the actual credential the system resolved (connector platform audit,
 * section 7). Object spread order alone was not a real guarantee; this
 * makes it an explicit one. */
function stripAuthCollisions(callerHeaders: Record<string, string> | undefined, authHeaders: Record<string, string>): Record<string, string> {
  if (!callerHeaders) return {}
  const authKeys = new Set(Object.keys(authHeaders).map((k) => k.toLowerCase()))
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(callerHeaders)) {
    if (authKeys.has(k.toLowerCase())) continue
    result[k] = v
  }
  return result
}

/** Real, minimal path-traversal guard — a "{id}" path param or the
 * generic "call" action's free-form path must never contain ".."
 * (connector platform audit, section 8): even though it can't cross to
 * a different HOST (the URL is always built by joining onto the
 * connector's own configured origin), it could otherwise resolve to a
 * different path than the declared action's template on the SAME host. */
function assertNoPathTraversal(path: string): void {
  if (path.includes("..")) throw new Error(`Path "${path}" is not allowed — ".." is never permitted in a custom connector request path.`)
}

async function callRest(row: CustomConnector, input: RestCallInput, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<ToolActionResult> {
  const started = Date.now()
  if (!isRestConfig(row.config)) return { ok: false, errorCode: "execution_error", error: "Not a REST connector.", durationMs: 0 }
  try {
    assertNoPathTraversal(input.path)
    const authHeaders = await resolveAuthHeaders(row)
    const base = new URL(row.config.baseUrl)
    const url = new URL(base.origin.replace(/\/$/, "") + (input.path.startsWith("/") ? input.path : `/${input.path}`))
    // Defensive, explicit check — the URL is always built by joining
    // onto base.origin above, so this can never actually fire today,
    // but a future refactor must not be able to silently regress this
    // into a host-override vector without a check catching it.
    if (url.origin !== base.origin) throw new Error(`Resolved URL origin "${url.origin}" does not match the connector's configured origin "${base.origin}".`)
    for (const [k, v] of Object.entries(input.query ?? {})) url.searchParams.set(k, v)

    const method = (input.method ?? "GET").toUpperCase()
    const callerHeaders = stripAuthCollisions(input.headers, authHeaders)
    const res = await safeFetch(url.toString(), {
      method,
      headers: { "content-type": "application/json", accept: "application/json", ...callerHeaders, ...authHeaders },
      body: method === "GET" || method === "DELETE" ? undefined : input.body != null ? JSON.stringify(input.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const durationMs = Date.now() - started
    const contentType = res.headers.get("content-type") ?? ""
    const bodyText = await readBoundedText(res).catch(() => "")
    const data = contentType.includes("application/json") ? (() => { try { return JSON.parse(bodyText) } catch { return null } })() : bodyText

    if (!res.ok) {
      return { ok: false, errorCode: res.status === 401 || res.status === 403 ? "invalid_credential" : "provider_error", error: `HTTP ${res.status}: ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`, durationMs, retryAfterMs: parseRetryAfter(res.headers.get("retry-after")) }
    }
    return { ok: true, data, durationMs }
  } catch (err) {
    // A blocked/unsafe URL is never a transient provider error — it
    // must never be retried, and must be classified distinctly from a
    // real network/provider failure.
    if (err instanceof UnsafeUrlError) {
      return { ok: false, errorCode: "execution_error", error: err.message, durationMs: Date.now() - started }
    }
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
      return callRest(row, { method, path, query, body: query ? undefined : remaining }, action.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    },
  }
}

export function buildCustomRestTools(row: CustomConnector): ToolDefinition[] {
  const connected = row.status === "connected" && isRestConfig(row.config)
  // The generic "call" action can issue ANY HTTP method — a fixed
  // permission/riskLevel here previously never reflected the real
  // method a given call actually used (connector platform audit, gap
  // #14, a real BLOCKER: a DELETE issued through this action was
  // classified identically to a GET). runToolAction() (lib/agent/tool-
  // runner.ts) reads permission/riskLevel from THIS static object
  // before the real input.method is even known — it has no per-call
  // classifier hook today (a real future architecture change: an
  // optional ToolAction.classify(input) the gate could consult; out of
  // scope for this pass). Until that exists, the only honest, safe
  // choice is the MOST conservative classification this action could
  // ever actually need — delete/high, the worst case
  // lib/connectors/http-risk.ts's deriveHttpRisk() ever produces for a
  // real HTTP method — so every call through this action, regardless
  // of method, gets at least that gate. This trades away "a GET through
  // 'call' never needs approval" for "a DELETE through 'call' can never
  // slip past the gate that matters" — the only direction this audit's
  // own rule ("only ever escalate risk, never downgrade it") allows.
  const genericAction: ToolAction = {
    id: "call",
    label: "Call endpoint",
    permission: "delete",
    riskLevel: "high",
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
