import "server-only"

/* GET /api/connectors — the real connector catalog: built-in
 * (code-defined, same for every org) merged with this org's own real
 * custom connectors (connector platform audit, Fase D7 — see
 * lib/connectors/registry.ts's listAllConnectors). Requires a real
 * session both for the org scoping the custom half needs and because
 * this is real information about what's architecturally available,
 * never anonymous. Returns capabilities/actions but never a
 * credential/secret — a CustomConnector's own type never carries one. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { getOAuthProvider } from "@/lib/connectors/oauth-providers"
import { listAllConnectors } from "@/lib/connectors/registry"
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
    const { organizationId } = await requireSession()
    const connectors = (await listAllConnectors(organizationId)).map((c) => ({
      ...c,
      // getOAuthProvider only ever recognizes a static registry id — a
      // custom connector's id (always "custom_cconn_<uuid>") never
      // matches, so this is naturally undefined for origin: "custom"
      // with no origin check needed here.
      oauthAuthorizeUrl: c.enabled ? oauthAuthorizeUrlFor(c.id) : undefined,
    }))
    return NextResponse.json({ connectors })
  })
}
