import "server-only"

/* GET /api/knowledge/merge-candidates — pending Entity Resolution
 * merge candidates (§7) for the org's default Project, awaiting human
 * review. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { listMergeCandidates } from "@/lib/knowledge/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { requireSession } from "@/lib/session"

export async function GET() {
  return withApiHandler("knowledge.merge-candidates.list", async () => {
    const { organizationId } = await requireSession()
    const project = await getOrCreateDefaultProject(organizationId)
    const candidates = await listMergeCandidates(organizationId, project.id, "pending")
    return NextResponse.json({ candidates })
  })
}
