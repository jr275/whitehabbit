import "server-only"

/* POST /api/v1/ai-visibility/prompts/:id/run — a real prompt to a
 * real, configured LLM provider (§27-28). Honestly reports "blocked"
 * (503) rather than fabricating an answer if no provider is
 * configured — same discipline as the content pipeline's Draft step. */

import { NextResponse } from "next/server"
import { NotFoundError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getAIPrompt } from "@/lib/intelligence/ai-visibility/repo"
import { AIVisibilityBlockedError, runAIVisibilityPrompt } from "@/lib/intelligence/ai-visibility/runner"
import { requireSession } from "@/lib/session"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  return withApiHandler("v1.ai-visibility.prompts.run", async () => {
    const { organizationId, userId } = await requireSession()
    const { id } = await params
    const prompt = await getAIPrompt(id, organizationId)
    if (!prompt) throw new NotFoundError()

    const body = (await req.json().catch(() => ({}))) as { brandNames?: string[]; competitorNames?: string[] }

    try {
      const answer = await runAIVisibilityPrompt(organizationId, prompt.projectId, id, { brandNames: body.brandNames, competitorNames: body.competitorNames })
      await recordAudit({ orgId: organizationId, userId, action: "ai_prompt.run", resourceType: "ai_prompt", resourceId: id })
      return NextResponse.json({ answer })
    } catch (err) {
      if (err instanceof AIVisibilityBlockedError) return NextResponse.json({ error: err.message }, { status: 503 })
      throw err
    }
  })
}
