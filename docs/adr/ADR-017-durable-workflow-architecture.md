# ADR-017: A provider-independent WorkflowEngine, Postgres-backed today, never coupled to Temporal/Vercel/a queue vendor

## Status
Accepted.

## Context
Phase 3 shipped `lib/agent-runs/*` — a synchronous, in-process pipeline
(ADR-003) that persisted `agent_runs`/`agent_run_steps` as it went but had
no real resumability: a killed process mid-pipeline left the run stuck,
there was no retry policy beyond "the caller can try again from the start",
no budget enforcement, no formalized capability checks, and no queue —
every run happened inside the HTTP request that triggered it.

Phase 4's brief requires durability (resumable after a crash), an explicit
10-state machine, retry with backoff/jitter, idempotency enforced by the
database (not just application logic), tenant-aware concurrency, and a
provider-independent `WorkflowEngine` interface "not coupled to
Temporal/Vercel/Redis/queue vendor" so a real durable-execution product
(Temporal, or a managed equivalent) can be adopted later without rewriting
domain code.

There is still no persistent worker process in this deployment (a single
Next.js app on Vercel) and Temporal is not available in this environment.

## Decision
1. Define `WorkflowEngine` (`lib/workflow/engine.ts`) as the interface every
   orchestrator and API route depends on: `start/getStatus/cancel/pause/
   resume/retry`. `PostgresWorkflowEngineImpl` is the only implementation
   today. A future Temporal-backed implementation satisfies the exact same
   interface — no call site changes.
2. Extend Phase 3's `agent_runs`/`agent_run_steps` tables in place
   (`migrations/0004_durable_workflows.sql`) rather than create a parallel
   `workflow_runs`/`workflow_steps` schema. The physical tables keep their
   Phase-3 names; the domain/type layer (`WorkflowRun`/`WorkflowStep` in
   `lib/workflow/types.ts`) is the new vocabulary built on top. This avoids
   a data migration and keeps one ledger, not two that could drift.
3. Checkpoint-resume is a **database-driven** mechanism, not a live-process
   requirement: `runStep()` (`lib/workflow/engine.ts`) looks up
   `agent_run_steps` for this exact `(run, step, sequence)` first; if it
   already `succeeded`, the persisted output/checkpointData is returned
   without re-executing. This works correctly whether the orchestrator is
   re-invoked by a direct API call, a manual `/resume`, or a future queue
   worker tick — there is no requirement that the original process survive.
4. The 10-state machine (`lib/workflow/state-machine.ts`) makes every
   transition explicit in a `VALID_TRANSITIONS` table; anything not listed
   throws `InvalidWorkflowTransitionError`. Self-transitions are always
   rejected. `FAILED`/`TIMED_OUT` can only reach `RUNNING` by way of
   `RETRYING` (a real, auditable "this was manually retried" step), never
   directly.
5. Idempotency is enforced by a **partial unique index**
   (`uq_agent_runs_active_idempotency ON agent_runs(idempotency_key) WHERE
   status NOT IN ('succeeded','failed','cancelled')`), not only application
   logic — a concurrent duplicate insert is caught (Postgres `23505`) and
   the existing active run is returned. Scoping the index to non-terminal
   statuses (rather than a permanent unique constraint) deliberately allows
   a *new* run for the same subject once a prior one has terminated — the
   first design considered here would have permanently blocked all future
   re-runs, which was caught and fixed before this shipped.
6. No new infrastructure is stood up. `lib/workflow/queue.ts` is a real
   Postgres-backed job queue (`SELECT ... FOR UPDATE SKIP LOCKED`), and
   `POST /api/v1/workflows/process` (intended for Vercel Cron) is the
   "worker" — each invocation is one complete, bounded, idempotent unit of
   work, never a claim that a persistent background process exists.

## Consequences
- Positive: every orchestrator (`website-discovery`, `content-pipeline`)
  depends only on `WorkflowEngine`/`runStep`, never on Postgres-specific SQL
  or a queue vendor's SDK — adopting Temporal later is an implementation
  swap behind this interface, not a rewrite of domain code.
- Positive: a genuinely killed/restarted process (or a cold serverless
  invocation) resumes correctly, verified by
  `tests/integration/durable-workflow.test.ts`'s checkpoint-resume test,
  which executes a step, refetches the run as a fresh object (simulating a
  new process), and asserts the step function is never called a second
  time.
- Negative: without Temporal, there is no cross-process signal to interrupt
  an already-in-flight synchronous orchestrator call — `pause()` prevents
  the run from being picked up *again*, it cannot stop a call already
  executing (documented in `app/api/v1/workflows/[id]/pause/route.ts`).
  This is an accepted limitation of the current single-process model, not
  a security or correctness gap (each step is still atomic and checkpointed).
- Negative: "the worker" is a stateless HTTP endpoint invoked on a schedule,
  not a real always-on process — throughput is bounded by how often Vercel
  Cron (or an equivalent) can be scheduled to fire (minimum granularity
  varies by plan). Documented honestly in `docs/architecture/roadmap.md`,
  never presented as always-on background processing.
