/* ================================================================== *
 * WORKFLOW STATE MACHINE — every transition explicit; anything not
 * listed is invalid and throws (§3: "Invalid state transitions must
 * fail"). Pure, dependency-free — fully unit-testable.
 * ================================================================== */

import { InvalidWorkflowTransitionError, type WorkflowStatus } from "./types"

const TERMINAL: ReadonlySet<WorkflowStatus> = new Set(["succeeded", "failed", "cancelled"])

const VALID_TRANSITIONS: Record<WorkflowStatus, ReadonlySet<WorkflowStatus>> = {
  queued: new Set(["running", "cancelled"]),
  running: new Set(["waiting", "paused", "waiting_approval", "retrying", "succeeded", "failed", "cancelled", "timed_out"]),
  waiting: new Set(["running", "failed", "cancelled", "timed_out"]),
  paused: new Set(["running", "cancelled"]),
  waiting_approval: new Set(["running", "failed", "cancelled"]),
  retrying: new Set(["running", "failed", "cancelled"]),
  succeeded: new Set([]),
  failed: new Set(["retrying"]), // an explicit, human/API-triggered manual retry (POST .../retry)
  cancelled: new Set([]),
  timed_out: new Set(["retrying"]),
}

export function isTerminal(status: WorkflowStatus): boolean {
  return TERMINAL.has(status)
}

export function isValidTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  if (from === to) return false // never a self-transition — every change must be a real, meaningful move
  return VALID_TRANSITIONS[from].has(to)
}

/** Throws InvalidWorkflowTransitionError for any transition not in the
 * table above — callers (lib/workflow/engine.ts) must call this before
 * every status write, never write a status string directly. */
export function assertValidTransition(from: WorkflowStatus, to: WorkflowStatus): void {
  if (!isValidTransition(from, to)) throw new InvalidWorkflowTransitionError(from, to)
}
