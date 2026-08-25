import "server-only"

/* ================================================================== *
 * SALESFORCE OAUTH2 CONFIG — the one place Salesforce's real endpoint
 * URLs and env var names live. Everything else (the actual token
 * exchange/refresh HTTP calls) is the shared, provider-agnostic logic
 * in lib/connectors/oauth.ts.
 * ================================================================== */

import type { OAuth2Config } from "../oauth"

function loginUrl(): string {
  // A real org can run on a custom "My Domain" — never assumed;
  // defaults to Salesforce's real, standard login host.
  return (process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com").replace(/\/$/, "")
}

export function isSalesforceOAuthConfigured(): boolean {
  return !!process.env.SALESFORCE_CLIENT_ID && !!process.env.SALESFORCE_CLIENT_SECRET
}

export function salesforceOAuthNotConfiguredReason(): string {
  if (!process.env.SALESFORCE_CLIENT_ID) return "Configure SALESFORCE_CLIENT_ID to connect Salesforce."
  return "Configure SALESFORCE_CLIENT_SECRET to connect Salesforce."
}

/** `redirectUri` is passed in rather than read from an env var here —
 * it must exactly match this deployment's real, reachable callback URL
 * (derived from the incoming request in the authorize route), and a
 * connected app's registered callback must match it exactly. */
export function salesforceOAuthConfig(redirectUri: string): OAuth2Config {
  return {
    authorizeUrl: `${loginUrl()}/services/oauth2/authorize`,
    tokenUrl: `${loginUrl()}/services/oauth2/token`,
    clientId: process.env.SALESFORCE_CLIENT_ID || "",
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET || "",
    redirectUri,
    // "api" = REST API access (search/create/update Leads, Accounts,
    // Opportunities); "refresh_token offline_access" keeps the
    // connection alive without asking the user to re-authorize.
    scope: "api refresh_token offline_access",
  }
}
