import "server-only"

/* POST /api/products/[productId]/onboard — provisions (or re-onboards)
 * this organization's Worker for a Product.
 *
 * "Tailor-made" happens entirely here: the real onboarding answers
 * become the Worker's real Domain Profile KnowledgeSource content and
 * real BehaviorRule heuristics (lib/products/domain-profile.ts) —
 * both already wired into every skill's execute() via
 * retrieveRelevantKnowledge()/buildSystemPrompt(). Nothing downstream
 * (the runtime, Studio, the execution ledger) needs to know a Worker
 * came from a Product at all.
 *
 * Idempotent per org+product: onboarding again updates the SAME
 * Worker's Domain Profile and heuristics rather than creating a
 * second one — re-running onboarding is how a customer corrects or
 * evolves their tailor-made profile. */

import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { hydrateWorkerLiveState } from "@/lib/agent/hydrate"
import { withApiHandler, NotFoundError, ValidationError } from "@/lib/api-error"
import { getWorkerByProduct, recordAudit, upsertWorker } from "@/lib/db/repo"
import { logger } from "@/lib/observability/logger"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"
import { getProduct } from "@/lib/products/catalog"
import { buildDomainProfileContent, deriveHeuristics, deriveMissionSeed, DERIVED_HEURISTIC_CONDITION, type OnboardingAnswers } from "@/lib/products/domain-profile"
import { buildWorkerFromProduct } from "@/lib/workforce/seed"

type Params = { params: Promise<{ productId: string }> }

export async function POST(req: Request, { params }: Params) {
  return withApiHandler("products.onboard", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("worker_create", organizationId)

    const { productId } = await params
    const product = getProduct(productId)
    if (!product) throw new NotFoundError()

    const body = (await req.json().catch(() => null)) as { answers?: OnboardingAnswers } | null
    const answers = body?.answers ?? {}
    for (const field of product.onboarding) {
      if (field.required && !answers[field.key]?.trim()) {
        throw new ValidationError(`"${field.label}" is required.`)
      }
    }
    for (const key of Object.keys(answers)) {
      if (typeof answers[key] === "string" && answers[key].length > 2000) {
        throw new ValidationError(`One of your answers is too long (max 2000 characters).`)
      }
    }

    const domainProfileContent = buildDomainProfileContent(product, answers)
    const heuristics = deriveHeuristics(product, answers)
    const mission = deriveMissionSeed(product, answers)

    const existing = await getWorkerByProduct(organizationId, product.id)
    const worker = buildWorkerFromProduct(existing?.id ?? `worker_${randomUUID()}`, product, domainProfileContent, heuristics, mission)
    if (existing) {
      // Re-onboarding: keep the Worker's existing identity/status/
      // release history, replace only what onboarding actually owns —
      // Domain Profile knowledge + heuristics. A worker someone has
      // already customized further in Studio keeps those edits.
      worker.status = existing.status
      worker.tested = existing.tested
      worker.releasedVersionId = existing.releasedVersionId
      worker.releasedAt = existing.releasedAt
      worker.identity = existing.identity
      worker.mission = existing.mission
      worker.outcome = existing.outcome
      worker.channels = existing.channels
      worker.objectives = existing.objectives
      // Replace ONLY the Domain Profile — keep real accumulated Memory
      // (lib/db/repo.ts's appendWorkerMemory()) and any other knowledge
      // the operator added by hand in Studio; re-onboarding must never
      // erase real execution history.
      worker.knowledge = [...worker.knowledge, ...existing.knowledge.filter((k) => k.name !== "Domain Profile")]
      // Replace ONLY previously onboarding-derived heuristics (tagged by
      // deriveHeuristics()'s fixed marker condition) with the freshly
      // derived set — keep anything the operator added by hand in
      // Studio's Behavior step untouched. Without this tag, re-running
      // onboarding would pile up a duplicate heuristic every time.
      worker.behaviors = [...worker.behaviors, ...existing.behaviors.filter((b) => b.condition !== DERIVED_HEURISTIC_CONDITION)]
    }

    const saved = await upsertWorker(worker, organizationId, userId)
    await recordAudit({
      orgId: organizationId,
      userId,
      action: existing ? "product.reonboard" : "product.onboard",
      resourceType: "worker",
      resourceId: saved.id,
      metadata: { productId: product.id, answerKeys: Object.keys(answers) },
    })
    logger.info("product_onboarded", { organizationId, userId, productId: product.id, workerId: saved.id, reonboard: !!existing })

    return NextResponse.json({ worker: hydrateWorkerLiveState(saved), product })
  })
}
