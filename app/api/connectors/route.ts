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
    }))
    return NextResponse.json({ connectors })
  })
}
