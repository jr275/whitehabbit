import "server-only"

/* POST /api/connectors/[connectorId]/disconnect — the generic
 * disconnect route: real, org-scoped, clears the encrypted credential
 * and marks the Connection disconnected. Shared by every OAuth2
 * connector — see lib/connectors/oauth-flow.ts. */

import { withApiHandler } from "@/lib/api-error"
import { disconnectOAuthConnection } from "@/lib/connectors/oauth-flow"

type Params = { params: Promise<{ connectorId: string }> }

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("connectors.disconnect", async () => {
    const { connectorId } = await params
    return disconnectOAuthConnection(connectorId)
  })
}
