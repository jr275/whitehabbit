/* ================================================================== *
 * Shared step-dispatch outcome type (Phase 5A, ADR-023) — both
 * lib/website-discovery/steps.ts and lib/content-pipeline/steps.ts
 * return this from their dispatch function, so lib/workflow/
 * step-worker.ts can drive either pipeline through one generic loop.
 * ================================================================== */

export type StepOutcome =
  /** This step finished; enqueue/advance to `nextStep`. */
  | { kind: "advance"; nextStep: string }
  /** This step finished by pausing the workflow at WAITING_APPROVAL — no
   * next step to enqueue now; a human decision (lib/workflow/approval.ts)
   * re-enqueues the continuation later. */
  | { kind: "waiting_approval" }
  /** The pipeline is done — succeeded or failed — finalize the workflow. */
  | { kind: "terminal"; status: "succeeded" | "failed"; errorReason?: string }
