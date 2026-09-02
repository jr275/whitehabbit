import "server-only"

/* GET /api/intelligence — real "Operational Intelligence" (section 8
 * of the productization brief), replacing /insights's scripted demo
 * Q&A. Every field here is computed server-side from real, already-
 * persisted data (lib/db/repo.ts's listWorkerHealth/
 * getExecutionSummary) — no conversation data, no invented causality.
 *
 * Deliberately excluded (see lib/workforce/health.ts's header and the
 * final productization report): "which tools fail most" — the
 * tool_failed/tool_blocked WorkerEventType values are declared but no
 * skill in this codebase ever actually emits them (only tool_called/
 * tool_completed are real), so there is no real data behind that
 * question yet. Reported as a gap, not estimated. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { getExecutionSummary, listWorkerHealth } from "@/lib/db/repo"
import { classifyWorkerHealth } from "@/lib/workforce/health"
import { requireSession } from "@/lib/session"

const PERIOD_MS = 7 * 24 * 60 * 60 * 1000

export async function GET() {
  return withApiHandler("intelligence.get", async () => {
    const { organizationId } = await requireSession()
    const now = Date.now()

    const [current, previous, workers] = await Promise.all([
      getExecutionSummary(organizationId, { sinceMs: now - PERIOD_MS }),
      getExecutionSummary(organizationId, { sinceMs: now - PERIOD_MS * 2, untilMs: now - PERIOD_MS }),
      listWorkerHealth(organizationId),
    ])

    const withRuns = workers.filter((w) => w.executions > 0)

    const topFailing = withRuns.filter((w) => w.failed > 0).sort((a, b) => b.failed - a.failed)[0] ?? null
    const topSuccess = withRuns.filter((w) => w.successRate != null).sort((a, b) => (b.successRate ?? 0) - (a.successRate ?? 0) || b.executions - a.executions)[0] ?? null
    const topOutputs = workers.filter((w) => w.outputs > 0).sort((a, b) => b.outputs - a.outputs)[0] ?? null

    const attention = withRuns
      .map((w) => ({ worker: w, state: classifyWorkerHealth(w) }))
      .filter((x) => x.state === "failing" || x.state === "degraded")
      .sort((a, b) => b.worker.failed - a.worker.failed)
      .slice(0, 5)
      .map((x) => ({ workerId: x.worker.workerId, workerName: x.worker.workerName, state: x.state, failed: x.worker.failed, executions: x.worker.executions, avgDurationMs: x.worker.avgDurationMs }))

    return NextResponse.json({
      period: {
        windowDays: 7,
        current: { total: current.total, completed: current.completed, failed: current.failed, successRate: current.successRate },
        previous: { total: previous.total, completed: previous.completed, failed: previous.failed, successRate: previous.successRate },
      },
      topFailing: topFailing ? { workerId: topFailing.workerId, workerName: topFailing.workerName, failed: topFailing.failed, executions: topFailing.executions } : null,
      topSuccess: topSuccess ? { workerId: topSuccess.workerId, workerName: topSuccess.workerName, successRate: topSuccess.successRate, executions: topSuccess.executions } : null,
      topOutputs: topOutputs ? { workerId: topOutputs.workerId, workerName: topOutputs.workerName, outputs: topOutputs.outputs } : null,
      approvals: { pending: current.approvalsPending, rate: current.approvalRate },
      attention,
      gaps: ["Which tools fail most often is not yet answerable — no skill in the runtime currently emits a tool-failure event, so there is no real data behind that question."],
    })
  })
}
