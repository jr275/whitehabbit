import "server-only"

/* GET /api/connectors/[connectorId]/authorize — the generic OAuth2
 * authorize route (section 6 of the connectivity platform brief).
 * Any connector registered in lib/connectors/oauth-providers.ts works
 * here with zero new route code — see lib/connectors/oauth-flow.ts
 * for the real, shared handler logic. A top-level navigation, not a
 * fetch call — the browser must actually redirect to the provider's
 * own login/consent screen. */

import { startOAuthAuthorize } from "@/lib/connectors/oauth-flow"

type Params = { params: Promise<{ connectorId: string }> }

export async function GET(req: Request, { params }: Params) {
  const { connectorId } = await params
  return startOAuthAuthorize(connectorId, req)
}
