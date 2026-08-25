import "server-only"

/* ================================================================== *
 * TOKEN STORE — real, per-Connection OAuth2 credentials: encrypt on
 * write, decrypt + auto-refresh on read. This is the ONLY place a
 * plaintext access token exists outside a provider's own real API
 * call — never logged, never returned by an API response, never sent
 * to the browser.
 * ================================================================== */

import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box"
import { deleteOAuthCredential, getOAuthCredential, updateConnectionStatus, upsertOAuthCredential } from "@/lib/db/repo"
import type { OAuth2Config, OAuth2TokenResponse } from "./oauth"
import { refreshAccessToken } from "./oauth"

/** Refresh this many ms before real expiry, so a call in flight never
 * races an about-to-expire token. */
const REFRESH_SKEW_MS = 60_000

export async function storeTokens(connectionId: string, tokens: OAuth2TokenResponse): Promise<void> {
  await upsertOAuthCredential({
    connectionId,
    accessTokenEncrypted: encryptSecret(tokens.accessToken),
    refreshTokenEncrypted: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : undefined,
    tokenType: tokens.tokenType,
    scope: tokens.scope,
    expiresAt: tokens.expiresAt,
  })
}

export async function clearTokens(connectionId: string): Promise<void> {
  await deleteOAuthCredential(connectionId)
}

/** Real, live access token for a Connection — decrypts the stored
 * credential and, if it's genuinely expired (or about to be), calls
 * the provider's real refresh endpoint and persists the new real
 * token before returning it. Returns null when there's genuinely no
 * usable credential (never connected, or a refresh actually failed) —
 * callers report that as NOT_CONNECTED/REAUTH_REQUIRED, never
 * substitute a stale or fabricated token. */
export async function getValidAccessToken(connectionId: string, orgId: string, oauthConfig: OAuth2Config, extraFields: string[] = []): Promise<{ accessToken: string; extra?: Record<string, string> } | null> {
  const row = await getOAuthCredential(connectionId)
  if (!row) return null

  const expiringSoon = row.expiresAt != null && row.expiresAt - REFRESH_SKEW_MS <= Date.now()
  if (!expiringSoon) {
    return { accessToken: decryptSecret(row.accessTokenEncrypted) }
  }

  if (!row.refreshTokenEncrypted) {
    // Real, expired, and nothing to refresh with — an operator must
    // reconnect. REAUTH_REQUIRED, not a generic "error" (connector
    // platform audit, gap #4) — distinct and actionable, never a
    // stale token quietly reused.
    await updateConnectionStatus(connectionId, orgId, { status: "reauth_required", errorReason: "Access token expired and no refresh token is available. Reconnect required." })
    return null
  }

  try {
    const refreshed = await refreshAccessToken(oauthConfig, decryptSecret(row.refreshTokenEncrypted), extraFields)
    await storeTokens(connectionId, { ...refreshed, refreshToken: refreshed.refreshToken ?? decryptSecret(row.refreshTokenEncrypted) })
    return { accessToken: refreshed.accessToken, extra: refreshed.extra }
  } catch (err) {
    // The provider itself rejected the refresh (revoked/expired
    // refresh token) — also REAUTH_REQUIRED, never a generic "error":
    // this is specifically the "must reconnect" case, distinguishable
    // from a transient provider outage.
    const message = err instanceof Error ? err.message : "Token refresh failed."
    await updateConnectionStatus(connectionId, orgId, { status: "reauth_required", errorReason: message })
    return null
  }
}
