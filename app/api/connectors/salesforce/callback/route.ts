import "server-only"

/* GET /api/connectors/salesforce/callback — kept as a stable, named
 * URL (this exact URL is Salesforce's own registered Connected App
 * callback — changing it would break every existing/real Salesforce
 * app registration) that delegates to the exact same generic OAuth2
 * handler every connector now shares — see lib/connectors/oauth-flow.ts.
 * Zero behavior change: same real code exchange, same encrypted
 * token storage, same redirect back to /integrations. */

import { handleOAuthCallback } from "@/lib/connectors/oauth-flow"

const CONNECTOR_ID = "connector_salesforce"

export async function GET(req: Request) {
  return handleOAuthCallback(CONNECTOR_ID, req)
}
