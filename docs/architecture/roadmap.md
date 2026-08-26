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

## Phase 7 — Learning loop integrations
Search Console warehouse (§32), Trend Engine (§31), AI Visibility (§33),
Cannibalization/Content Decay engines (§69–70) — each feeds real values into
the Opportunity score columns that are `NULL` today (ADR-006). Exit
criterion: `final_score` is computed from ≥5 real components, not 3.

## Phase 8 — Hardening & scale
RLS (ADR-001 R-1), CSRF (ADR-011 R-9), OpenTelemetry (ADR-012, once Phase 4/6
create a second process), explicit cross-tenant-access test suite (R-3),
sitemap/DB partitioning readiness review (§66) once real page volume exists.
Exit criterion: every "Negative" line in the ADRs above is either resolved
or has an owner and a trigger condition, re-reviewed at this phase.

## Explicitly out of scope until a phase above reaches it
White-label multi-brand deployment, billing, community-signal ingestion,
non-real-estate/non-generic vertical proof (`docs/architecture/
vertical-slice.md` covers the multi-vertical proof requirement, §77,
separately — it needs Phase 2+3 shipped, not a new phase of its own).
