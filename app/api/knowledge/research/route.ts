import "server-only"

/* POST /api/knowledge/research — research an objective against the
 * CALLING USER's own saved library.
 *
 * Org and user come only from requireSession(); the body carries an
 * objective and nothing else, so this can no more read a colleague's
 * library than /api/knowledge/ai can. Scope is applied in SQL beneath
 * every filter — see lib/knowledge/search/retrievers.ts.
 *
 * Rate-limited tighter than Ask: a brief is a larger generation over a
 * larger context, and it is the kind of request someone fires
 * repeatedly while wording an objective. */

import { NextResponse } from "next/server"
import { AiNotConfiguredError, UpstreamServiceError, ValidationError, withApiHandler } from "@/lib/api-error"
import { InvalidObjectiveError, parseObjective } from "@/lib/knowledge/research-contract"
import { researchObjective, ResearchNotConfiguredError, ResearchUpstreamError } from "@/lib/knowledge/research"
import { recordAudit } from "@/lib/db/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"

export const runtime = "nodejs"
/* A brief is a bigger call than an answer; the platform default would
 * cut it off mid-generation rather than fail cleanly. */
export const maxDuration = 120

export async function POST(req: Request) {
  return withApiHandler("knowledge.research", async () => {
    const { organizationId, userId } = await requireSession()

    let objective
    try {
      objective = parseObjective(await req.json().catch(() => null))
    } catch (err) {
      if (err instanceof InvalidObjectiveError) throw new ValidationError(err.message)
      throw err
    }

    await enforceRateLimit("knowledge_research", organizationId)

    let brief
    try {
      brief = await researchObjective({ objective, scope: { orgId: organizationId, userId } })
    } catch (err) {
      if (err instanceof ResearchNotConfiguredError) throw new AiNotConfiguredError(err.message)
      if (err instanceof ResearchUpstreamError) throw new UpstreamServiceError(err.message)
      throw err
    }

    // Only a real generation is worth an audit row; the refusal path
    // touched no provider and produced no content.
    if (brief.status === "researched") {
      await recordAudit({
        orgId: organizationId,
        userId,
        action: "knowledge.research",
        resourceType: "knowledge_research",
        resourceId: null,
      })
    }

    return NextResponse.json(brief)
  })
}
