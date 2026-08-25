/* ------------------------------------------------------------------ *
 * Client-side response shapes for the real Observatory API
 * (app/api/observatory/*) — mirrors lib/db/repo.ts's ExecutionSummary/
 * ExecutionListItem/ActivityItem/WorkerHealth exactly, kept as plain
 * types here (no "server-only" import) so client components can use
 * them without pulling server-only code into the browser bundle.
 * ------------------------------------------------------------------ */

export type ExecutionStatus = "queued" | "running" | "pending_approval" | "resuming" | "retrying" | "completed" | "partially_completed" | "failed" | "blocked" | "cancelled"

export interface ExecutionSummary {
  total: number
  completed: number
  partiallyCompleted: number
  failed: number
  running: number
  pendingApproval: number
  blocked: number
  cancelled: number
  queued: number
  successRate: number | null
  avgDurationMs: number | null
  totalOutputs: number
  totalApprovals: number
  approvalsApproved: number
  approvalsRejected: number
  approvalsPending: number
  approvalRate: number | null
}

export interface ExecutionListItem {
  id: string
  workerId: string
  workerName: string
  status: ExecutionStatus
  startedAt: number
  completedAt: number | null
  durationMs: number | null
  outputCount: number
  approvalStatus: "pending" | "approved" | "rejected" | null
  maxAttempt: number | null
}

export interface ActivityItem {
  id: string
  executionId: string
  workerId: string
  workerName: string
  type: string
  timestamp: number
  payload: Record<string, unknown>
}

export interface WorkerHealth {
  workerId: string
  workerName: string
  executions: number
  completed: number
  failed: number
  successRate: number | null
  lastExecutionAt: number | null
  lastExecutionStatus: ExecutionStatus | null
  outputs: number
  avgDurationMs: number | null
}

export interface ObservatoryFilters {
  workerId?: string
  status?: ExecutionStatus
  sinceMs?: number
  approvalState?: "pending" | "approved" | "rejected" | "none"
}
