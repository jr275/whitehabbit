import "server-only"

/* GET /api/v1/ai-visibility/prompts/:id/answers — real observation
 * history for a prompt (§28: repeated runs become observations, never
 * one answer treated as definitive). */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { getAIPrompt, listAIAnswersForRun, listAIRuns } from "@/lib/intelligence/ai-visibility/repo"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  return withApiHandler("v1.ai-visibility.prompts.answers", async () => {
    const { organizationId } = await requireSession()
    const { id } = await params
    const prompt = await getAIPrompt(id, organizationId)
    if (!prompt) throw new NotFoundError()

    const runs = await listAIRuns(organizationId, id)
    const answers = (await Promise.all(runs.map((run) => listAIAnswersForRun(organizationId, run.id)))).flat()
    return NextResponse.json({ runs, answers })
  })
}
