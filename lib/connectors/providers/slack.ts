import "server-only"

/* ================================================================== *
 * SLACK PROVIDER ADAPTER — a real, complete Slack Web API
 * implementation (chat.postMessage, conversations.list, conversations.
 * history), matching Slack's own documented API shapes exactly.
 *
 * enabled: true — the real, generic OAuth2 engine (lib/connectors/
 * oauth-flow.ts + lib/connectors/oauth-providers.ts's registry, the
 * same shared code Salesforce uses) now makes this connectable: a
 * real Connection is created via GET /api/connectors/connector_slack/
 * authorize -> Slack's real consent screen -> GET .../callback, with
 * a real per-organization encrypted OAuth token (lib/connectors/
 * token-store.ts) — no longer the interim deployment-wide
 * SLACK_BOT_TOKEN model. That env var is still honored as a fallback
 * connectivity check only when no OAuth token exists for this
 * Connection (a real, single-tenant escape hatch for local dev/
 * testing without running the full OAuth flow), never silently
 * preferred over a real per-org token. Requires SLACK_CLIENT_ID/
 * SLACK_CLIENT_SECRET to actually be configured for OAuth to work —
 * NOT_CONFIGURED, never a fabricated success, when they aren't.
 * ================================================================== */

import type { ToolActionResult, ToolContext, ToolDefinition } from "@/lib/agent/types"
import { resolveConnectionCredential } from "../credential-resolver"
import { isSlackOAuthConfigured, slackOAuthConfig } from "./slack-oauth"
import type { Connection, ConnectorAction, ConnectorDefinition, ConnectorTrigger, IntegrationHealthState } from "../types"

const API_BASE = "https://slack.com/api"

function isConfigured(): boolean {
  return isSlackOAuthConfigured() || !!process.env.SLACK_BOT_TOKEN
}

/** Real per-organization OAuth token first (via the one authoritative
 * credential-resolution boundary, lib/connectors/credential-resolver.ts
 * — encrypted, auto-refreshed); SLACK_BOT_TOKEN only as a real,
 * deployment-wide fallback when this specific Connection has no OAuth
 * credential of its own yet — never silently preferred over a real
 * per-org token when one exists. */
async function resolveAccessToken(connection: Connection): Promise<string | null> {
  if (connection.status === "connected") {
    const resolved = await resolveConnectionCredential(connection, { oauthConfig: slackOAuthConfig("") })
    if (resolved?.kind === "oauth2") return resolved.accessToken
  }
  return process.env.SLACK_BOT_TOKEN || null
}

async function slackCall<T>(accessToken: string, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await res.json()) as { ok: boolean; error?: string } & T
  if (!json.ok) throw new Error(json.error || `Slack ${method} failed.`)
  return json
}

const ACTIONS: ConnectorAction[] = [
  {
    id: "send_message",
    label: "Send message",
    description: "Posts a real message to a real Slack channel.",
    inputSchema: {
      channel: { type: "string", description: "Channel id or name, e.g. #marketing.", required: true },
      text: { type: "string", description: "Message text.", required: true },
      thread_ts: { type: "string", description: "Reply in this thread, if set." },
    },
    outputSchema: {
      ok: { type: "boolean", description: "Whether Slack accepted the message." },
      ts: { type: "string", description: "The new message's real timestamp id." },
      channel: { type: "string", description: "The real channel id the message was posted to." },
    },
    permission: "external_communication",
    riskLevel: "medium",
  },
  {
    id: "list_channels",
    label: "List channels",
    description: "Lists real channels in the connected Slack workspace.",
    inputSchema: { limit: { type: "number", description: "Max channels to return." } },
    outputSchema: { channels: { type: "array", description: "Real channel objects (id, name, is_private, ...)." } },
    permission: "read",
    riskLevel: "low",
  },
  {
    id: "get_channel_history",
    label: "Get channel history",
    description: "Reads real recent messages from a real Slack channel.",
    inputSchema: {
      channel: { type: "string", description: "Channel id.", required: true },
      limit: { type: "number", description: "Max messages to return." },
    },
    outputSchema: { messages: { type: "array", description: "Real message objects." } },
    permission: "read",
    riskLevel: "low",
  },
]

const TRIGGERS: ConnectorTrigger[] = [
  {
    id: "message_received",
    type: "webhook",
    label: "Message received",
    description: "Fires when a real message is posted in a subscribed Slack channel (Slack Events API).",
    eventName: "slack.message.received",
    enabled: false,
  },
]

async function run(connection: Connection, actionId: string, input: Record<string, unknown>): Promise<ToolActionResult> {
  const started = Date.now()
  const accessToken = await resolveAccessToken(connection)
  if (!accessToken) return { ok: false, errorCode: "invalid_credential", error: "No usable Slack credential for this connection.", durationMs: Date.now() - started }
  try {
    if (actionId === "send_message") {
      const data = await slackCall<{ ts: string; channel: string }>(accessToken, "chat.postMessage", { channel: input.channel, text: input.text, thread_ts: input.thread_ts })
      return { ok: true, data: { ok: true, ts: data.ts, channel: data.channel }, durationMs: Date.now() - started }
    }
    if (actionId === "list_channels") {
      const data = await slackCall<{ channels: unknown[] }>(accessToken, "conversations.list", { limit: input.limit ?? 100 })
      return { ok: true, data: { channels: data.channels }, durationMs: Date.now() - started }
    }
    if (actionId === "get_channel_history") {
      const data = await slackCall<{ messages: unknown[] }>(accessToken, "conversations.history", { channel: input.channel, limit: input.limit ?? 20 })
      return { ok: true, data: { messages: data.messages }, durationMs: Date.now() - started }
    }
    return { ok: false, errorCode: "execution_error", error: `Unknown Slack action "${actionId}".`, durationMs: Date.now() - started }
  } catch (err) {
    return { ok: false, errorCode: "provider_error", error: err instanceof Error ? err.message : "Slack request failed", durationMs: Date.now() - started }
  }
}

function buildSlackTools(connection: Connection): ToolDefinition[] {
  const connected = connection.status === "connected" && isConfigured()
  return [
    {
      id: "connector_slack.actions",
      name: "Slack",
      provider: "slack",
      description: "Send messages, list channels, and read channel history in a real, connected Slack workspace.",
      isConnected: () => connected,
      notConnectedReason: connected ? undefined : !isConfigured() ? "Configure SLACK_CLIENT_ID/SLACK_CLIENT_SECRET (or SLACK_BOT_TOKEN) to connect Slack." : `Slack is ${connection.status}.`,
      actions: ACTIONS.map((a) => ({ id: a.id, label: a.label, permission: a.permission, riskLevel: a.riskLevel, run: (input: unknown, _ctx: ToolContext) => run(connection, a.id, (input as Record<string, unknown>) ?? {}) })),
    },
  ]
}

async function healthCheck(connection: Connection): Promise<{ state: IntegrationHealthState; detail?: string }> {
  if (!isConfigured()) return { state: "not_configured", detail: "Slack OAuth (or SLACK_BOT_TOKEN) is not configured." }
  if (connection.status !== "connected") return { state: "not_configured", detail: `Slack is ${connection.status}.` }
  const accessToken = await resolveAccessToken(connection)
  if (!accessToken) return { state: "auth_error", detail: "No usable Slack credential for this connection." }
  try {
    await slackCall(accessToken, "auth.test", {})
    return { state: "healthy" }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Slack unreachable."
    return { state: /invalid_auth|not_authed|token_revoked/.test(message) ? "auth_error" : /rate_limited/.test(message) ? "rate_limited" : "error", detail: message }
  }
}

export const slackConnector: ConnectorDefinition = {
  id: "connector_slack",
  name: "Slack",
  description: "Send messages, list channels, and read channel history in a real, connected Slack workspace.",
  provider: "slack",
  category: "communication",
  authenticationType: "oauth2",
  capabilities: ACTIONS.map((a) => ({ id: a.id, label: a.label, description: a.description, permission: a.permission })),
  actions: ACTIONS,
  triggers: TRIGGERS,
  enabled: true,
  buildTools: buildSlackTools,
  healthCheck,
}
