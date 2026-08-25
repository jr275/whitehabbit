import "server-only"

/* ================================================================== *
 * GENERIC OAUTH FLOW — the real authorize/callback/disconnect HANDLER
 * LOGIC extracted once from what was previously hand-written per
 * provider (app/api/connectors/salesforce/{authorize,callback,
 * disconnect}). Driven entirely by lib/connectors/oauth-providers.ts's
 * registry, so a new OAuth2 connector needs zero new route code — see
 * app/api/connectors/[connectorId]/{authorize,callback,disconnect}/
 * route.ts, which just call these three functions.
 *
 * Salesforce's original route files now delegate here too (see their
 * updated bodies) — same CSRF-cookie-state mechanism, same behavior,
 * byte-for-byte, just no longer duplicated.
 * ================================================================== */

import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createConnection, listConnections, recordAudit, updateConnectionStatus } from "@/lib/db/repo"
import { isEncryptionConfigured } from "@/lib/crypto/secret-box"
import { NotFoundError } from "@/lib/api-error"
import { requireSession } from "@/lib/session"
import { buildAuthorizeUrl, exchangeCode } from "./oauth"
import { getOAuthProvider } from "./oauth-providers"
import { storeTokens, clearTokens } from "./token-store"

function stateCookieName(connectorId: string): string {
  return `oauth_state_${connectorId}`
}

/** The real callback URL for THIS request — derived from the actual
 * incoming path (…/authorize -> …/callback), never synthesized from
 * connectorId alone. This is what makes Salesforce's existing legacy
 * route (app/api/connectors/salesforce/callback, its real registered
 * Connected App callback — a different path than the generic
 * app/api/connectors/connector_salesforce/callback) keep working
 * unchanged while the generic [connectorId] route also works for any
 * new provider, both driven by this same function. */
function callbackUrlFor(req: Request, fromPath: "authorize" | "callback"): string {
  const url = new URL(req.url)
  url.pathname = fromPath === "authorize" ? url.pathname.replace(/\/authorize$/, "/callback") : url.pathname
  url.search = ""
  return url.toString()
}

export async function startOAuthAuthorize(connectorId: string, req: Request): Promise<NextResponse> {
  try {
    await requireSession()
  } catch {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  const provider = getOAuthProvider(connectorId)
  if (!provider) return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent("Unknown or non-OAuth2 connector.")}`, req.url))

  if (!provider.isConfigured()) {
    return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(provider.notConfiguredReason())}`, req.url))
  }
  if (!isEncryptionConfigured()) {
    return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent("Configure ENCRYPTION_KEY to store credentials securely.")}`, req.url))
  }

  const state = randomBytes(24).toString("base64url")
  const cookieStore = await cookies()
  cookieStore.set(stateCookieName(connectorId), state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" })

  const redirectUri = callbackUrlFor(req, "authorize")
  const url = buildAuthorizeUrl(provider.buildConfig(redirectUri), state)
  return NextResponse.redirect(url)
}

export async function handleOAuthCallback(connectorId: string, req: Request): Promise<NextResponse> {
  const url = new URL(req.url)
  const origin = url.origin
  const failRedirect = (message: string) => NextResponse.redirect(`${origin}/integrations?error=${encodeURIComponent(message)}`)

  let organizationId: string
  let userId: string
  try {
    ;({ organizationId, userId } = await requireSession())
  } catch {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  const provider = getOAuthProvider(connectorId)
  if (!provider) return failRedirect("Unknown or non-OAuth2 connector.")

  const oauthError = url.searchParams.get("error")
  if (oauthError) return failRedirect(`Authorization failed: ${url.searchParams.get("error_description") || oauthError}.`)

  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const cookieStore = await cookies()
  const cookieName = stateCookieName(connectorId)
  const expectedState = cookieStore.get(cookieName)?.value
  cookieStore.delete(cookieName)

  if (!code) return failRedirect("The provider did not return an authorization code.")
  if (!state || !expectedState || state !== expectedState) return failRedirect("Authorization state did not match — please try connecting again.")

  const redirectUri = callbackUrlFor(req, "callback")

  try {
    const tokens = await exchangeCode(provider.buildConfig(redirectUri), code, provider.extraFields ?? [])
    if (!tokens.accessToken) throw new Error("The provider did not return an access token.")

    const metadata = provider.buildMetadata?.(tokens) ?? {}
    const existing = (await listConnections(organizationId)).find((c) => c.connectorId === connectorId)
    const connection = existing
      ? await updateConnectionStatus(existing.id, organizationId, { status: "connected", errorReason: null, metadata, userId })
      : await createConnection({ orgId: organizationId, userId, connectorId, authType: "oauth2", status: "connected", metadata })
    if (!connection) throw new Error("Could not save the connection.")

    await storeTokens(connection.id, tokens)
    await recordAudit({ orgId: organizationId, userId, action: "connection_connected", resourceType: "connection", resourceId: connection.id, metadata: { connectorId } })

    return NextResponse.redirect(`${origin}/integrations?connected=${encodeURIComponent(connectorId)}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authorization failed."
    return failRedirect(message)
  }
}

/** Runs inside the caller route's withApiHandler — throws the same
 * typed errors every other real API route throws, never a raw
 * hand-built error response. */
export async function disconnectOAuthConnection(connectorId: string): Promise<NextResponse> {
  const { organizationId, userId } = await requireSession()
  const existing = (await listConnections(organizationId)).find((c) => c.connectorId === connectorId)
  if (!existing) throw new NotFoundError()

  await clearTokens(existing.id)
  const connection = await updateConnectionStatus(existing.id, organizationId, { status: "disconnected", userId })
  await recordAudit({ orgId: organizationId, userId, action: "connection_created", resourceType: "connection", resourceId: existing.id, metadata: { connectorId, action: "disconnected" } })

  return NextResponse.json({ connection })
}
