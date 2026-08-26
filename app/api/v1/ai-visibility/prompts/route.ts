import "server-only"

/* GET/POST /api/v1/ai-visibility/prompts — real, repeatable AI
 * visibility prompts (§28). */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { recordAudit } from "@/lib/db/repo"
import { getProject } from "@/lib/projects/repo"
import { createAIPrompt, listAIPrompts } from "@/lib/intelligence/ai-visibility/repo"
import { requireSession } from "@/lib/session"

export async function GET(req: Request) {
  return withApiHandler("v1.ai-visibility.prompts.list", async () => {
    const { organizationId } = await requireSession()
    const url = new URL(req.url)
    const projectId = url.searchParams.get("projectId")
    if (!projectId) throw new ValidationError("projectId is required.")
    const project = await getProject(projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")
    const prompts = await listAIPrompts(organizationId, projectId)
    return NextResponse.json({ prompts })
  })
}

export async function POST(req: Request) {
  return withApiHandler("v1.ai-visibility.prompts.create", async () => {
    const { organizationId, userId } = await requireSession()
    const body = (await req.json()) as { projectId?: string; label?: string; text?: string }
    if (!body.projectId) throw new ValidationError("projectId is required.")
    if (!body.label?.trim() || !body.text?.trim()) throw new ValidationError("label and text are required.")
    const project = await getProject(body.projectId, organizationId)
    if (!project) throw new ValidationError("Project not found.")

    const prompt = await createAIPrompt({ orgId: organizationId, projectId: body.projectId, label: body.label, text: body.text })
    await recordAudit({ orgId: organizationId, userId, action: "ai_prompt.create", resourceType: "ai_prompt", resourceId: prompt.id })
    return NextResponse.json({ prompt }, { status: 201 })
  })
}
