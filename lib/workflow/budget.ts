/* ================================================================== *
 * AGENT BUDGETS (§10, §38) — real, enforced, never silently exceeded.
 * ================================================================== */

import { BudgetExceededError, type BudgetPolicy, type BudgetUsage } from "./types"

export const DEFAULT_BUDGET: BudgetPolicy = {
  maxTokens: 50_000,
  maxCostUsd: 2,
  maxDurationMs: 5 * 60_000,
  maxSteps: 10,
}

export function emptyUsage(): BudgetUsage {
  return { tokens: 0, costUsd: 0, durationMs: 0, steps: 0 }
}

export function addUsage(usage: BudgetUsage, delta: Partial<BudgetUsage>): BudgetUsage {
  return {
    tokens: usage.tokens + (delta.tokens ?? 0),
    costUsd: usage.costUsd + (delta.costUsd ?? 0),
    durationMs: usage.durationMs + (delta.durationMs ?? 0),
    steps: usage.steps + (delta.steps ?? 0),
  }
}

/** Throws BudgetExceededError (never silently continues, §10) the
 * moment any configured limit is crossed. A policy field left `undefined`
 * means "no limit for this dimension" — never treated as zero. */
export function assertWithinBudget(usage: BudgetUsage, policy: BudgetPolicy): void {
  if (policy.maxTokens != null && usage.tokens > policy.maxTokens) {
    throw new BudgetExceededError(`Token budget exceeded: ${usage.tokens} > ${policy.maxTokens}`)
  }
  if (policy.maxCostUsd != null && usage.costUsd > policy.maxCostUsd) {
    throw new BudgetExceededError(`Cost budget exceeded: $${usage.costUsd.toFixed(4)} > $${policy.maxCostUsd}`)
  }
  if (policy.maxDurationMs != null && usage.durationMs > policy.maxDurationMs) {
    throw new BudgetExceededError(`Duration budget exceeded: ${usage.durationMs}ms > ${policy.maxDurationMs}ms`)
  }
  if (policy.maxSteps != null && usage.steps > policy.maxSteps) {
    throw new BudgetExceededError(`Step budget exceeded: ${usage.steps} > ${policy.maxSteps}`)
  }
}
