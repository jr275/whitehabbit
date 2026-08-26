import "server-only"

/* POST /api/v1/workflows/process — the queue worker tick (§7 ADR-017,
 * §3 ADR-023). No persistent worker process exists in this deployment
 * (a single Next.js app) — this endpoint IS the worker: invoked on a
 * schedule by Vercel Cron (see vercel.json) and hits processStepQueue()
 * to drain due STEP jobs — one bounded step per job, never a whole
 * pipeline (Phase 5A). Never claims a background worker exists beyond
 * this — each invocation is one real, bounded, complete unit of work.
 *
 * Protected by CRON_SECRET (Vercel Cron sends it as a Bearer token
 * automatically for scheduled invocations, per Vercel's own cron auth
 * convention) so this can't be used to run arbitrary tenants' queued
 * work on demand by an unauthenticated caller. */

import { NextResponse } from "next/server"
import { logger, newRequestId } from "@/lib/observability/logger"
import { processStepQueue } from "@/lib/workflow/step-worker"

export async function POST(req: Request) {
  const requestId = newRequestId()
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }
  }
  // With no CRON_SECRET configured (local dev), the endpoint stays
  // open — acceptable only because it does real, idempotent, tenant-
  // scoped work (dequeue+execute+ack), never destructive action.

  try {
    const result = await processStepQueue(10)
    logger.info("worker_tick", { requestId, ...result, errors: result.errors.length })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    logger.error("worker_tick_failed", { requestId, message: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ ok: false, error: "Worker tick failed." }, { status: 500 })
  }
}
