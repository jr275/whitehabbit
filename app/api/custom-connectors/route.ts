import "server-only"

/* GET  /api/custom-connectors — list the authenticated org's real
 *      Custom Connectors (MCP servers / Custom REST Connectors).
 * POST /api/custom-connectors — create one.
 *
 * Connector platform audit, Fase D6. This is the self-service route
 * the audit's own security gate (section 19) said must not be exposed
 * until the BLOCKERs it found were closed — SSRF protection (Fase
 * D3), the generic action's risk derivation (Fase D5), and the
 * Connector/Connection/Credential schema separation (Fase D2) are all
 * in place before this route exists at all.
 *
 * A brand-new connector is always created credential-less and
 * status: "not_connected" — creation only ever registers the
 * DEFINITION (name/config), never a secret (POST .../credential is a
 * separate route, a separate security surface) and never a live
 * connection claim this route hasn't actually verified (POST
 * .../test is what earns "connected", the same "never infer from
 * config existing" discipline app/api/connections/route.ts already
 * follows for connectors whose authenticationType isn't "none"). */

import { NextResponse } from "next/server"
import { withApiHandler, ValidationError } from "@/lib/api-error"
import { createCustomConnector, listCustomConnectors, recordAudit } from "@/lib/db/repo"
import { CustomConnectorValidationError, assertValidCategory, assertValidConfig, assertValidDescription, assertValidIcon, assertValidKind, assertValidName } from "@/lib/connectors/validate-custom-connector"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

function reraiseAsValidationError(err: unknown): never {
  if (err instanceof CustomConnectorValidationError) throw new ValidationError(err.message)
  throw err
}

export async function GET() {
  return withApiHandler("custom_connectors.list", async () => {
    const { organizationId } = await requireSession()
    const connectors = await listCustomConnectors(organizationId)
    return NextResponse.json({ connectors })
  })
}

export async function POST(req: Request) {
  return withApiHandler("custom_connectors.create", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("custom_connector_create", organizationId)

    const body = (await req.json().catch(() => null)) as { kind?: unknown; name?: unknown; description?: unknown; category?: unknown; icon?: unknown; config?: unknown } | null
    if (!body) throw new ValidationError("A JSON body is required.")

    try {
      const kind = assertValidKind(body.kind)
      const name = assertValidName(body.name)
      const description = assertValidDescription(body.description)
      const category = assertValidCategory(body.category)
      const icon = assertValidIcon(body.icon)
      // Real, live SSRF check before anything is persisted — see
      // assertValidConfig -> assertSafeBaseUrl.
      const config = await assertValidConfig(kind, body.config)

      const connector = await createCustomConnector({ orgId: organizationId, userId, kind, name, description, category, icon, config })
      await recordAudit({ orgId: organizationId, userId, action: "custom_connector_created", resourceType: "custom_connector", resourceId: connector.id, metadata: { kind, name } })
      return NextResponse.json({ connector }, { status: 201 })
    } catch (err) {
      reraiseAsValidationError(err)
    }
  })
}
