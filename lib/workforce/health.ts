/* ================================================================== *
 * WORKER HEALTH/STATUS CLASSIFIERS — deterministic, explainable, zero
 * ML. Every branch reads a real, already-persisted field from
 * lib/db/repo.ts's WorkerHealth (itself a real SQL aggregate over
 * workers/executions/outputs — see GET /api/observatory/workers).
 * Client-safe: no "server-only" import, so the Workers directory,
 * Worker Detail, and Operational Intelligence can all import this
 * directly without pulling server code into the browser bundle.
 * ================================================================== */

export type WorkerRuntimeStatus = "draft" | "building" | "ready" | "running" | "failed" | "idle" | "live"
export type WorkerHealthState = "healthy" | "degraded" | "failing" | "no_data"

/** The subset of WorkerHealth this module needs — kept structural
 * (not imported from lib/db/repo, which is server-only) so this file
 * stays importable from client components. */
export interface WorkerHealthInput {
  workerStatus: "draft" | "building" | "ready" | "live"
  executions: number
  successRate: number | null
  lastExecutionStatus: string | null
}

const IN_FLIGHT_STATUSES = new Set(["running", "resuming", "retrying", "pending_approval"])
const FAILED_STATUSES = new Set(["failed", "blocked", "cancelled"])

/**
 * Real, persisted lifecycle state is authoritative for draft/building/
 * ready — Studio's own Release gate is the only thing that ever moves
 * a Worker to "live" (lib/db/repo.ts's releaseWorkerVersion), so there
 * is nothing to infer there. Only once a Worker is "live" do we layer
 * its real, most-recent execution history to distinguish RUNNING
 * (currently mid-flight), FAILED (last concluded run didn't succeed),
 * IDLE (released but never actually run), or LIVE (released, has run,
 * last concluded run succeeded) — section 4/18 of the productization
 * brief. Never inferred from UI state, only from real persisted rows.
 */
export function classifyWorkerRuntimeStatus(health: WorkerHealthInput): WorkerRuntimeStatus {
  if (health.workerStatus !== "live") return health.workerStatus // draft | building | ready

  if (health.lastExecutionStatus && IN_FLIGHT_STATUSES.has(health.lastExecutionStatus)) return "running"
  if (health.executions === 0) return "idle"
  if (health.lastExecutionStatus && FAILED_STATUSES.has(health.lastExecutionStatus)) return "failed"
  return "live"
}

export const WORKER_RUNTIME_STATUS_META: Record<WorkerRuntimeStatus, { label: string; tone: "good" | "info" | "warn" | "bad" | "muted" }> = {
  draft: { label: "Draft", tone: "muted" },
  building: { label: "Building", tone: "info" },
  ready: { label: "Ready", tone: "info" },
  running: { label: "Running", tone: "info" },
  failed: { label: "Failed", tone: "bad" },
  idle: { label: "Idle", tone: "muted" },
  live: { label: "Live", tone: "good" },
}

/**
 * NO_DATA: never executed — there's nothing to judge yet.
 * FAILING: the most recent concluded execution did not succeed.
 * DEGRADED: the most recent run succeeded, but either it was only a
 *   partial success, or the worker's overall real success rate is
 *   below 70% — a worker that "worked last time" but fails often
 *   isn't healthy just because of the most recent sample.
 * HEALTHY: the most recent run succeeded and the overall real success
 *   rate is at or above 70%.
 * The 70% threshold is a plain, stated constant — not a learned or
 * hidden value — and can be revisited, but it is applied uniformly
 * and explained here, not buried in a magic number at a call site.
 */
const DEGRADED_SUCCESS_RATE_THRESHOLD = 0.7

export function classifyWorkerHealth(health: WorkerHealthInput): WorkerHealthState {
  if (health.executions === 0) return "no_data"
  if (health.lastExecutionStatus && FAILED_STATUSES.has(health.lastExecutionStatus)) return "failing"
  if (health.lastExecutionStatus === "partially_completed") return "degraded"
  if (health.successRate != null && health.successRate < DEGRADED_SUCCESS_RATE_THRESHOLD) return "degraded"
  return "healthy"
}

export const WORKER_HEALTH_STATE_META: Record<WorkerHealthState, { label: string; tone: "good" | "warn" | "bad" | "muted" }> = {
  healthy: { label: "Healthy", tone: "good" },
  degraded: { label: "Degraded", tone: "warn" },
  failing: { label: "Failing", tone: "bad" },
  no_data: { label: "No data", tone: "muted" },
}
