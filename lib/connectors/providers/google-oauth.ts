import "server-only"

/* ================================================================== *
 * GOOGLE OAUTH2 CONFIG — shared across every real Google connector
 * (Google Analytics first; Search Console/Ads/Drive/Sheets/Gmail/
 * Calendar reuse this same module, same GOOGLE_CLIENT_ID/SECRET, only
 * their own real, minimal scope differs) — the same "one client, per-
 * product scopes" shape a real multi-product Google Cloud OAuth
 * consent screen actually uses. Never a second, per-product OAuth
 * implementation: the token exchange itself stays the shared,
 * provider-agnostic logic in lib/connectors/oauth.ts.
 *
 * access_type=offline + prompt=consent are real, required Google
 * behavior (not decorative): without them Google only ever returns a
 * refresh_token on a user's very first consent, which would silently
 * break reconnecting/re-scoping later — lib/connectors/oauth.ts's
 * OAuth2Config.extraAuthorizeParams is what makes this a generic
 * capability, not a Google-specific hack.
 * ================================================================== */

import type { OAuth2Config } from "../oauth"

export function isGoogleOAuthConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
}

export function googleOAuthNotConfiguredReason(): string {
  if (!process.env.GOOGLE_CLIENT_ID) return "Configure GOOGLE_CLIENT_ID to connect Google products."
  return "Configure GOOGLE_CLIENT_SECRET to connect Google products."
}

/** `scope` is supplied per-product (e.g. Google Analytics passes only
 * analytics.readonly) — this module never assumes which Google
 * product is asking. */
export function buildGoogleOAuthConfig(redirectUri: string, scope: string): OAuth2Config {
  return {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri,
    scope,
    extraAuthorizeParams: { access_type: "offline", prompt: "consent" },
  }
}
