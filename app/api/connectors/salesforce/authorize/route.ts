import "server-only"

/* GET /api/connectors/salesforce/authorize — starts the real Salesforce
 * OAuth2 authorization-code flow. A top-level navigation (the
 * Integration Hub's "Connect Salesforce" link points straight here),
 * not a POST/fetch call — the browser must actually redirect to
 * Salesforce's own login/consent screen.
 *
 * `state` is a random nonce stored in a short-lived, httpOnly cookie
 * and re-checked on callback — real CSRF protection, no database
 * round-trip needed for it. */

import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { buildAuthorizeUrl } from "@/lib/connectors/oauth"
import { isSalesforceOAuthConfigured, salesforceOAuthConfig, salesforceOAuthNotConfiguredReason } from "@/lib/connectors/providers/salesforce-oauth"
import { isEncryptionConfigured } from "@/lib/crypto/secret-box"
import { requireSession } from "@/lib/session"

export const STATE_COOKIE = "sf_oauth_state"

export async function GET(req: Request) {
  try {
    await requireSession()
  } catch {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  if (!isSalesforceOAuthConfigured()) {
    return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(salesforceOAuthNotConfiguredReason())}`, req.url))
  }
  if (!isEncryptionConfigured()) {
    return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent("Configure ENCRYPTION_KEY to store Salesforce credentials securely.")}`, req.url))
  }

  const state = randomBytes(24).toString("base64url")
  const cookieStore = await cookies()
  cookieStore.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" })

  const redirectUri = new URL("/api/connectors/salesforce/callback", req.url).toString()
  const url = buildAuthorizeUrl(salesforceOAuthConfig(redirectUri), state)
  return NextResponse.redirect(url)
}
