# ADR-003: Agent orchestration stays in-process for now; durable-workflow migration is isolated to one module

## Status
Superseded by ADR-017 (2026-08). The Content Factory pipeline this ADR
named as the trigger for a durable-workflow migration now exists
(`lib/content-pipeline/orchestrator.ts`) and the migration happened —
see ADR-017 for the decision (a real `WorkflowEngine` abstraction, still
without Temporal — the "not until a real capability needs it" judgment
call here turned out right: the trigger was resumability, not raw scale,
and that didn't require a new cluster to solve). Kept for history.

## Context
`lib/agent/runtime.ts#executeTask()` is an async generator that runs one
Skill against real tools, persisting `tasks`/`executions`/`execution_events`/
`outputs`/`metrics` rows as it goes, so the database — not an in-memory
process — is the source of truth even if the HTTP client disconnects
mid-run. Its own header comment already states the design intent: "This
module is the ONLY thing that knows execution is 'local function calls
today.' ... swapping this for a queue worker, Temporal, or a remote agent
runtime later means replacing this one file's internals, not any caller."

There is no queue, no worker process, and no durable-workflow engine
(Temporal or equivalent) in this deployment. Every execution today runs
synchronously inside a Vercel request/response cycle (streamed as NDJSON to
the client) and every Skill is a single LLM call plus tool calls — there is
no genuinely long-running (minutes-to-hours) agent step yet that would be
unsafe inside a serverless request today.

## Decision
Do not adopt Temporal (or build `apps/worker`) until a real capability
needs it — the brief's own §22 multi-agent Content Factory pipeline
(Opportunity→Research→Entity→Data→Outline→Writer→SEO→GEO→Schema→Link→
FactCheck→Quality→Publish) is that trigger, because it is the first workload
that is both genuinely long-running and needs step-level resumability
(§23: "Every run must be resumable"). Until then, keep the existing
`AgentRun`-shaped vocabulary the runtime already uses (`WorkerExecution` ≈
AgentRun, `WorkerEvent` ≈ AgentStep, `WorkerOutput` ≈ AgentArtifact) so that
when the migration happens, it is a matter of moving `executeTask()`'s body
into a Temporal workflow/activity split, not renaming every caller.

Agent tool permissions (§24) and human-in-the-loop (§25) are implemented
today via `ToolPermission`/`RiskLevel` on every `ToolAction` and
`ApprovalRequiredError`, which the runtime maps to a real terminal
`pending_approval` execution status distinct from both `blocked` (capability
missing) and `failed` (something broke). This is the correct shape for the
brief's autonomy levels (§25 LEVEL 0–4); only LEVEL 0/1 behavior exists today
(every write/publish/financial/external-communication tool action requires
approval, unconditionally) — per-tenant configurable autonomy levels are
deferred to `docs/architecture/risks.md` R-5.

## Consequences
- Positive: no new infrastructure (queue, worker fleet, Temporal cluster) is
  operated before a workload exists that needs it — directly following the
  brief's own "optimize for the architecture, not premature infrastructure"
  instruction is not license to add infrastructure with nothing running on
  it either.
- Positive: the resumability/durability properties Temporal would give are
  already partially true today by construction (every event persisted before
  being yielded; a reconnecting client reads Postgres, not process memory) —
  the gap that remains is specifically *resuming a killed process mid-Skill*,
  which cannot happen with today's single-LLM-call Skills (a Skill either
  hasn't started its one real await, or has finished it — there is no
  meaningful "50% done" state to resume into yet).
- Negative: a multi-step Content Factory pipeline (ADR-006) cannot be built
  safely on the current in-process model — this ADR's decision blocks that
  work until the Temporal migration lands. This ordering is intentional and
  reflected in `docs/architecture/roadmap.md`.
