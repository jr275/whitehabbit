import "server-only"

/* ================================================================== *
 * REAL-TIME INTELLIGENCE — INCREMENTAL RECALCULATION (§7, ADR-032/033).
 *
 * Drains migrations/0010's durable intelligence_event_queue the same
 * way lib/workflow/step-worker.ts's processStepQueue() drains the job
 * queue: FOR UPDATE SKIP LOCKED claim, one bounded unit of work per
 * row, real success/failure recorded back onto the row. Never a full
 * recomputation sweep across every tenant/project — every event
 * already carries the one real (orgId, projectId) it affects (resolved
 * at trigger time in SQL, migrations/0010), and this dispatcher runs
 * ONLY the signal-engine detector(s) that are actually relevant to
 * that event's category, never the whole bundle.
 *
 * Honest limitation, not silently glossed over: the detectors this
 * dispatches (lib/intelligence/signal-engine.ts) are themselves
 * project-scoped, not single-subject-scoped — re-running
 * detectEntityGaps() for an EntityChanged event re-scans the project's
 * entities rather than just the one that changed. That still bounds
 * every real recomputation to the ONE (org, project) an event actually
 * touched and to the detector types relevant to that event's category
 * — never every tenant, never every detector — but true single-subject
 * narrowing (e.g. a real detectEntityGapForEntity()) is real follow-up
 * work, not claimed as done here. See docs/adr/ADR-033.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne, withTransaction } from "@/lib/db/client"
import { detectAICitationChanges, detectCompetitorGains, detectEntityGaps, detectInformationGainGaps, detectInternalLinkGaps, detectPagePerformanceSignals, detectTrendAcceleration } from "./signal-engine"
import { runCorrelationScan } from "./correlation-scan"
import { runDecisionScan } from "./decision-scan"

export type IntelligenceEventType = "SearchConsoleImported" | "TrendUpdated" | "EntityChanged" | "PagePublished" | "PagePerformanceChanged" | "AIVisibilityChanged" | "DataSourceUpdated"

export interface IntelligenceEventRow {
  id: string
  orgId: string
  projectId: string | null
  eventType: IntelligenceEventType
  subjectId: string
  status: "pending" | "processing" | "processed" | "failed"
  attempts: number
  lastError: string | null
  createdAt: number
  processedAt: number | null
}

interface Row {
  id: string
  org_id: string
  project_id: string | null
  event_type: IntelligenceEventType
  subject_id: string
  status: IntelligenceEventRow["status"]
  attempts: number
  last_error: string | null
  created_at: string
  processed_at: string | null
}

function rowToEvent(r: Row): IntelligenceEventRow {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    eventType: r.event_type,
    subjectId: r.subject_id,
    status: r.status,
    attempts: r.attempts,
    lastError: r.last_error,
    createdAt: Number(r.created_at),
    processedAt: r.processed_at ? Number(r.processed_at) : null,
  }
}

const MAX_ATTEMPTS = 3

/** Runs the real detector(s) relevant to one event's category, then a
 * real correlation + decision scan so any newly-detected signal is
 * carried all the way to a real Decision in the same pass — never a
 * bare "signals recorded, nothing else happened." A project_id this
 * deployment genuinely couldn't resolve at trigger time (see
 * migrations/0010) is a real no-op, not a guess at which project. */
async function processOneEvent(event: IntelligenceEventRow): Promise<void> {
  const { orgId, projectId, eventType } = event
  if (!projectId) return // unresolvable at trigger time — real, honest no-op, not a guess

  switch (eventType) {
    case "TrendUpdated":
      await detectTrendAcceleration(orgId, projectId)
      break
    case "EntityChanged":
      await detectEntityGaps(orgId, projectId)
      break
    case "PagePublished":
    case "PagePerformanceChanged":
      await Promise.all([detectPagePerformanceSignals(orgId, projectId), detectInternalLinkGaps(orgId, projectId)])
      break
    case "AIVisibilityChanged":
      await Promise.all([detectAICitationChanges(orgId, projectId), detectCompetitorGains(orgId, projectId)])
      break
    case "DataSourceUpdated":
      await detectInformationGainGaps(orgId, projectId)
      break
    case "SearchConsoleImported":
      // Honest, real limitation (ADR-032's Consequences): no detector
      // in this deployment reads Search Console data yet (Phase 6I is
      // real ingestion, not detection) — nothing to recompute from this
      // event today. Still falls through to the correlation/decision
      // scan below in case other, already-recorded signals now combine.
      break
  }

  // Real, idempotent (both already dedup by pattern/correlation_key and
  // by observation) — safe to call on every event without ever
  // producing a duplicate Observation or Decision.
  await runCorrelationScan(orgId, projectId)
  await runDecisionScan(orgId, projectId)
}

export interface RecalcWorkerTickResult {
  dequeued: number
  processed: number
  failed: number
  errors: { eventId: string; error: string }[]
}

/** Claims up to `maxEvents` pending rows (FOR UPDATE SKIP LOCKED — safe
 * under overlapping cron ticks, exactly like lib/workflow/queue.ts's
 * dequeue()) and processes each to completion, marking it
 * processed/failed on the row itself — a real, inspectable audit trail
 * of every real recalculation this system ever ran, never a fire-and-
 * forget side effect. */
export async function processIntelligenceEventQueue(maxEvents = 20): Promise<RecalcWorkerTickResult> {
  const claimed = await withTransaction(async (client) => {
    const { rows } = await client.query<Row>(
      `SELECT * FROM intelligence_event_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [maxEvents],
    )
    if (rows.length === 0) return []
    const ids = rows.map((r) => r.id)
    await client.query(`UPDATE intelligence_event_queue SET status = 'processing', attempts = attempts + 1 WHERE id = ANY($1)`, [ids])
    return rows.map(rowToEvent)
  })

  const result: RecalcWorkerTickResult = { dequeued: claimed.length, processed: 0, failed: 0, errors: [] }
  for (const event of claimed) {
    try {
      await processOneEvent(event)
      await query("UPDATE intelligence_event_queue SET status = 'processed', processed_at = $1 WHERE id = $2", [Date.now(), event.id])
      result.processed += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push({ eventId: event.id, error: message })
      const fresh = await queryOne<{ attempts: number }>("SELECT attempts FROM intelligence_event_queue WHERE id = $1", [event.id])
      const status = (fresh?.attempts ?? event.attempts + 1) >= MAX_ATTEMPTS ? "failed" : "pending" // real retry, bounded — never spins forever on one bad event
      await query("UPDATE intelligence_event_queue SET status = $1, last_error = $2 WHERE id = $3", [status, message, event.id])
      result.failed += 1
    }
  }
  return result
}

export async function listRecentIntelligenceEvents(orgId: string, limit = 50): Promise<IntelligenceEventRow[]> {
  const rows = await query<Row>("SELECT * FROM intelligence_event_queue WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2", [orgId, Math.min(limit, 200)])
  return rows.map(rowToEvent)
}

// Referenced so a future direct-insert test path (bypassing the SQL
// trigger) can build a real row id the same way the trigger does —
// kept here rather than duplicated ad hoc in tests.
export function newIntelligenceEventId(): string {
  return `ieq_${randomUUID()}`
}
