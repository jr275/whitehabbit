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
 * Runs `call()` at most once-to-success per real (executionId,
 * provider, action, resource) key (section 8: a FAILED attempt must
 * remain retryable, never permanently cached as a failure — only a
 * genuinely COMPLETED action is a real dedupe target). A second
 * attempt with the same key — a retry, a double-click on Approve, a
 * resumed execution re-entering the same stage, an explicit "retry
 * failed step" — reuses the first real SUCCESSFUL result instead of
 * performing the external write again; a prior FAILURE is reclaimed
 * (attempt incremented) and genuinely retried. Needs no org id: the
 * ledger derives it server-side from executionId (see
 * repo.claimActionExecution).
 */
export async function runIdempotent<T>(executionId: string, provider: string, action: string, resource: string, call: () => Promise<ToolActionResult<T>>, opts?: { stepId?: string; integrationId?: string }): Promise<IdempotentCallResult<T>> {
  const key = idempotencyKey(executionId, provider, action, resource)

  const existing = await getActionExecutionByKey(key)
  if (existing?.status === "completed") {
    return { result: existing.result as ToolActionResult<T>, deduped: true }
  }

  const claim = await claimActionExecution({ executionId, provider, action, resource, idempotencyKey: key, stepId: opts?.stepId, integrationId: opts?.integrationId })
  if (!claim) {
    // Lost a genuine race to claim/reclaim the key — re-read. If the
    // winner already completed it successfully, reuse that real
    // result. Otherwise (still pending elsewhere, or the winner's own
    // failure hasn't been reclaimed yet) this call proceeds as its
    // own real attempt rather than blocking indefinitely.
    const settled = await getActionExecutionByKey(key)
    if (settled?.status === "completed") return { result: settled.result as ToolActionResult<T>, deduped: true }
  }

  const result = await call()
  const claimedId = claim?.id ?? (await getActionExecutionByKey(key))?.id
  if (claimedId) await completeActionExecution(claimedId, result.ok ? "completed" : "failed", result, result.ok ? undefined : { code: result.errorCode, message: result.error })
  return { result, deduped: false }
}
