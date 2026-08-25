import "server-only"

/* GET /api/connectors/salesforce/callback — real OAuth2 authorization-
 * code exchange. Salesforce redirects the user's browser here with a
 * real `code` (or a real `error`). This is the only place the code is
 * exchanged for real tokens; those tokens are encrypted immediately
 * (lib/crypto/secret-box.ts) and never appear in any API response —
 * the browser only ever receives a redirect back to /integrations. */

import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createConnection, listConnections, recordAudit, updateConnectionStatus } from "@/lib/db/repo"
import { exchangeCode } from "@/lib/connectors/oauth"
import { salesforceOAuthConfig } from "@/lib/connectors/providers/salesforce-oauth"
import { storeTokens } from "@/lib/connectors/token-store"
import { requireSession } from "@/lib/session"
import { STATE_COOKIE } from "../authorize/route"

const CONNECTOR_ID = "connector_salesforce"

function failRedirect(base: string, message: string): NextResponse {
  return NextResponse.redirect(`${base}/integrations?error=${encodeURIComponent(message)}`)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = url.origin

  let organizationId: string
  let userId: string
  try {
    ;({ organizationId, userId } = await requireSession())
  } catch {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  const oauthError = url.searchParams.get("error")
  if (oauthError) {
    return failRedirect(origin, `Salesforce authorization failed: ${url.searchParams.get("error_description") || oauthError}.`)
  }

  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const cookieStore = await cookies()
  const expectedState = cookieStore.get(STATE_COOKIE)?.value
  cookieStore.delete(STATE_COOKIE)

  if (!code) return failRedirect(origin, "Salesforce did not return an authorization code.")
  if (!state || !expectedState || state !== expectedState) return failRedirect(origin, "Salesforce authorization state did not match — please try connecting again.")

  const redirectUri = new URL("/api/connectors/salesforce/callback", req.url).toString()

  try {
    const tokens = await exchangeCode(salesforceOAuthConfig(redirectUri), code, ["instance_url"])
    if (!tokens.accessToken) throw new Error("Salesforce did not return an access token.")

    const existing = (await listConnections(organizationId)).find((c) => c.connectorId === CONNECTOR_ID)
    const metadata = { instanceUrl: tokens.extra?.instance_url ?? "" }
    const connection = existing
      ? await updateConnectionStatus(existing.id, organizationId, { status: "connected", errorReason: null, metadata, userId })
      : await createConnection({ orgId: organizationId, userId, connectorId: CONNECTOR_ID, authType: "oauth2", status: "connected", metadata })
    if (!connection) throw new Error("Could not save the Salesforce connection.")

    await storeTokens(connection.id, tokens)
    await recordAudit({ orgId: organizationId, userId, action: "connection_connected", resourceType: "connection", resourceId: connection.id, metadata: { connectorId: CONNECTOR_ID } })

    return NextResponse.redirect(`${origin}/integrations?connected=salesforce`)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Salesforce authorization failed."
    return failRedirect(origin, message)
  }
}
