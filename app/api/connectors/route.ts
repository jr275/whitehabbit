import "server-only"

/* GET /api/connectors — the real, code-defined connector catalog.
 * Never org-scoped (a ConnectorDefinition is a fact about the deployed
 * code, same as the Skill/Tool catalogs) but still requires a real
 * session — no anonymous discovery of what's architecturally
 * available. Returns capabilities but never a credential/secret. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { getOAuthProvider } from "@/lib/connectors/oauth-providers"
import { listConnectors } from "@/lib/connectors/registry"
import { requireSession } from "@/lib/session"

// Real OAuth2 authorize URL per connector. Every connector registered in
// lib/connectors/oauth-providers.ts (Salesforce, Slack, Google Analytics,
// and any future provider) gets the generic route for free —
// /api/connectors/[connectorId]/authorize. Salesforce's own hand-written
// route (/api/connectors/salesforce/authorize) is kept as the URL here
// too, since that's the one with a proven-live redirect_uri registered
// with Salesforce already; every other OAuth2 connector uses the generic
// path. A connector with no entry in that registry has no real OAuth flow
// yet; the client falls back to the honest "coming in a later phase" state.
function oauthAuthorizeUrlFor(connectorId: string): string | undefined {
  if (connectorId === "connector_salesforce") return "/api/connectors/salesforce/authorize"
  return getOAuthProvider(connectorId) ? `/api/connectors/${connectorId}/authorize` : undefined
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
      oauthAuthorizeUrl: c.enabled ? oauthAuthorizeUrlFor(c.id) : undefined,
    }))
    return NextResponse.json({ connectors })
  })
}
