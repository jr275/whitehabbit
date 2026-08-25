import "server-only"

/* ================================================================== *
 * OAUTH PROVIDER REGISTRY — section 6 of the connectivity platform
 * brief: "build a reusable OAuth framework, do NOT implement OAuth
 * independently for every connector." The actual token-exchange HTTP
 * logic already lives exactly once (lib/connectors/oauth.ts); what
 * was still duplicated per-provider was the ROUTE layer (authorize/
 * callback/disconnect). This registry is the one new indirection that
 * removes that duplication: lib/connectors/oauth-flow.ts's three
 * generic handlers look a connector up here instead of each provider
 * hand-writing its own route trio.
 *
 * Adding provider #3 (and #4, #5, ...) means adding one entry here —
 * nothing about the routes, the token store, or the Agent Runtime
 * changes. This is the concrete answer to "how to add connector #26
 * without modifying the runtime" for any OAuth2 provider.
 * ================================================================== */

import type { OAuth2Config, OAuth2TokenResponse } from "./oauth"
import { googleAnalyticsOAuthConfig } from "./providers/google-analytics"
import { isGoogleOAuthConfigured, googleOAuthNotConfiguredReason } from "./providers/google-oauth"
import { salesforceOAuthConfig, isSalesforceOAuthConfigured, salesforceOAuthNotConfiguredReason } from "./providers/salesforce-oauth"
import { slackOAuthConfig, isSlackOAuthConfigured, slackOAuthNotConfiguredReason } from "./providers/slack-oauth"

export interface OAuthProviderDefinition {
  connectorId: string
  isConfigured: () => boolean
  notConfiguredReason: () => string
  buildConfig: (redirectUri: string) => OAuth2Config
  /** Extra fields to read from the real token response, beyond the
   * standard OAuth2 ones — e.g. Salesforce's real instance_url. */
  extraFields?: string[]
  /** Turns the real token response's extra fields into this
   * Connection's non-secret metadata (e.g. { instanceUrl } or
   * { teamId, teamName }) — never a secret, enforced the same way
   * every other Connection.metadata write already is. */
  buildMetadata?: (tokens: OAuth2TokenResponse) => Record<string, unknown>
}

const OAUTH_PROVIDER_REGISTRY: OAuthProviderDefinition[] = [
  {
    connectorId: "connector_salesforce",
    isConfigured: isSalesforceOAuthConfigured,
    notConfiguredReason: salesforceOAuthNotConfiguredReason,
    buildConfig: salesforceOAuthConfig,
    extraFields: ["instance_url"],
    buildMetadata: (tokens) => ({ instanceUrl: tokens.extra?.instance_url ?? "" }),
  },
  {
    connectorId: "connector_slack",
    isConfigured: isSlackOAuthConfigured,
    notConfiguredReason: slackOAuthNotConfiguredReason,
    buildConfig: slackOAuthConfig,
    extraFields: ["team_id", "team_name", "bot_user_id"],
    buildMetadata: (tokens) => ({ teamId: tokens.extra?.team_id ?? "", teamName: tokens.extra?.team_name ?? "", botUserId: tokens.extra?.bot_user_id ?? "" }),
  },
  {
    connectorId: "connector_google_analytics",
    isConfigured: isGoogleOAuthConfigured,
    notConfiguredReason: googleOAuthNotConfiguredReason,
    buildConfig: googleAnalyticsOAuthConfig,
    // Google's real token response has no analytics-specific extra
    // field worth caching — property/account selection happens via
    // the real list_accounts/list_properties tools at call time, not
    // baked into Connection.metadata.
  },
]

export function getOAuthProvider(connectorId: string): OAuthProviderDefinition | undefined {
  return OAUTH_PROVIDER_REGISTRY.find((p) => p.connectorId === connectorId)
}
