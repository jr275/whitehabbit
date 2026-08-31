import "server-only"

/* POST /api/pocket2/jobs/tick — runs a batch of ingestion jobs.
 *
 * Serverless has nothing running between requests, so the queue is
 * drained by invoking this: from Vercel Cron in production, or
 * directly during development. It is idempotent and safe to call
 * concurrently — claimJobs() uses FOR UPDATE SKIP LOCKED.
 *
 * AUTHORIZATION: this endpoint is not user-facing and is NOT gated by
 * a session — cron has none. It requires a shared secret in
 * Authorization: Bearer, compared in constant time. If POCKET2_CRON_SECRET
 * is unset the route refuses every request rather than defaulting to
 * open: an unauthenticated endpoint that makes the server fetch
 * arbitrary URLs is precisely what must never be left ungated. */

import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { logger } from "@/lib/observability/logger"
import { DEFAULT_BATCH, runIngestTick } from "@/lib/pocket2/ingest/worker"

export const dynamic = "force-dynamic"
// Ingestion fetches real pages over the network; the default budget is
// not enough for a batch of them.
export const maxDuration = 60

function authorized(req: Request): boolean {
  const secret = process.env.POCKET2_CRON_SECRET
  if (!secret) return false

  const header = req.headers.get("authorization") ?? ""
  const presented = header.startsWith("Bearer ") ? header.slice(7) : ""
  const a = Buffer.from(presented)
  const b = Buffer.from(secret)
  // Compare lengths separately: timingSafeEqual throws on a mismatch,
  // and the length itself is not the secret.
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  return withApiHandler("pocket2.jobs.tick", async () => {
    if (!authorized(req)) {
      logger.warn("pocket2_tick_unauthorized", {})
      return NextResponse.json({ error: "Not found." }, { status: 404 })
    }

    const requested = Number(new URL(req.url).searchParams.get("batch"))
    const batch = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 20) : DEFAULT_BATCH

    return NextResponse.json(await runIngestTick(batch))
  })
}
