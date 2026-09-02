import "server-only"

/* POST /api/knowledge/tick — the Commit 12B durability backstop.
 *
 * after() (see saveUrl/retry) is a FAST PATH, not a guarantee: it
 * best-effort claims and runs the exact job a save/retry just
 * enqueued, in the shadow of that same request. If it never runs at
 * all — the function is torn down, the deploy rolls mid-request,
 * anything — the job it would have claimed simply stays `queued` in
 * Postgres, durable but unattended, until something else claims it.
 * This route is that "something else": invoked on a schedule (see
 * vercel.json), it drains whatever is currently claimable using the
 * EXACT SAME primitives 12A already built and 9f6091a already
 * hardened — repo.claimJobs()'s FOR UPDATE SKIP LOCKED claim,
 * service.claimAndRunJob()'s retry/backoff/max-attempt handling, and
 * completeJob/failJob's lease fencing. Nothing here is a second job
 * engine; this route is a thin wrapper around lib/knowledge/tick.ts's
 * isAuthorizedCronRequest + drainJobs (kept next/server-free so they
 * stay testable in this repo's plain-Node test runner), which itself
 * only decides HOW MANY rounds to run and WHEN to stop, then calls
 * straight into the same claimAndRunJob the fast path already uses.
 *
 * SECRET-GATED, not session-gated: there is no human user behind a
 * cron invocation, so this does not (and must not) go through
 * requireSession(). Vercel's own Cron Jobs feature calls a scheduled
 * route with `Authorization: Bearer ${CRON_SECRET}` — see vercel.json
 * for the schedule and .env.example for the required env var. The
 * comparison is constant-time; the secret is never echoed anywhere
 * (not in the 401 body, not in a log line, not in a thrown error).
 *
 * SCHEDULE (vercel.json, `"schedule": "0 0 * * *"`, once daily at UTC
 * midnight): deliberately the safe-on-any-plan choice, not a claim
 * that this deployment's plan supports more. Vercel Cron on Hobby
 * fires at most once/day; Pro allows far more frequent schedules, but
 * nothing in this repository (no prior vercel.json, no plan-tier
 * config) confirms which this deployment actually is, and picking a
 * schedule the plan can't run risks the whole deployment failing at
 * build time — a much bigger cost than a conservative default. If
 * this deployment is confirmed Pro, tightening this to a more frequent
 * schedule is a one-line change with no code impact: after() stays
 * the fast path either way, and this route's own job is exactly the
 * same at any interval — sweep whatever's currently claimable.
 *
 * Accepts NO input from its caller beyond that one header — no jobId,
 * orgId, userId, or item id, ever. Every job this route touches is
 * discovered exclusively through claimJobs()'s own claim query, and
 * every write happens through the same owner-scoped repo functions
 * runIngestJob already uses, using each claimed row's OWN persisted
 * (org_id, created_by) — never anything this request supplies. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { claimAndRunJob } from "@/lib/knowledge/service"
import { DEFAULT_BATCH_SIZE, DEFAULT_TIME_BUDGET_MS, drainJobs, isAuthorizedCronRequest } from "@/lib/knowledge/tick"
import { logger } from "@/lib/observability/logger"

export const runtime = "nodejs"
// Vercel Hobby's configurable ceiling — matches the one other route in
// this codebase that already declares maxDuration (app/api/workers/
// [id]/run/route.ts). DEFAULT_TIME_BUDGET_MS (lib/knowledge/tick.ts)
// is kept comfortably under this, leaving real margin for the auth
// check, the in-flight round finishing, and response serialization.
export const maxDuration = 60

export async function POST(req: Request) {
  // Deliberately outside withApiHandler: this 401 path must stay
  // simple and predictable, with nothing between the check and the
  // response that could ever be tempted to echo the header or the
  // secret into a log line or an error message.
  if (!isAuthorizedCronRequest(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    logger.warn("knowledge_tick_unauthorized", {})
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  return withApiHandler("knowledge.tick", async () => {
    const summary = await drainJobs({
      claim: claimAndRunJob,
      batchSize: DEFAULT_BATCH_SIZE,
      timeBudgetMs: DEFAULT_TIME_BUDGET_MS,
    })
    logger.info("knowledge_tick_complete", { ...summary })
    return NextResponse.json({ ok: true, ...summary })
  })
}
