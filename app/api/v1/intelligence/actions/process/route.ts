import "server-only"

/* POST /api/v1/intelligence/actions/process — the real Action queue
 * worker tick (Phase 7, §3, ADR-038). Same shape and auth convention
 * as /api/v1/workflows/process and /api/v1/intelligence/process: no
 * persistent worker process exists in this deployment — this endpoint
 * IS the drain, invoked on a schedule (vercel.json). */

import { NextResponse } from "next/server"
import { logger, newRequestId } from "@/lib/observability/logger"
import { processActionQueue } from "@/lib/intelligence/action-executor"

export async function POST(req: Request) {
  const requestId = newRequestId()
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }
  }

  try {
    const result = await processActionQueue(10)
    logger.info("action_worker_tick", { requestId, ...result, errors: result.errors.length })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    logger.error("action_worker_tick_failed", { requestId, message: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ ok: false, error: "Action worker tick failed." }, { status: 500 })
  }
}
