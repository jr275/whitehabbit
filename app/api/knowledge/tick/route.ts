import "server-only"

/* ================================================================== *
 * POST /api/knowledge/tick — INTERNAL. Drives the ingestion queue.
 *
 * after() on the save path handles the common case, but two things
 * need a heartbeat that no user request will provide:
 *
 *   · retries whose exponential backoff has elapsed
 *   · jobs whose runner died mid-flight (the reaper)
 *
 * Without this, a retry scheduled for 60s from now only runs if
 * somebody happens to save something else, and a stranded job stays
 * stranded. Point a scheduler at this endpoint every minute.
 *
 * Auth: a shared secret in KNOWLEDGE_TICK_SECRET, compared in constant
 * time. This is NOT a user-session endpoint — it operates across
 * workspaces by design, which is exactly why it must never be
 * reachable with a normal session.
 *
 * When the secret is unset the endpoint refuses (503) rather than
 * running unauthenticated. A cron endpoint that silently accepts
 * anonymous callers is a denial-of-wallet vector.
 * ================================================================== */

import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { logger, newRequestId } from "@/lib/platform/logger"
import { drainQueue } from "@/lib/knowledge/ingestion/runner"

export const runtime = "nodejs"
export const maxDuration = 60

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on length mismatch, so compare lengths first.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  const requestId = newRequestId()
  const expected = process.env.KNOWLEDGE_TICK_SECRET

  if (!expected || expected.length < 16) {
    logger.error("knowledge_tick_not_configured", { requestId })
    return NextResponse.json(
      { error: "The ingestion scheduler is not configured on this deployment." },
      { status: 503 },
    )
  }

  const header = req.headers.get("authorization") ?? ""
  const provided = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (!secretMatches(provided, expected)) {
    // Deliberately no detail: this endpoint's existence should not be
    // a probing surface.
    return NextResponse.json({ error: "Not found." }, { status: 404 })
  }

  try {
    const result = await drainQueue({ maxJobs: 10, budgetMs: 45_000, reap: true })
    logger.info("knowledge_tick", { requestId, ...result, reaped: undefined, ...result.reaped })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    logger.error("knowledge_tick_failed", {
      requestId,
      message: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: "Tick failed." }, { status: 500 })
  }
}
