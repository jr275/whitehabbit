import "server-only"

/* POST /api/workers/[id]/build
 *
 * Build: freezes the current draft configuration into an immutable
 * WorkerVersion (see lib/db/repo.ts buildWorkerVersion) — validate,
 * resolve skills/tools/knowledge/model (they're already resolved as
 * part of the Worker definition itself), compute a reproducibility
 * fingerprint, persist, mark the worker "ready". Never marks it live
 * — that's Release's job alone. */

import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { withApiHandler, NotFoundError, ValidationError } from "@/lib/api-error"
import { hydrateWorkerLiveState } from "@/lib/agent/hydrate"
import { buildWorkerVersion, getWorker, recordAudit } from "@/lib/db/repo"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"
import type { WorkerDefinitionSnapshot } from "@/lib/workforce/model"

type Params = { params: Promise<{ id: string }> }

/** A stable JSON stringify (sorted keys) so two definitions with the
 * same content in a different key order still fingerprint identically
 * — the reproducibility check is about content, not serialization. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

export async function POST(_req: Request, { params }: Params) {
  return withApiHandler("workers.build", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("worker_build", organizationId)
    const { id } = await params

    const worker = await getWorker(id, organizationId)
    if (!worker) throw new NotFoundError()

    if (!worker.identity.name.trim()) throw new ValidationError("Set a name before building.")
    if (!worker.mission.trim()) throw new ValidationError("Set a mission before building.")
    if (!worker.skills.some((s) => s.enabled)) throw new ValidationError("Enable at least one skill before building.")

    const snapshot: WorkerDefinitionSnapshot = {
      identity: worker.identity,
      mission: worker.mission,
      objectives: worker.objectives,
      knowledge: worker.knowledge,
      skills: worker.skills,
      tools: worker.tools,
      integrations: worker.integrations,
      behaviors: worker.behaviors,
      channels: worker.channels,
      outcome: worker.outcome,
      autonomy: worker.autonomy,
    }
    const fingerprint = createHash("sha256").update(stableStringify(snapshot)).digest("hex")

    const version = await buildWorkerVersion(id, organizationId, snapshot, fingerprint)
    await recordAudit({ orgId: organizationId, userId, action: "worker.build", resourceType: "worker_version", resourceId: version.id, metadata: { workerId: id, versionNumber: version.versionNumber } })

    const updated = await getWorker(id, organizationId)
    return NextResponse.json({ worker: hydrateWorkerLiveState(updated!), version })
  })
}
