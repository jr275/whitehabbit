# Implementation Roadmap

Ordered per the brief's §75 development process. Each phase names its exit
criterion — the concrete thing that must be true, not a calendar estimate.

## Phase 0 — Foundation audit (done, pre-existing)
Tenancy (org/membership/session), auth, agent runtime, tool permissions,
cost tracking, rate limiting, audit log, SSRF guard, LLM provider
abstraction, product/vertical templating. Exit criterion: met before this
revision began — see `ARCHITECTURE.md` §1.

## Phase 1 — Architecture & planning docs (this revision)
`ARCHITECTURE.md`, `docs/adr/ADR-000..015`, this roadmap, domain model, risk
register, vertical-slice mapping. Exit criterion: every brief section has a
named decision or a named "not yet, and here's the trigger" — done.

## Phase 2 — Knowledge Graph + Opportunity Engine persistence (this revision)
`projects`, `entities`, `entity_relationships`, `entity_evidence`,
`opportunities` tables; `lib/projects`, `lib/knowledge`, `lib/opportunity`
modules; ingestion from `skill_seo_opportunity` output into real, scored,
provenance-carrying rows; list/approve/reject API. Exit criterion: a
Programmatic SEO worker run produces queryable, explainably-scored
Opportunity rows an operator can approve or reject via API — met by this
revision. UI surfacing (an Opportunities list page) is the immediate next
increment, deliberately not bundled into this one (see
`docs/architecture/vertical-slice.md`).

## Phase 3 — Opportunity Engine UI + real Website Discovery — ✅ shipped
`WebsiteDiscoveryAgent` (`lib/website-discovery/orchestrator.ts`,
`lib/crawler/*`), a real Opportunity Engine UI (`/opportunities`), a real
Knowledge Graph UI (`/knowledge`), and a real Website onboarding UI
(`/websites`) all shipped in the vertical-slice revision. Exit criterion
met: a tenant provides a URL and gets a real, persisted
`WebsiteKnowledgeProfile` plus entities seeded from real crawled structured
data and text, not just one skill's LLM-inferred topics.

## Phase 4 — Durable workflow platform — ✅ shipped
`lib/workflow/*` implements a provider-independent `WorkflowEngine`
(ADR-017) with a real 10-state machine, checkpoint-resume, backoff+jitter
retry, budget enforcement (ADR-019), formalized capability permissions
(ADR-019), a durable human-approval workflow + backend-only autonomy policy
(ADR-020), a Postgres-backed job queue with tenant concurrency limits
(ADR-022), real DNS-verified domains + server-side host resolution
(ADR-018), and real-time execution events via Postgres LISTEN/NOTIFY
(ADR-021). `lib/website-discovery/orchestrator.ts` and
`lib/content-pipeline/orchestrator.ts` were migrated onto this engine in
place (checkpoint-resume — R-16 *partially* resolved, see Phase 4.5 below
for the rest) — no parallel pipeline, no big-bang rewrite. Exit
criterion met: `tests/integration/durable-workflow.test.ts` proves a step
already succeeded is never re-executed on a simulated resume, a manual
retry moves a FAILED run through RETRYING back to RUNNING, a budget breach
stops execution with `BudgetExceededError` rather than continuing, and the
full request→pause→approve→resume cycle works against real Postgres. Not
yet done: Temporal/managed-durable-execution adoption (still not justified
per ADR-017 — the resumability requirement was met without it), TLS
provisioning for custom domains (ADR-018), scheduled re-verification of
already-verified domains, a real Agent Control Center dashboard UI (the
API surface — `/api/v1/workflows`, `/api/v1/approvals`, `/api/v1/domains`,
`/api/v1/route-templates` — is real and tenant-isolated; a dedicated UI
consuming it beyond the existing agent-run detail view is the next
increment).

## Phase 4.5 — Step-level async execution — ✅ shipped (ADR-023)
Closed the durability gap Phase 4 explicitly left open (R-16): no HTTP
request runs a whole pipeline, or even a whole step's retry loop, inline
anymore. Every step is its own independent, durable, tenant-scoped job
(`lib/workflow/step-worker.ts`); starting/resuming/retrying a workflow or
approving a publish enqueues exactly the next step and returns
immediately. Real lease-based crash recovery
(`lib/workflow/queue.ts#reapExpiredLeases`) replaces "locked forever if
the worker dies." Also closed R-22 (tenant_budgets now actually read into
concurrency/budget resolution — `lib/workflow/budget-policy.ts`). Exit
criterion met: `tests/integration/step-execution.test.ts` proves an HTTP
entry point only enqueues, one worker tick advances exactly one step, a
simulated crash recovers without duplicating work, and a paused/cancelled
run's stray job is a real no-op. Real, accepted cost: completing one whole
pipeline now needs 4-7 sequential step dispatches instead of 1 — measured
and extrapolated in `docs/architecture/load-test-report.md`.

## Phase 5 — Content Factory multi-agent pipeline (§22) — ✅ shipped (v1)
`lib/content-pipeline/*` implements Research→Outline→Draft→SEO→GEO→Quality
as real, individually-persisted steps (`agent_run_steps` +
`content_artifacts`), gated by Information Gain (ADR-015's amendment: now a
real deterministic score for discovery-sourced opportunities) — a page that
fails the quality gate is persisted as `quality_rejected` with explicit
reasons, never silently generated anyway. Not yet split out: Entity/Data
enrichment, FactCheck, and Schema/InternalLink as their own distinct agent
steps (folded into Research/Draft and the separate `lib/pages/json-ld.ts` +
`lib/internal-links/*` modules respectively) — a reasonable v1
simplification, revisit if a real need to inspect them as separate steps
emerges. Exit criterion met: an approved Opportunity produces a QA'd,
human-publishable draft Page end-to-end.

## Phase 6 — Page Engine + public rendering — ✅ shipped (minimal, in-app — ADR-016)
`Page`/`PageVersion` model, JSON-LD Schema Engine, a dynamic global
sitemap, and a minimal public render route
(`app/sites/[projectId]/[slug]/page.tsx`) all shipped — deliberately inside
this app rather than a separate `apps/public-site` (ADR-016 amends
ADR-007's timing). Phase 4 added real per-tenant domain binding (ADR-018)
and a `RouteTemplate` registry (§19) — but template binding today is
classification-only (`pages.route_template_id` records which template an
opportunity matched, via the same vertical-agnostic `resolveRouteTemplate`
regardless of project vertical); public URL resolution still goes through
the simpler `(projectId, slug)` path, not a template's own `pattern` — see
ADR-016. Not yet done: rendering a page's URL FROM its bound template's
pattern, sitemap sharding (not needed at current page volume). Exit
criterion met: an approved, QA'd page renders
live at a real URL with valid, validated JSON-LD and appears in the
sitemap — proven by `tests/e2e/vertical-slice.test.ts`. The trigger to
build a real separate `apps/public-site` (ADR-000/ADR-007) is unchanged:
real per-tenant domain binding or page volume that outgrows a single
in-app route.

## Phase 7 — Learning loop integrations — ✅ shipped (v1, Phase 5B)
Search Console (ADR-025), Trend Engine (ADR-026), AI Visibility (ADR-028)
all real and working: `lib/intelligence/*` — real schema, real deterministic
detection/classification, a real manual-import path plus a real (if
unexercised-in-this-environment) OAuth client for Search Console, real LLM
calls for AI Visibility. `opportunities.trend_score` is now genuinely
computed for trend-driven opportunities (previously `NULL`). Not yet
done: Cannibalization/Content Decay engines (§69–70) — no real duplicate-
content detector exists yet; `demandScore`/`competitionScore`/
`authorityGapScore`/`citationPotentialScore`/`cannibalizationRiskScore`
remain honestly `NULL` (each still needs its own real data source). Exit
criterion partially met: `final_score` can now draw on `trendScore` as a
5th real component for trend-driven opportunities specifically, not yet
universally across every opportunity type.

## Phase 8 — Hardening & scale
RLS (ADR-001 R-1), CSRF (ADR-011 R-9), OpenTelemetry (ADR-012, once Phase 4/6
create a second process), explicit cross-tenant-access test suite (R-3),
sitemap/DB partitioning readiness review (§66) once real page volume exists.
Exit criterion: every "Negative" line in the ADRs above is either resolved
or has an owner and a trigger condition, re-reviewed at this phase.

## Phase 9 — Intelligence domain model + engines — ✅ shipped (Phase 5B, ADR-024)
Signal, Evidence (generic), Insight, Trend, Query/Intent, Role, Market/
Metric, external Data Connectors + freshness, the Opportunity Graph +
Explanation (§25-26), a real Deep Research Agent (§22, gap-focused, never
writes content), Information Gain V2 + Gate (§23-24, additive — v1 stays
the fast discovery-time default per ADR-027), and a real Recommendation
Engine (ADR-030) all shipped with real, tenant-scoped persistence and
tenant-isolation tests. A new `trend_analysis` WorkflowPipeline runs
synchronously (fast, deterministic — never enqueued through the step-job
queue). Not yet done: a dedicated UI (Mission Control V2, Opportunity Map
V2, Intelligence Timeline, §34-37) — this phase was API-first,
documented as PARTIAL below and in risks.md; wiring the Information Gain
V2 gate into the actual page-generation blocking path (still v1 there,
ADR-027); AI Visibility sentiment (always `null`, no real second signal
exists yet); more Recommendation Engine rules (merge_pages, build_calculator
need their own real trigger signals). Exit criterion met for the domain
model itself: `tests/integration/intelligence-layer.test.ts` (24 tests)
proves every stage of OBSERVE→UNDERSTAND→DISCOVER→SCORE→DECIDE works
against real Postgres, end to end from a raw Signal through a real,
explainable, graph-linked Opportunity.

## Phase 10 — Intelligence Decision Layer: Signal → Correlation → Decision → Action → Outcome → Learning — ✅ shipped (v1, Phase 6, ADR-031..037)
Closes the loop Phase 9 left open: a unified Signal Engine (`lib/intelligence/
signal-engine.ts`, ADR-032) so no module invents its own detection; a
deterministic, rule-based Correlation Engine and Decision Engine (ADR-032)
— never LLM-only reasoning for "is this worth acting on"; a real,
explainable `IntelligenceDecision` object (16-action closed taxonomy,
every row carrying its own reason/evidence/cost/risk/confidence, ADR-031);
a real `IntelligenceAction`/`IntelligenceOutcome` pair pointing at a real
`agent_runs` row (never a second parallel tracker); Score Calibration
(ADR-034) and a real, bounded, sample-gated Learning Loop feeding back into
the Information Gain V2 gate (ADR-035); durable, incremental event-driven
recalculation via a two-tier pg_notify + queue design (`migrations/0010`,
ADR-032/033) — never a full recomputation sweep; a full Decision Layer API
surface (`/api/v1/intelligence/{insights,decisions,actions,outcomes,
timeline,map}`, ADR-036); and — the headline fix — Information Gain V2
actually wired into the real, blocking content-generation path for the
first time (`information_gain_gate` step, ADR-031), where its first real
run surfaced and fixed two real bugs (a dead `sourceType` heuristic, an
unreachable REJECT branch) rather than being left as an on-demand-only
inspection endpoint. Not yet done: single-subject-scoped detector variants
(today's detectors are project-scoped — a real, named limitation, ADR-032);
a dedicated Mission Control V2/Opportunity Map/Agent Control Center/
Intelligence Timeline UI (this phase was API- and backend-first, same
posture Phase 9 took, with reusable API responses shaped for a future UI
rather than a built one); Search Console/AI Visibility real production
OAuth-lifecycle hardening beyond Phase 5B's foundation (§15-16 of the
brief — real follow-up, not attempted this phase given the scope already
covered). Exit criterion met: `tests/integration/decision-layer.test.ts`,
`tests/integration/intelligence-recalc.test.ts`,
`tests/integration/learning-loop.test.ts`,
`tests/unit/correlation-decision-engine.test.ts`, and
`tests/api/intelligence-decision-layer-api.test.ts` prove the full real
chain — signal → correlation → decision → action → outcome → calibration →
adjusted score — end to end against real Postgres, with adversarial
tenant-isolation coverage at every layer; the E2E vertical slice
(`tests/e2e/vertical-slice.test.ts`) continues to pass with zero
regressions with the gate now genuinely enforced.

## Phase 11 — Decision → Action bridge + Mission Control — ✅ shipped (v1, Phase 7, ADR-038..042)
Closes `docs/architecture/risks.md` R-37, the most-named gap Phase 10 left
open: an approved `IntelligenceDecision` now really, durably creates and
dispatches a real execution. `DecisionActionResolver`
(`lib/intelligence/action-plan.ts`) maps the real 16-action taxonomy onto
an honest `ActionExecutionPolicy` — a real `WorkflowRun` for six action
types, a real synchronous operation for two more, a real no-op for two,
and an honest `BLOCKED` for the remaining six with no real execution path
yet. A real `PolicyEngine` (capability/freshness/budget) gates dispatch,
backend-owned, never the agent's own call. `ActionExecutor`
(`lib/intelligence/action-executor.ts`) is real, DB-enforced idempotent
per Decision (`migrations/0011`'s partial unique index), with real
worker-crash recovery and a real completion hook wired into
`lib/workflow/engine.ts#finalizeWorkflow()` — the one real choke point
every workflow's terminal transition passes through. A genuinely new,
Decision-driven Opportunity is scored with the exact same real formula
`lib/opportunity/discovery.ts`'s batch scan already uses, never forked.

Real, working UI for the first time since Phase 9's API-first posture
began: `/mission` (real KPIs, "what should I do next," a real Intelligence
Timeline feed) and `/intelligence/decisions` (the full real Decision
lifecycle — approve/reject/execute). Both read live API data only.

New API surface: `POST .../decisions/:id/execute`, `GET .../decisions/:id/
action-plan`, `GET/POST .../actions/:id`, `.../actions/:id/retry`,
`.../actions/:id/cancel`, `.../actions/process`, `GET .../mission`,
`GET .../next-action`. A real, adversarial security review
(`docs/architecture/phase7-security-review.md`) found and fixed two real
issues (a subquery missing its own tenant scope, a missing rate limit on
the real dispatch endpoint).

Not yet done, named explicitly rather than silently dropped: six
unsupported action types (R-42), automatic dispatch retry (R-43), the
Opportunity Map graph UI (ADR-042, deliberately deferred — the real
backend already shipped in Phase 10), a rebuilt Agent Run Inspector, a
Live Agent Graph, real-time timeline push (R-45), an outcome-narrative
view (R-46), and the Command Palette (R-47). Exit criterion met:
`tests/integration/decision-action-bridge.test.ts` and
`tests/api/decision-action-bridge-api.test.ts` prove the full real chain
— approve → execute → drain → real Opportunity+Page, or an honest
Information-Gain-blocked outcome — end to end against real Postgres, with
concurrency/idempotency/budget/capability/tenant-isolation coverage; the
E2E vertical slice continues to pass with zero regressions.

## Phase 12 — Intelligence Command Center UI — 🟡 in progress (Phase 8, ADR-043..046)
Continues Phase 11's real UI push into the three surfaces it named as
not-yet-done: a multi-mode Intelligence Graph, a Live Agent Graph, and a
dedicated Intelligence Timeline — all against already-real backends, no
new domain logic invented.

`lib/intelligence/map.ts#buildGraph()` is a single dispatcher over seven
real `GraphMode`s (decisions/opportunities/knowledge/markets/roles/
intents/pages) sharing one `MapNode`/`MapEdge` shape — never five
separate graph implementations. `components/mission/intelligence-graph.tsx`
renders it with `@xyflow/react` (the one graph library added this phase),
server-side filters (entityType/status/minScore, never fetched-then-
filtered client-side), and a click-through Inspector reading each node's
real detail record (ADR-044). Named limitation: true viewport-based/
progressive/clustered rendering was not built — a single bounded
server-side limit (100, capped 200) stands in for it (R-48).

`components/mission/live-agent-graph.tsx` (`/agents/live`) needed zero
new backend: `GET /api/v1/workflows?status=` already lists every real,
tenant-scoped `WorkflowRun`. Polls the six real active statuses every 5s,
renders each run's real per-pipeline step sequence colored by its real
checkpoint state, animates only the one step currently in flight — never
decorative — and links out to the existing `/agent-runs/:id` inspector
rather than duplicating it (ADR-046).

`lib/intelligence/timeline.ts#buildIntelligenceTimeline()` gained real
server-side filters (type/entity/date-range/search — ADR-045);
`/intelligence/timeline` is the first dedicated page over it. A real bug
surfaced by this phase's own visual-QA discipline (not by typecheck):
adding these three nav links pushed the flat top-nav row to 19 links,
silently scrolling the newest ones off-screen. Fixed by restructuring
`TopNav`'s desktop navigation into five grouped, keyboard-accessible
dropdowns — a durable fix, not a one-off padding tweak.

Not yet done, named explicitly rather than silently dropped: Mission
Control's four-zone reorganization (ADR-043), the Command Palette (R-47,
still the most-repeated unbuilt item across two phases now), global
search, Decision Center's causal-chain graph view (the Intelligence
Graph's "decisions" mode already covers most of this data — wiring a
direct link from Decision Center into it, filtered to one decision, is
the smallest remaining step), Knowledge Graph entity-detail depth, a
dedicated Information Gain "why" visualization, graph clustering/LOD at
target scale (R-48), and Timeline SQL-level filtering at target scale
(R-49). 228/228 tests pass (225 Phase-7 baseline + 3 new Timeline filter
tests); every new page was verified with a real dev-server + Playwright
pass, not just `tsc`.

## Explicitly out of scope until a phase above reaches it
White-label multi-brand deployment, billing, community-signal ingestion,
non-real-estate/non-generic vertical proof (`docs/architecture/
vertical-slice.md` covers the multi-vertical proof requirement, §77,
separately — it needs Phase 2+3 shipped, not a new phase of its own).
