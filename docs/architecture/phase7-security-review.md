# Phase 7 Security Review — Decision → Action Bridge

Adversarial review of the new attack surface introduced by the Decision →
Action bridge (ADR-038/039): `lib/intelligence/action-executor.ts`,
`action-plan.ts`, `policy-engine.ts`, `mission.ts`, and the 8 new
`/api/v1/intelligence/*` routes. Scope: SSRF, authorization/tenant isolation,
cache isolation, action replay/idempotency, secret leakage, prompt
injection, and untrusted-crawled-content propagation, per §31 of the Phase
7 brief.

## Findings

**1. Fixed — `onWorkflowFinalized()`'s page lookup subquery lacked its own
org scope.** `SELECT id FROM pages WHERE org_id = $1 AND opportunity_id =
(SELECT subject_id FROM agent_runs WHERE id = $2)` — the inner subquery
resolving `agent_runs.subject_id` was not itself filtered by `org_id`. In
practice this was not exploitable: `runId`/`orgId` are always a real,
verified pair from `finalizeWorkflow()`'s own caller (never client input),
and the outer `WHERE org_id = $1` on `pages` would still block a
cross-tenant result even if the inner subquery returned another org's
`subject_id`. Fixed anyway as defense-in-depth — every subquery in this
codebase should carry its own tenant scope, not rely on an outer filter to
save it, so a future edit to either query independently can't silently
reopen this. See `lib/intelligence/action-executor.ts`.

**2. Reviewed, no issue — SQL injection.** Every new query in the Decision
→ Action bridge is parameterized (`$1`, `$2`, …); the only dynamic SQL
construction is `$${params.length}` placeholder-index building (already an
established pattern in `lib/intelligence/actions.ts` before this phase),
which interpolates an internally-computed array length, never any
value derived from request input.

**3. Reviewed, no issue — capability enforcement is fail-closed and
defense-in-depth.** `PolicyEngine.evaluate()` denies execution before an
Action is even queued if the recommended agent lacks a required
capability (§6). The actual dispatch functions (`dispatchWorkflowAction`,
`dispatchSynchronousAction`) independently call `assertCapability()` again
at the real point of the side-effecting write — the same "assert at the
exact point, not just once at the top" discipline `lib/workflow/
permissions.ts` already documents. Neither check can be bypassed by a
crafted request: `agentType`/`requiredCapabilities` are derived entirely
from a closed, hardcoded lookup table (`EXECUTION_POLICY_BY_ACTION` et al.
in `action-plan.ts`) keyed by the Decision's own `action` field — never
client-supplied.

**4. Reviewed, no issue — Decision forgery.** There is no API that lets a
caller construct an arbitrary `IntelligenceDecision` (action type, subject,
estimated cost, risk) directly. Decisions are created only by the real,
deterministic `runDecisionScan()` (POST `/api/v1/intelligence/decisions`
triggers the scan, it does not accept a decision body) or internal/test
code with direct database access. A client can only approve/reject an
*existing*, engine-produced Decision (`PATCH .../decisions/:id`) and
execute an *approved* one — never fabricate one with an inflated
confidence/priority/estimated-cost to bypass the PolicyEngine's budget
check.

**5. Reviewed, no issue — action replay / duplicate execution.** The real,
DB-enforced partial unique index on `intelligence_actions(decision_id)`
(migrations/0011) is the actual guard, not an application-level
check-then-insert race — verified directly in
`tests/integration/decision-action-bridge.test.ts`'s concurrent-execute
test (3 racing `executeDecision()` calls resolve to the same real row).

**6. Reviewed, no issue — tenant isolation.** Every new route resolves its
subject (`Decision`/`Action`) scoped by the real, session-verified
`organizationId`, never a client-supplied tenant id; a cross-tenant
reference 404s (verified in `tests/api/decision-action-bridge-api.test.ts`
and `tests/api/mission-api.test.ts`) rather than 403ing (never confirms
another tenant's resource exists), consistent with every other route in
this codebase.

**7. Reviewed, no issue — secret leakage.** Every real error/blocked-reason
string surfaced to the client (`policy.reason`, `blockedReason`,
`plan.unsupportedReason`) is built from this codebase's own static text,
real numeric scores, and Decision/Action fields already scoped to the
caller's own tenant — never an underlying database error message, stack
trace, or credential value.

**8. Reviewed, no issue — SSRF, prompt injection, crawler poisoning, cache
isolation.** The Decision → Action bridge introduces no new outbound HTTP
call and no new raw-crawled-HTML handling path — a workflow-backed action
(`CREATE_PAGE`/`UPDATE_PAGE`/etc.) dispatches into the exact same, already
crawler-poisoning-hardened content-generation pipeline every other
Opportunity already goes through (Deep Research reads only already-
evidence-scored `entity_evidence`/`evidence` rows, never raw page content
directly); nothing in this phase adds a cache layer. `mission.ts`'s
aggregation queries are read-only, always scoped by `(org_id,
project_id)`, and bounded by the same real indexes every other list
endpoint in this codebase already relies on — no new unbounded-scan
surface.

**9. Fixed — no rate limit on the real dispatch endpoint.** `POST
.../decisions/:id/execute` can trigger a real WorkflowRun (an eventual real
LLM call) with no rate limit, unlike every other real-cost-triggering
endpoint in this codebase (`opportunity_generate`, `worker_run`,
`website_discover`). Added a new `decision_execute` scope to
`lib/rate-limit.ts` (10/min per org, the same tightness as
`opportunity_generate`) and wired `enforceRateLimit()` into the route.

## Not covered by this pass

Full engagement-style penetration testing (timing side-channels on the
404-vs-403 distinction, load-testing the rate limiter itself) was not
performed — out of scope for a self-review of new code; the same posture
every prior phase's security section has taken.
