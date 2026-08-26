import "server-only"

/* GET /api/projects/default — the org's default Project (§9's
 * onboarding entry point), lazily created on first use (see
 * lib/projects/repo.ts's getOrCreateDefaultProject — docs/architecture/
 * risks.md R-12: real multi-project onboarding UI is a later phase). */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { requireSession } from "@/lib/session"

export async function GET() {
  return withApiHandler("projects.default", async () => {
    const { organizationId } = await requireSession()
    const project = await getOrCreateDefaultProject(organizationId)
    return NextResponse.json({ project })
  })
}
