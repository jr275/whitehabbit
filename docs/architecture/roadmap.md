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

## Phase 4 — Durable workflow migration (unblocks a truly resumable Content Factory)
Not yet done — both the website-discovery and content-generation pipelines
still run synchronously in-process (ADR-003/ADR-016, `docs/architecture/
risks.md` R-16), bounded by conservative limits so this is safe at current
scale. Adopt Temporal (or equivalent) per ADR-003's trigger once a step
genuinely needs to survive a process crash mid-execution. Exit criterion:
a workflow step can crash and resume without re-running completed steps or
losing durable state.

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
ADR-007's timing). Not yet done: a generalized `RouteTemplate` engine,
per-tenant domain binding (ADR-010), sitemap sharding (not needed at
current page volume). Exit criterion met: an approved, QA'd page renders
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
