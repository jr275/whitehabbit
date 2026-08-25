import "server-only"

/* ================================================================== *
 * OAUTH2 — a generic, provider-agnostic authorization-code contract.
 * Every real OAuth2 connector (Salesforce first, Slack next) supplies
 * one of these; nothing about the HTTP token exchange itself is
 * provider-specific — that logic lives here exactly once. What IS
 * provider-specific (the authorize/token URLs, the real credential env
 * var names, how to read that provider's own token response shape)
 * stays in that provider's own file — see lib/connectors/providers/
 * salesforce-oauth.ts — never inside the Agent Runtime or this shared
 * module's callers.
 * ================================================================== */

export interface OAuth2Config {
  authorizeUrl: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scope: string
  /** Extra, real authorize-URL query params a specific provider's
   * documented flow requires beyond the standard OAuth2 set — e.g.
   * Google's real `access_type=offline&prompt=consent` (needed to
   * actually receive a refresh_token at all). Generic here so no
   * provider needs its own authorize-URL-building code — see
   * providers/google-oauth.ts. */
  extraAuthorizeParams?: Record<string, string>
}

export interface OAuth2TokenResponse {
  accessToken: string
  refreshToken?: string
  tokenType?: string
  scope?: string
  /** ms since epoch, derived from the provider's own real expires_in. */
  expiresAt?: number
  /** Provider-specific extra fields a caller may need (e.g.
   * Salesforce's real `instance_url`) — never a secret. */
  extra?: Record<string, string>
}

export class OAuth2Error extends Error {}

export function buildAuthorizeUrl(config: OAuth2Config, state: string): string {
  const url = new URL(config.authorizeUrl)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", config.redirectUri)
  url.searchParams.set("scope", config.scope)
  url.searchParams.set("state", state)
  for (const [key, value] of Object.entries(config.extraAuthorizeParams ?? {})) url.searchParams.set(key, value)
  return url.toString()
}

function parseExpiresIn(body: Record<string, unknown>): number | undefined {
  const raw = body.expires_in
  if (typeof raw !== "number" && typeof raw !== "string") return undefined
  const seconds = Number(raw)
  return Number.isFinite(seconds) ? Date.now() + seconds * 1000 : undefined
}

async function tokenRequest(config: OAuth2Config, params: Record<string, string>, extraFields: string[]): Promise<OAuth2TokenResponse> {
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(20_000),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const message = typeof body.error_description === "string" ? body.error_description : typeof body.error === "string" ? body.error : `HTTP ${res.status}`
    throw new OAuth2Error(`Token request failed: ${message}`)
  }
  const extra: Record<string, string> = {}
  for (const field of extraFields) {
    const v = body[field]
    if (typeof v === "string") extra[field] = v
  }
  return {
    accessToken: String(body.access_token ?? ""),
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
    tokenType: typeof body.token_type === "string" ? body.token_type : undefined,
    scope: typeof body.scope === "string" ? body.scope : undefined,
    expiresAt: parseExpiresIn(body),
    extra: Object.keys(extra).length ? extra : undefined,
  }
}

/** Real authorization-code -> token exchange. `extraFields` names any
 * provider-specific fields worth keeping from the real token response
 * (e.g. Salesforce's "instance_url") — never assumed, only read if
 * the provider's real response actually included it. */
export async function exchangeCode(config: OAuth2Config, code: string, extraFields: string[] = []): Promise<OAuth2TokenResponse> {
  if (!config.clientId || !config.clientSecret) throw new OAuth2Error("OAuth2 client credentials are not configured.")
  return tokenRequest(
    config,
    { grant_type: "authorization_code", code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri },
    extraFields,
  )
}

export async function refreshAccessToken(config: OAuth2Config, refreshToken: string, extraFields: string[] = []): Promise<OAuth2TokenResponse> {
  if (!config.clientId || !config.clientSecret) throw new OAuth2Error("OAuth2 client credentials are not configured.")
  return tokenRequest(config, { grant_type: "refresh_token", refresh_token: refreshToken, client_id: config.clientId, client_secret: config.clientSecret }, extraFields)
}
