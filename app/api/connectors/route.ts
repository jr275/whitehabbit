import "server-only"

/* GET /api/connectors — the real, code-defined connector catalog.
 * Never org-scoped (a ConnectorDefinition is a fact about the deployed
 * code, same as the Skill/Tool catalogs) but still requires a real
 * session — no anonymous discovery of what's architecturally
 * available. Returns capabilities but never a credential/secret. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { listConnectors } from "@/lib/connectors/registry"
import { requireSession } from "@/lib/session"

// Real OAuth2 authorize routes — a same-shaped GET redirect endpoint
// per connector, built as each one's real flow lands (Salesforce
// first). A connector with no entry here has no real OAuth flow yet;
// the client falls back to the honest "coming in a later phase" state.
const OAUTH_AUTHORIZE_PATH: Record<string, string> = {
  connector_salesforce: "/api/connectors/salesforce/authorize",
}

export async function GET() {
  return withApiHandler("connectors.list", async () => {
    await requireSession()
    const connectors = listConnectors().map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      provider: c.provider,
      category: c.category ?? "other",
      authenticationType: c.authenticationType,
      capabilities: c.capabilities,
      actions: c.actions ?? [],
      triggers: c.triggers ?? [],
      enabled: c.enabled,
      oauthAuthorizeUrl: c.enabled ? OAUTH_AUTHORIZE_PATH[c.id] : undefined,
    }))
    return NextResponse.json({ connectors })
  })
}
