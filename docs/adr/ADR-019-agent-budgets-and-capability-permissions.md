# ADR-019: Budgets and capabilities are enforced in code, checked after every step, never trusted to a prompt

## Status
Accepted.

## Context
Phase 3's agents had no hard ceiling on tokens/cost/duration/steps, and no
formalized notion of which actions a given agent type was allowed to take
beyond what its own code happened to call. Phase 4's brief is explicit:
budgets must stop execution and mark a real terminal state, never silently
continue past a limit; tool/capability permissions must be enforced in
code, never left to an LLM's own judgment or a prompt instruction ("never
let an LLM decide its own permission").

## Decision
1. `BudgetPolicy` (`maxTokens`/`maxCostUsd`/`maxDurationMs`/`maxSteps`) is
   attached to a `WorkflowRun` at start (`DEFAULT_BUDGET` if none given —
   `lib/workflow/budget.ts`). `assertWithinBudget()` runs after **every**
   step inside `runStep()` (`lib/workflow/engine.ts`), not just at the end
   of a pipeline — a step that pushes usage over any single dimension
   throws `BudgetExceededError` immediately, the step is recorded `failed`,
   and the error propagates out of the orchestrator. There is no code path
   that logs a budget breach and continues.
2. `AgentCapability` is a closed enum (`lib/workflow/permissions.ts`) and
   `AGENT_CAPABILITIES` is an explicit allow-list per `AgentType`
   (`WebsiteDiscoveryAgent`/`ContentGenerationAgent`/`PublisherAgent`) —
   everything not listed is denied by default. `assertCapability()` is
   called at the exact point a side-effecting action is about to happen
   (e.g. immediately before publishing, not once at the top of the
   pipeline), so a future step accidentally wired to the wrong agent's code
   path is caught immediately rather than only in code review.
3. Neither check is expressed as a prompt instruction to an LLM. Both are
   plain TypeScript functions called by orchestrator code, unconditionally,
   regardless of what any model output says.

## Consequences
- Positive: `tests/integration/durable-workflow.test.ts` proves a step that
  reports usage over budget really does fail the step and propagate,
  proves `WebsiteDiscoveryAgent` really cannot call `publish_page_version`,
  and proves `ContentGenerationAgent` really cannot call
  `delete_tenant_data` — these are executable guarantees, not documentation
  claims.
- Positive: a runaway or misbehaving LLM call (excessive tokens, an
  unexpectedly expensive provider call) has a hard backstop independent of
  the model's own behavior.
- Negative: `DEFAULT_BUDGET` values (50k tokens / $2 / 5 minutes / 10 steps)
  are reasonable starting defaults, not tuned against real production
  traffic yet — expect these to need adjustment once real usage data
  exists; tracked in `docs/architecture/risks.md`.
- Negative: budgets are per-run today, not yet aggregated per-tenant across
  concurrent runs in real time (that aggregation is `tenant_budgets`,
  schema-only in this revision — see ADR-022 and risks.md).
