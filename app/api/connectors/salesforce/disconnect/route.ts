import "server-only"

/* POST /api/connectors/salesforce/disconnect — kept as a stable,
 * named URL (existing UI links point here) that delegates to the
 * exact same generic disconnect handler every connector now shares —
 * see lib/connectors/oauth-flow.ts. Zero behavior change. */

import { withApiHandler } from "@/lib/api-error"
import { disconnectOAuthConnection } from "@/lib/connectors/oauth-flow"

const CONNECTOR_ID = "connector_salesforce"

export async function POST() {
  return withApiHandler("connectors.salesforce_disconnect", async () => {
    return disconnectOAuthConnection(CONNECTOR_ID)
  })
}
