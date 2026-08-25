import "server-only"

/* POST /api/custom-connectors/[id]/credential — set this custom
 * connector's credential.
 *
 * Connector platform audit, Fase D6. Deliberately its own route,
 * separate from PATCH .../[id]: a different security surface (a
 * secret write, never returned by this or any other response — even
 * on a validation error, the response never echoes what was
 * submitted). Sets the credential only — it never flips `status`
 * toward "connected"; that claim must be earned by a real live check
 * (POST .../test), never inferred from "a credential was stored". */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError, ValidationError } from "@/lib/api-error"
import { getCustomConnector, recordAudit, setCustomConnectorCredential } from "@/lib/db/repo"
import { CustomConnectorValidationError, assertValidCredentialForConnector } from "@/lib/connectors/validate-custom-connector"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  return withApiHandler("custom_connectors.credential.set", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const connector = await getCustomConnector(id, organizationId)
    if (!connector) throw new NotFoundError()

    const body = (await req.json().catch(() => null)) as { credential?: unknown } | null
    if (!body) throw new ValidationError("A JSON body is required.")

    try {
      const credential = assertValidCredentialForConnector(connector, body.credential)
      await setCustomConnectorCredential(id, organizationId, credential)
    } catch (err) {
      if (err instanceof CustomConnectorValidationError) throw new ValidationError(err.message)
      throw err
    }

    // Never echoes the credential back — type only, for a confirming
    // UI toast ("API key saved"), same allowlist discipline the audit
    // asked every connector.* observability payload to follow later.
    await recordAudit({ orgId: organizationId, userId, action: "custom_connector_credential_set", resourceType: "custom_connector", resourceId: id })
    return NextResponse.json({ ok: true })
  })
}
