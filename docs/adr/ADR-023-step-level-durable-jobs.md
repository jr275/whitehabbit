# ADR-023: Step-level durable jobs — extend the existing Job model, don't create a parallel WorkflowStepJob table

## Status
Accepted.

## Context
Phase 4's `WorkflowEngine`/`runStep()` gave every pipeline step real
checkpointing, retry, and budget enforcement — but a single orchestrator
*call* (a whole pipeline: crawl→extract→profile→discover, or
research→outline→draft→seo→geo→quality→decide/publish) still ran
synchronously within one HTTP request or one queue-worker job
(`docs/architecture/risks.md` R-16). A single unusually slow step could
still approach a serverless function's real timeout, and pausing/
cancelling could only take effect *between* whole-pipeline invocations,
not between any two steps.

Phase 5A's brief requires that no HTTP request ever executes a whole
workflow, that every step become its own independent, durable,
retryable, crash-recoverable job, and asks explicitly: extend the
existing Job model if it can safely represent this, rather than
introduce a parallel `WorkflowStepJob` concept.

## Decision
**Extend `jobs`, don't duplicate it.** A step job IS a job — same table,
same `dequeue()`/priority/tenant-concurrency/dead-letter mechanics
(ADR-022), with five new columns (`migrations/0006_step_level_jobs.sql`):
`project_id`, `step_name`, `step_sequence`, `lease_expires_at`,
`completed_at`. A "whole-pipeline job" (Phase 4's original shape,
`step_name IS NULL`) and a "step job" (Phase 5A, `step_name` set) are the
same row shape — the field is simply unused by the (now retired)
whole-pipeline dispatch path.

**One source of truth per pipeline's step logic.** `lib/website-discovery/
steps.ts` and `lib/content-pipeline/steps.ts` each export a single
`dispatch*Step(run, ..., stepName)` function that executes exactly one
named step and returns a `StepOutcome` (`advance` / `waiting_approval` /
`terminal`). Two callers share this: `lib/workflow/step-worker.ts` (the
real queue-driven path — one step per job) and each pipeline's
`orchestrator.ts` (the **LegacySyncExecutionAdapter**: a thin in-process
loop over the same dispatch function, kept for tests and internal callers
that want a synchronous result without touching the queue at all). Zero
step logic is duplicated between the two paths.

**A real lease, not just a lock.** `dequeue()` already used `FOR UPDATE
SKIP LOCKED` for safe concurrent claiming, but a job claimed by a worker
that then crashed stayed `locked` forever. Every dequeue now also stamps
`lease_expires_at = now + DEFAULT_LEASE_MS` (120s — generous for one
bounded step); `reapExpiredLeases()` finds `locked` jobs past their lease
and either resets them to `pending` (if attempts remain — the next tick
picks the same job back up, safe because every step is idempotent by
construction, either via `runStep()`'s checkpoint or `decide_publish`'s
own approval/publish idempotency) or dead-letters them (attempts
exhausted) — never left stuck.

**Re-derive state from the database between steps, always.** Every step
already followed this rule for checkpoint-resume within one process
(Phase 4); Phase 5A makes it load-bearing across process boundaries too.
A step never reads another step's in-memory variable — it reads
`workflowRepo.getStep()`'s persisted output (website discovery) or
`content-pipeline/repo.ts#getArtifact()`'s full persisted artifact
(content generation, since a step's small `runStep()` output summary
isn't enough to carry e.g. a full research claims array forward — the
already-existing `content_artifacts` table is).

**`decide_publish` is deliberately not checkpointed by `runStep()`.** It
must be safe to re-dispatch after a human approval decision arrives
(potentially minutes or days later, via a completely separate HTTP
request) — if it were wrapped in `runStep()`'s "skip once succeeded"
mechanic, a re-dispatch after approval would just replay the cached
pre-approval result forever. It achieves its own idempotency the normal
way instead (`getApprovalForArtifact()`, `getPageByOpportunity()`,
`publishPageAction()`'s own `PageNotReadyError`-as-no-op) — unchanged in
substance from how this exact logic worked inline before Phase 5A.

**Concurrency: `dequeue()` unchanged in shape, now real per-tenant.**
`resolveConcurrencyLimit()` (`lib/workflow/budget-policy.ts`) reads
`tenant_budgets` per distinct org encountered in a tick (cached within the
call), replacing the previously-unused hardcoded-only
`DEFAULT_CONCURRENCY_LIMITS` fallback — this closes Phase 4's
`risks.md` R-22.

## Consequences
- Positive: the acceptance criterion is real and tested
  (`tests/integration/step-execution.test.ts`) — an HTTP-triggered start
  enqueues one job and returns with `checkpoint: null`; one worker tick
  advances exactly one step; a simulated crash (a claimed job whose lease
  is backdated past expiry) recovers on the next tick without duplicating
  work; a paused/cancelled run's stray job is a real no-op.
- Positive: pausing/cancelling now takes effect between any two steps,
  not just between whole-pipeline invocations — closing the last part of
  Phase 4's R-25.
- Negative (real, named trade-off — see `docs/architecture/
  load-test-report.md`'s before/after section): completing one whole
  pipeline now costs 4 (website_discovery) or 7 (content_generation)
  sequential job dispatches instead of 1 — per-tick *pipeline*
  throughput drops by roughly that factor at the same per-job dequeue
  rate, in exchange for step-granular crash recovery. This is the
  accepted cost of Objective A, not a hidden regression.
- Negative: the five-level budget resolution chain named in the brief
  (step → agent → workflow → project → tenant) is implemented as three
  real, distinct layers (workflow override → project_budgets →
  DEFAULT_BUDGET), documented honestly in
  `lib/workflow/budget-policy.ts`'s header rather than faked — "agent"
  and "step" overrides would have no real distinguishing data in this
  codebase today (an AgentType maps 1:1 to a pipeline, and no step has
  ever needed a ceiling narrower than its run's own cumulative budget).
