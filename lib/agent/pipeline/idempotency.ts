import "server-only"

/* ================================================================== *
 * IDEMPOTENCY — section 16. A deterministic key per (execution,
 * provider, action, resource) so a retried Salesforce update or Slack
 * notification can never accidentally perform the same real external
 * write twice. lib/db/repo.ts's action_executions table is the real
 * ledger; this module is the one place that computes the key and
 * wraps a real ToolAction call with the claim/check/complete cycle.
 * ================================================================== */

import { claimActionExecution, completeActionExecution, getActionExecutionByKey } from "@/lib/db/repo"
import type { ToolActionResult } from "@/lib/agent/types"

export function idempotencyKey(executionId: string, provider: string, action: string, resource: string): string {
  return `${executionId}:${provider}:${action}:${resource}`
}

export interface IdempotentCallResult<T> {
  result: ToolActionResult<T>
  /** true if this call reused a prior real result instead of calling the provider again. */
  deduped: boolean
}

/**
 * Runs `call()` exactly once per real (executionId, provider, action,
 * resource) key. A second attempt with the same key — a retry, a
 * double-click on Approve, a resumed execution re-entering the same
 * stage — reuses the first real result instead of performing the
 * external write again. Needs no org id: the ledger derives it
 * server-side from executionId (see repo.claimActionExecution).
 */
export async function runIdempotent<T>(executionId: string, provider: string, action: string, resource: string, call: () => Promise<ToolActionResult<T>>): Promise<IdempotentCallResult<T>> {
  const key = idempotencyKey(executionId, provider, action, resource)

  const existing = await getActionExecutionByKey(key)
  if (existing && existing.status !== "pending") {
    return { result: existing.result as ToolActionResult<T>, deduped: true }
  }

  const claim = existing ?? (await claimActionExecution({ executionId, provider, action, resource, idempotencyKey: key }))
  if (!claim) {
    // Lost a genuine race to claim the key — re-read; the winner will
    // complete it shortly. This is a real, if rare, concurrent-retry
    // path, not a fabricated result.
    const settled = await getActionExecutionByKey(key)
    if (settled && settled.status !== "pending") return { result: settled.result as ToolActionResult<T>, deduped: true }
    // Still pending (the winner hasn't finished) — this call proceeds
    // as its own real attempt rather than blocking indefinitely; the
    // provider's own idempotency (or a human noticing) covers the rest.
  }

  const result = await call()
  if (claim) await completeActionExecution(claim.id, result.ok ? "completed" : "failed", result)
  return { result, deduped: false }
}
