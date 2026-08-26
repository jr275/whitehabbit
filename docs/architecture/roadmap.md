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

## Phase 3 — Opportunity Engine UI + real Website Discovery
- Opportunities list/detail UI (§62) reading this revision's API.
- `WebsiteDiscoveryAgent` (§10): given a URL, safely crawl (reusing
  `lib/security/ssrf-guard.ts`), discover sitemap/robots/canonical
  structure, and produce a versioned `WebsiteKnowledgeProfile` — this is
  the real "Connect any website" onboarding (§9), which today's Programmatic
  SEO onboarding approximates with a text-answered questionnaire only.
- Exit criterion: a tenant provides a URL and gets a real Discovery Report
  (§9) plus entities seeded from real crawled content, not just from one
  skill's LLM-inferred topics.

## Phase 4 — Durable workflow migration (unblocks Content Factory)
Adopt Temporal (or equivalent) per ADR-003's trigger. Migrate
`executeTask()`'s body into workflow/activity split without changing its
external event contract. Exit criterion: a workflow step can crash and
resume without re-running completed steps or losing durable state.

## Phase 5 — Content Factory multi-agent pipeline (§22)
Research→Entity→Data→Outline→Writer→SEO→GEO→Schema→InternalLink→
FactCheck→Quality→Publisher, each a real agent step with its own input/
output contract, on top of Phase 4's durable substrate. Gated by
Information Gain (ADR-015) — no step may produce a publishable page for an
Opportunity whose `information_gain_score` is `NULL` or below threshold.
Exit criterion: an approved Opportunity can produce a QA'd, human-approvable
draft Page end-to-end.

## Phase 6 — Page Engine + public-site app (ADR-006, ADR-007)
`Page`/`PageVersion`/`ContentBlock` model, `RouteTemplate`, `apps/public-site`
serving `/[...slug]`, JSON-LD Schema Engine, sitemap shards, on-demand
revalidation. This is also the trigger to begin the monorepo split
(ADR-000). Exit criterion: an approved, QA'd page renders live at a real
URL with valid JSON-LD and appears in a sitemap.

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
