import "server-only"

/* GET /api/connectors/salesforce/authorize — kept as a stable, named
 * URL (existing UI links point here) that delegates to the exact same
 * generic OAuth2 handler every connector now shares — see
 * lib/connectors/oauth-flow.ts and app/api/connectors/[connectorId]/
 * authorize/route.ts. Zero behavior change from before this file
 * existed as a thin wrapper: same CSRF-cookie-state mechanism, same
 * redirect URLs, same real Salesforce authorize call. */

import { startOAuthAuthorize } from "@/lib/connectors/oauth-flow"

const CONNECTOR_ID = "connector_salesforce"

export async function GET(req: Request) {
  return startOAuthAuthorize(CONNECTOR_ID, req)
}
