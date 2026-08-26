# Phase 4 Implementation Plan: Durable Workflow Platform

Companion to ARCHITECTURE.md and ADR-017..022. States what changes, why, and
in what order — written before implementation, updated only if reality
diverges materially from it.

## 1. Current execution architecture (as of Phase 3)

`lib/agent-runs/{model,repo}.ts` — a Postgres-backed ledger (`agent_runs`,
`agent_run_steps`) with a 6-state status (`queued|running|completed|failed|
blocked|pending_approval`) and a `runStep()` helper that records
start/complete/fail around a closure. Two orchestrators
(`lib/website-discovery/orchestrator.ts`, `lib/content-pipeline/
orchestrator.ts`) call it **synchronously, in-process, inside one HTTP
request** — no queue, no retry, no checkpoint-resume, no backoff, no
tenant concurrency limiting, no budget enforcement beyond nothing. This is
R-16. Domain binding does not exist (ADR-010, deferred). Entity extraction
is structured-data-first (R-18, unchanged by this phase — a real second
signal source is future work, not a durability concern). The `LLM_DEV_MODE`
draft fixture is content-aware but still not real prose (R-19, unchanged —
dev mode is already hard-blocked in production by `lib/runtime-mode.ts`).

## 2. Target durable workflow architecture

A provider-independent `WorkflowEngine` interface (`lib/workflow/engine.ts`)
with one concrete implementation, `PostgresWorkflowEngine`, backed by the
**same physical tables** as before (`agent_runs`/`agent_run_steps`,
extended with the columns this phase needs) — no parallel ledger. Domain
code depends only on the `WorkflowRun`/`WorkflowStep`/`WorkflowStatus`
types and the engine interface, never on Postgres-specific SQL or a future
Temporal SDK (ADR-017).

Two execution paths exist side by side during and after migration:

- **Synchronous** (`LegacySyncExecutionAdapter`, §40): the orchestrator
  calls `engine.runStep()` for every step, in-process, inside one request —
  exactly like Phase 3, except every step is now idempotent (skips
  re-execution if already `succeeded` for this run) and retried in-process
  on a transient failure. This keeps existing tests and demo flows working
  unmodified in shape.
- **Queued** (new, §7): `engine.enqueue()` inserts a `QUEUED` workflow run
  and a `jobs` row; a worker tick (`lib/workflow/worker.ts#processQueue()`,
  invoked by `POST /api/v1/workflows/process` — see ADR-017 for why this is
  a cron-driven poll, not a persistent process) dequeues due jobs honoring
  tenant concurrency limits and priority, and executes the same
  orchestrator function the sync path uses.

Both paths share the same `runStep()` checkpoint/idempotency/retry
machinery — the only difference is who calls the orchestrator and when.

## 3. Migration strategy

No big-bang rewrite (§40). Order:

1. Extend the schema in place (migration `0004_durable_workflows.sql`):
   widen `agent_runs`/`agent_run_steps` status to the full 10/6-state
   machine, add idempotency/retry/budget/checkpoint columns; add
   `approvals`, `jobs`, `tenant_budgets`, `domains`, `domain_verifications`,
   `route_templates`.
2. Build `lib/workflow/*` on the extended schema.
3. Point the two existing orchestrators at `lib/workflow/engine.ts` instead
   of `lib/agent-runs/repo.ts` (a mechanical, same-shape swap — 6 call
   sites total, grepped before starting).
4. Add the queue path alongside the existing sync path — the existing
   `POST .../discover` and `.../generate` routes keep working synchronously
   by default (tests and the current UI depend on an immediate response);
   a new `?async=true` / a dedicated enqueue endpoint exercises the queued
   path for the same orchestrators.
5. Delete `lib/agent-runs/` once every call site is migrated (no dangling
   parallel implementation — the physical tables are reused, not
   duplicated).

## 4. Failure scenarios and how each is handled

| Scenario | Handling |
|---|---|
| LLM timeout / 5xx | Retryable — `isRetryableError()` classifies `ProviderError`; `runStep()` retries in-process up to `maxAttempts` with backoff+jitter, then marks the step (and run) `FAILED` with the real reason. |
| LLM rate limit | Retryable — same path, typically a longer backoff. |
| Crawler timeout | Retryable at the per-page level already (crawl.ts continues past one page's failure); a whole-crawl timeout is retryable at the step level. |
| Invalid input (bad URL, validation) | **Never retried** — `isRetryableError()` explicitly excludes `ValidationError`/`InvalidWebsiteUrlError`/`UnsafeUrlError`; fails immediately with the real reason. |
| Tenant isolation violation | Never retried — this is a bug or an attack, not a transient condition; fails loudly, never silently. |
| Process crash mid-workflow | The next call to `engine.resumeWorkflow(runId)` (or the queue worker picking the row back up) re-invokes the orchestrator; `runStep()` finds already-`succeeded` steps for this run and skips straight to their persisted output instead of re-executing — genuine resume-from-checkpoint, not a replay of everything. |
| Duplicate job / duplicate trigger | The `jobs` and `agent_runs` idempotency keys are real unique DB constraints (§6) — a second enqueue/start with the same key returns the existing row, never creates a second one. |
| Budget exceeded | `lib/workflow/budget.ts` checks usage after every step; exceeding `max_tokens`/`max_cost`/`max_duration`/`max_steps` marks the run `FAILED` with reason `BUDGET_EXCEEDED` — never silently continues. |
| Approval rejected/expired | Run transitions `WAITING_APPROVAL` → `FAILED` (rejected, with the reviewer's reason) or `FAILED` (expired, after `approvals.expires_at`) — never silently resumes. |
| Tenant concurrency exhausted | The job stays `QUEUED`/`pending`; the worker tick simply doesn't dequeue more than the tenant's limit — no error, no drop, just backpressure. |

## 5. Retry strategy

`lib/workflow/retry.ts`: exponential backoff with jitter —
`min(maxBackoffMs, baseMs * backoffMultiplier^attempt) * (0.5 + random()*0.5)`.
Defaults: `maxAttempts: 3, baseMs: 1000, backoffMultiplier: 2, maxBackoffMs:
30000`. Per-step overrides are supported (a slower external call can set a
longer `maxBackoffMs`). `isRetryableError()` is an explicit allow-list of
real error types already in this codebase (`ProviderError`, generic network
errors) — never a blanket "retry anything."

## 6. Idempotency strategy

Every `WorkflowRun` gets a real idempotency key:
`sha256(orgId|workflowType|aggregateId)` — starting the same workflow twice
for the same subject returns the existing run (a real `UNIQUE` constraint on
`agent_runs.idempotency_key`, not just an application-level check — §6
explicitly requires a DB constraint, not just app logic). Every
`WorkflowStep` is keyed by `(workflow_run_id, step, sequence)` — already a
real `UNIQUE` constraint from Phase 3, reused unchanged. `jobs.idempotency_key`
is likewise `UNIQUE`, built the same way, so re-enqueuing never duplicates a
queued job. Publication is idempotent through the same mechanism: publishing
an already-published page is a no-op check at the service layer (`lib/pages/
publish.ts` already only accepts `status === "ready"`) backed by the
workflow-level idempotency key on the publish action itself.

## 7. Tenant concurrency model

A per-(org, workflow_type) concurrency limit, checked by the queue worker
before dequeuing: `SELECT count(*) FROM agent_runs WHERE org_id = $1 AND
pipeline = $2 AND status IN ('running','retrying')` compared against a
configurable limit (`lib/workflow/queue.ts`'s `DEFAULT_CONCURRENCY_LIMITS`,
overridable per org via `tenant_budgets` — reusing that table rather than
adding a second tenant-config table for one more column). No tenant can
starve another: the worker tick iterates tenants round-robin, not
strict FIFO across the whole `jobs` table.

## 8. Domain architecture (ADR-018)

`domains` (org/project-scoped hostname + verification status) and
`domain_verifications` (attempt history — DNS TXT or CNAME, never assumed
verified). Public rendering resolves `request host → domains row (VERIFIED
only) → project_id → tenant`, server-side, from the `Host` header — never
from a client-supplied `tenant_id`/`project_id` query parameter (§16's
explicit requirement). `CanonicalUrlService` (`lib/domains/canonical.ts`)
picks the canonical host/protocol/path for a page once a verified domain
exists, falling back to the existing `/sites/:projectId/:slug` path when it
doesn't (ADR-016's minimal route stays the fallback, not a dead end).

## 9. Risks introduced by this phase

- A cron-driven poll worker (not a persistent process) means queued jobs
  wait up to one poll interval before starting — an accepted latency cost
  documented in ADR-017, not a hidden one.
- Two execution paths (sync + queued) sharing one `runStep()` primitive is
  more moving parts than one path; mitigated by both paths being covered by
  the same test suite.
- Wider status enum touches every place that branches on run status
  (orchestrators, UI, API) — grepped and enumerated before starting (§3) to
  avoid missing a call site.

## 10. Test strategy

- `tests/unit/workflow-*.test.ts`: state machine transitions (every valid
  transition succeeds, every invalid one throws), retry backoff math,
  idempotency key stability, budget enforcement.
- `tests/integration/workflow-engine.test.ts`: real Postgres — start,
  checkpoint, simulated crash (a step's closure throws once, is retried and
  succeeds), duplicate start returns the same run, approval request/decide/
  resume, budget-exceeded stops a run.
- `tests/security/phase4-tenant-isolation.test.ts`: adversarial cross-tenant
  cases for workflows, approvals, domains, and SSE.
- Existing `tests/e2e/vertical-slice.test.ts` must keep passing unmodified
  (proves the sync path still works exactly as before).
