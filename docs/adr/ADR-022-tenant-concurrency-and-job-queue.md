# ADR-022: A real Postgres-backed job queue with per-tenant concurrency limits — no external queue vendor

## Status
Accepted.

## Context
Phase 4 requires that one tenant's workload can never starve another's, a
priority system, and backpressure — without adopting a queue vendor
(SQS/RabbitMQ/etc.) that ADR-017 already declined to add speculatively.

## Decision
`jobs` (`migrations/0004_durable_workflows.sql`) is a real table.
`lib/workflow/queue.ts#dequeue()` selects due, pending jobs with `SELECT
... FOR UPDATE SKIP LOCKED` inside a transaction — safe under concurrent
worker ticks (e.g. overlapping cron invocations) without double-dequeuing
the same job, ordered by priority (`critical`/`high`/`normal`/`low`/
`background`) then by due time.

Before admitting a candidate job, `dequeue()` checks the tenant's current
active-run count for that pipeline type (`countActiveRuns`, the same real
query `workflow.repo.ts` uses) against `DEFAULT_CONCURRENCY_LIMITS`
(`website_discovery: 3`, `content_generation: 5`) — a tenant already at its
ceiling is skipped this tick, its jobs staying `pending` for the next one,
never erroring and never blocking other tenants' jobs from being admitted
in the same tick. Candidates are over-fetched (`limit * 4`) specifically so
per-tenant skips still let the tick fill its real admission quota from
other tenants' work.

Enqueue is idempotent via the same partial-unique-index pattern as
`agent_runs` (`uq_jobs_active_idempotency`) — re-enqueuing an
already-pending/locked job for the same idempotency key returns the
existing job, never a duplicate.

A job whose error is retryable (per the same `isRetryableError()`
classification `runStep()` uses) and hasn't exhausted `max_attempts` is
rescheduled with real backoff; otherwise it moves to a `dead_letter` status
— visible via `listDeadLetterJobs()` — never silently dropped.

## Consequences
- Positive: `tests/integration/durable-workflow.test.ts` proves dequeue
  really caps admission at a tenant's configured ceiling even when more of
  that tenant's jobs are pending, and proves idempotent enqueue returns the
  same job rather than creating a duplicate.
- Positive: no new operational dependency — the queue lives in the same
  Postgres instance as everything else, backed by the same backup/recovery
  story.
- Negative: `FOR UPDATE SKIP LOCKED` polling is not as low-latency as a
  push-based queue — a job's actual pickup latency is bounded by how often
  `POST /api/v1/workflows/process` is invoked (see ADR-017's worker-tick
  discussion), not near-instant.
- Negative: `DEFAULT_CONCURRENCY_LIMITS` is a single global default today,
  not yet overridable per-tenant in the admission path (`tenant_budgets` is
  schema-only in this revision — reading a per-tenant override into
  `dequeue()`'s limit lookup is the natural next increment, named in
  `docs/architecture/risks.md`).
