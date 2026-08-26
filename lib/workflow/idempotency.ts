/* ================================================================== *
 * IDEMPOTENCY (§6) — real, stable keys. A retry (or a duplicate
 * trigger) must never create a second WorkflowRun, Job, page, entity,
 * relationship, or publication for the same real thing.
 * ================================================================== */

import { createHash } from "node:crypto"

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`
}

/** Deterministic regardless of key insertion order — two logically
 * identical inputs always hash the same. */
export function hashInput(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 32)
}

/** WorkflowRun idempotency key: one real workflow per (tenant, workflow
 * type, real-world subject) — starting the same workflow for the same
 * subject twice must return the existing run, never create a second
 * one (enforced by a real UNIQUE index — migrations/
 * 0004_durable_workflows.sql — not just this function). */
export function buildWorkflowIdempotencyKey(orgId: string, pipeline: string, subjectId: string): string {
  return `wf:${orgId}:${pipeline}:${subjectId}`
}

/** Job queue idempotency key — same shape, used by lib/workflow/queue.ts
 * so re-enqueuing the same workflow trigger never creates a duplicate
 * queued job. */
export function buildJobIdempotencyKey(orgId: string, type: string, subjectId: string): string {
  return `job:${orgId}:${type}:${subjectId}`
}

/** WorkflowStep idempotency: (workflowRunId, step, sequence) is already
 * a real UNIQUE constraint from Phase 3 (agent_run_steps) — this helper
 * exists so callers build the same key shape consistently when they
 * need to reason about it outside the DB constraint itself (e.g. to
 * log or to build a checkpoint reference). */
export function buildStepIdempotencyKey(workflowRunId: string, step: string, sequence: number): string {
  return `${workflowRunId}:${step}:${sequence}`
}
