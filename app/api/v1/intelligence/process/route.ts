import "server-only"

/* POST /api/v1/intelligence/process — the real-time intelligence worker
 * tick (§7, ADR-032/033). Same shape and same auth convention as
 * /api/v1/workflows/process: no persistent listener process exists in
 * this deployment, so this endpoint IS the drain — invoked on a
 * schedule (see vercel.json) and hits processIntelligenceEventQueue()
 * to claim and process due rows from migrations/0010's durable
 * intelligence_event_queue, one bounded (org, project, event) unit of
 * work per row. */

import { NextResponse } from "next/server"
import { logger, newRequestId } from "@/lib/observability/logger"
import { processIntelligenceEventQueue } from "@/lib/intelligence/recalc-worker"

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
    const result = await processIntelligenceEventQueue(20)
    logger.info("intelligence_worker_tick", { requestId, ...result, errors: result.errors.length })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    logger.error("intelligence_worker_tick_failed", { requestId, message: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ ok: false, error: "Intelligence worker tick failed." }, { status: 500 })
  }
}
