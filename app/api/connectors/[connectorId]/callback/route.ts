import "server-only"

/* GET /api/connectors/[connectorId]/callback — the generic OAuth2
 * callback route. The provider redirects the user's browser here with
 * a real `code` (or a real `error`); the exchange, encryption, and
 * Connection write are all in lib/connectors/oauth-flow.ts, shared by
 * every OAuth2 connector — see lib/connectors/oauth-providers.ts. */

import { handleOAuthCallback } from "@/lib/connectors/oauth-flow"

type Params = { params: Promise<{ connectorId: string }> }

export async function GET(req: Request, { params }: Params) {
  const { connectorId } = await params
  return handleOAuthCallback(connectorId, req)
}
