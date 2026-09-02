import "server-only"

/* POST /api/custom-connectors/[id]/import-openapi — parse a real
 * OpenAPI 3.x document (JSON) the operator pastes/uploads and
 * register the resulting real ConnectorActions as this connector's
 * discoveredTools.
 *
 * Connector platform audit, Fase D6/D15. Deliberately accepts the
 * spec as inline text in the request body — never a URL this server
 * would fetch on the operator's behalf, which would just be a second,
 * needless SSRF surface next to the one baseUrl already has. Parsing
 * (lib/connectors/openapi-import.ts's parseOpenApiSpec) is pure
 * JSON.parse-based data extraction — never eval/new Function(), never
 * executes anything from the document — matching the audit's explicit
 * "connector must be declarative" requirement. Every generated
 * action's permission/riskLevel is derived from its real HTTP method
 * (lib/connectors/http-risk.ts), the same shared derivation Fase D5
 * uses for the generic action — never hand-set, never guessable low
 * by an operator pasting a spec that mislabels its own methods. */

import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError, ValidationError } from "@/lib/api-error"
import { getCustomConnector, recordAudit, updateCustomConnectorDiscovery } from "@/lib/db/repo"
import { OpenApiImportError, parseOpenApiSpec } from "@/lib/connectors/openapi-import"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

const MAX_SPEC_LENGTH = 2_000_000 // 2MB of JSON text — generous for a real OpenAPI doc, bounded against abuse

export async function POST(req: Request, { params }: Params) {
  return withApiHandler("custom_connectors.import_openapi", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("custom_connector_test", organizationId)
    const { id } = await params

    const connector = await getCustomConnector(id, organizationId)
    if (!connector) throw new NotFoundError()
    if (connector.kind !== "rest") throw new ValidationError("OpenAPI import is only available for REST connectors.")

    const body = (await req.json().catch(() => null)) as { spec?: unknown } | null
    const spec = body?.spec
    if (typeof spec !== "string" || !spec.trim()) throw new ValidationError("spec (the OpenAPI document as JSON text) is required.")
    if (spec.length > MAX_SPEC_LENGTH) throw new ValidationError(`spec must be ${MAX_SPEC_LENGTH} characters or fewer.`)

    let result: ReturnType<typeof parseOpenApiSpec>
    try {
      result = parseOpenApiSpec(spec)
    } catch (err) {
      if (err instanceof OpenApiImportError) throw new ValidationError(err.message)
      throw err
    }

    const updated = await updateCustomConnectorDiscovery(id, organizationId, { status: connector.status, discoveredTools: result.actions })
    await recordAudit({ orgId: organizationId, userId, action: "custom_connector_openapi_imported", resourceType: "custom_connector", resourceId: id, metadata: { actionCount: result.actions.length, warningCount: result.warnings.length } })

    return NextResponse.json({ connector: updated, actionCount: result.actions.length, warnings: result.warnings })
  })
}
