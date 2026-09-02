import "server-only"

/* ================================================================== *
 * SLACK OAUTH2 CONFIG — same shape as providers/salesforce-oauth.ts,
 * proving the generalization: this file is the ONLY Slack-specific
 * code needed to make Slack's already-real, already-complete adapter
 * (providers/slack.ts) actually connectable — the token exchange
 * itself is the same shared lib/connectors/oauth.ts logic Salesforce
 * uses, and the routes are the same generic
 * app/api/connectors/[connectorId]/{authorize,callback,disconnect}
 * trio (lib/connectors/oauth-flow.ts), not a new route file.
 * ================================================================== */

import type { OAuth2Config } from "../oauth"

export function isSlackOAuthConfigured(): boolean {
  return !!process.env.SLACK_CLIENT_ID && !!process.env.SLACK_CLIENT_SECRET
}

export function slackOAuthNotConfiguredReason(): string {
  if (!process.env.SLACK_CLIENT_ID) return "Configure SLACK_CLIENT_ID to connect Slack."
  return "Configure SLACK_CLIENT_SECRET to connect Slack."
}

/** `redirectUri` is passed in the same way salesforceOAuthConfig()
 * takes it — derived from the incoming request, must exactly match
 * the Slack app's registered real redirect URL. */
export function slackOAuthConfig(redirectUri: string): OAuth2Config {
  return {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    clientId: process.env.SLACK_CLIENT_ID || "",
    clientSecret: process.env.SLACK_CLIENT_SECRET || "",
    redirectUri,
    // Matches exactly the real Slack Web API calls providers/slack.ts's
    // adapter already makes (chat.postMessage, conversations.list,
    // conversations.history) — never a broader scope than what's used.
    scope: "chat:write,channels:read,channels:history,groups:read,groups:history",
  }
}
