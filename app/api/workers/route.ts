import "server-only"

/* GET  /api/workers  — list the authenticated org's real Workers
 * POST /api/workers  — create a new, empty Worker in the authenticated
 *                       org. Real DB row, no fabricated config: every
 *                       field starts blank/disabled and the user
 *                       fills it in through Studio. Rate-limited per
 *                       organization (see lib/rate-limit.ts). */

import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { hydrateWorkerLiveState } from "@/lib/agent/hydrate"
import { listWorkers, recordAudit, upsertWorker } from "@/lib/db/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"
import { SKILL_CATALOG } from "@/lib/workforce/catalog"
import { buildEmptyWorker, buildWorkerFromBlueprint, type AgentBlueprint } from "@/lib/workforce/seed"

export async function GET() {
  return withApiHandler("workers.list", async () => {
    const { organizationId } = await requireSession()
    const workers = await listWorkers(organizationId)
    return NextResponse.json({ workers: workers.map(hydrateWorkerLiveState) })
  })
}

export async function POST(req: Request) {
  return withApiHandler("workers.create", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("worker_create", organizationId)

    const body = (await req.json().catch(() => null)) as { blueprint?: AgentBlueprint } | null
    let worker = buildEmptyWorker(`worker_${randomUUID()}`)
    if (body?.blueprint) {
      const blueprint = body.blueprint
      const validSkillIds = new Set(SKILL_CATALOG.map((skill) => skill.id))
      if (!blueprint.name?.trim() || !blueprint.role?.trim() || !blueprint.mission?.trim()) {
        throw new ValidationError("Name, role, and mission are required.")
      }
      if (!validSkillIds.has(blueprint.primarySkillId)) throw new ValidationError("Choose a supported primary skill.")
      const reviewed: AgentBlueprint = {
        name: blueprint.name.trim().slice(0, 40),
        role: blueprint.role.trim().slice(0, 80),
        description: blueprint.description?.trim().slice(0, 400) ?? "",
        persona: blueprint.persona?.trim().slice(0, 200) ?? "",
        tone: Array.isArray(blueprint.tone) ? blueprint.tone.filter(Boolean).slice(0, 4) : [],
        mission: blueprint.mission.trim().slice(0, 500),
        primarySkillId: blueprint.primarySkillId,
        secondarySkillIds: Array.isArray(blueprint.secondarySkillIds)
          ? [...new Set(blueprint.secondarySkillIds)].filter((id) => validSkillIds.has(id) && id !== blueprint.primarySkillId).slice(0, 2)
          : [],
        primaryKPI: blueprint.primaryKPI?.trim().slice(0, 60) || "Outputs produced",
        secondaryKPIs: Array.isArray(blueprint.secondaryKPIs) ? blueprint.secondaryKPIs.filter(Boolean).slice(0, 5) : [],
      }
      worker = buildWorkerFromBlueprint(worker.id, reviewed)
    }
    const saved = await upsertWorker(worker, organizationId, userId)
    await recordAudit({ orgId: organizationId, userId, action: body?.blueprint ? "worker.create_from_blueprint" : "worker.create", resourceType: "worker", resourceId: saved.id })
    return NextResponse.json({ worker: hydrateWorkerLiveState(saved) })
  })
}
