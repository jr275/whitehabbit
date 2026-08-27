import "server-only"

/* ================================================================== *
 * CREDENTIAL RESOLVER — Phase 2A architectural hardening: THE one
 * authoritative credential-resolution boundary. Every connector
 * adapter — built-in/OAuth2 (Salesforce, Slack, Google Analytics) AND
 * custom/dynamic (REST, MCP) — resolves what to send on an actual
 * outbound call through resolveConnectionCredential() below, never by
 * querying lib/db/repo.ts's credential tables directly.
 *
 * Before this phase there were three separate lookup paths: built-in
 * connectors called token-store.ts's getValidAccessToken() directly;
 * custom REST/MCP connectors called repo.ts's getCustomConnectorCredential()
 * directly (itself, before Phase 2A, reading a single legacy column on
 * custom_connectors). Same shape of operation ("get this Connection's
 * usable credential"), three different call sites. This file is the
 * single place that shape lives now.
 *
 * WHY two physical stores behind one boundary, not one table: an
 * OAuth2 token pair has a genuinely different lifecycle — real,
 * unencrypted, queryable expiry the runtime checks on every call
 * without decrypting anything, and an automatic refresh flow — that a
 * generic opaque secret blob (an API key, a bearer token, HTTP basic
 * auth, an MCP bearer token) doesn't need and shouldn't be forced
 * into. Collapsing both into one table would either lose that
 * queryable expiry (forcing a decrypt just to check "is this stale?")
 * or bolt refresh-specific columns onto rows that will always leave
 * them null. Two storage shapes, each fit for its own kind of secret;
 * ONE resolution boundary and ONE returned envelope shape
 * (ResolvedCredential) so no adapter needs to know or care which
 * table backed the answer.
 *
 * This is also exactly the shape a future Google OAuth connector
 * needs: Gmail/Sheets/Drive/etc. sharing ONE Google OAuth grant (one
 * Connection, one oauth_credentials row, whose `scope` column already
 * holds a real space-separated scope list) resolves through the exact
 * same oauth2 branch below — no Google-specific code lives here or
 * needs to. See lib/connectors/registry.ts's Google placeholder entry
 * for the connector-shape decision this enables (Phase 2D) — not
 * implemented yet.
 * ================================================================== */

import { getPrimaryConnectionCredential } from "@/lib/db/repo"
import { getValidAccessToken } from "./token-store"
import type { OAuth2Config } from "./oauth"
import type { Connection, CustomConnectorCredential } from "./types"

export type ResolvedCredential = { kind: "oauth2"; accessToken: string; extra?: Record<string, string> } | { kind: "generic"; credential: CustomConnectorCredential }

/** THE one authoritative credential-resolution boundary. Given a
 * Connection this org owns, returns its real, decrypted, usable
 * credential — or null when genuinely none is usable (never
 * connected, a refresh that failed, no credential ever set). Never a
 * fabricated/stale fallback.
 *
 * oauth2 Connections require oauthConfig (the provider's real
 * authorize/token endpoints + client id/secret) — every current
 * built-in OAuth2 provider adapter (providers/salesforce.ts,
 * providers/slack.ts, providers/google-analytics.ts) already builds
 * this from its own oauth-providers.ts registry entry and passes it
 * here. Every other authType resolves the connection-scoped generic
 * credential store (lib/db/repo.ts's connection_credentials table)
 * instead — the real store behind setCustomConnectorCredential /
 * setConnectionCredential. */
export async function resolveConnectionCredential(connection: Connection, opts?: { oauthConfig?: OAuth2Config; oauthExtraFields?: string[] }): Promise<ResolvedCredential | null> {
  if (connection.authType === "oauth2") {
    if (!opts?.oauthConfig) throw new Error("resolveConnectionCredential: an oauth2 Connection requires oauthConfig.")
    const token = await getValidAccessToken(connection.id, connection.organizationId, opts.oauthConfig, opts.oauthExtraFields)
    if (!token) return null
    return { kind: "oauth2", accessToken: token.accessToken, extra: token.extra }
  }
  const credential = await getPrimaryConnectionCredential(connection.id, connection.organizationId)
  if (!credential) return null
  return { kind: "generic", credential }
}
