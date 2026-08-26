# ARCHITECTURE.md

Status: living document. Last major revision: this change (Knowledge Graph +
Opportunity Engine foundation). Read this before touching `lib/db`, `lib/agent`,
`lib/knowledge`, `lib/opportunity`, or anything under `docs/adr`.

## 0. What this document is

The product brief for WhiteHabbit describes a five-year destination: a
multi-tenant "Knowledge Operating System" that turns any connected website
into an autonomous programmatic-SEO / AEO/GEO growth system, built on a
Knowledge Graph, an Opportunity Engine, a multi-agent Content Factory, and a
durable agent-orchestration substrate — deployed as a Turborepo monorepo with
dozens of packages.

This document reconciles that destination with what actually exists in this
repository today, states the decisions made to get from one to the other
without a disruptive rewrite, and points at the ADRs, domain model, roadmap,
and risk register that make those decisions concrete and auditable.

**The single most important fact about this codebase: it is not a green
field.** It is a working, deployed, single Next.js application (owned by v0,
auto-deploying `main`) that already embodies a large fraction of the target
architecture's *values* — tenant isolation derived server-side from session,
never from client input; no fabricated data, ever; structured, non-swallowed
error/reason codes; real cost/token accounting; append-only execution
ledgers; SSRF-guarded outbound calls — under different *vocabulary*. Sections
1–2 below exist so nobody re-derives that vocabulary mapping from scratch.

## 1. Current state (as of this revision)

A single Next.js 16 App Router application (`app/`, `lib/`, `components/`),
PostgreSQL as the only datastore, NextAuth (Credentials) for auth, deployed to
Vercel. No monorepo, no worker/queue infrastructure, no Temporal, no Redis, no
pgvector yet. Structure:

| Layer | Where | Target-spec equivalent |
|---|---|---|
| Tenant | `organizations`, `memberships` tables; `lib/session.ts` | Tenant + Membership (§7–8) |
| Agent | `workers` + `worker_versions` tables; `lib/workforce/*` | AgentDefinition + AgentVersion (§23) |
| Agent capability | `lib/agent/skills/*` (Trend Research, SEO Opportunity, Content Intelligence, Lead Qualification, Engagement Analysis, Customer Conversation) | Skill layer of the Content Factory pipeline (§22), pre-multi-agent |
| Agent run | `tasks` + `executions` + `execution_events` tables; `lib/agent/runtime.ts` | AgentRun + AgentStep (§23) |
| Tool | `lib/agent/tools/*` (LLM provider abstraction, web search, browser, analytics) with `ToolPermission`/`RiskLevel` and `ApprovalRequiredError` | Agent tool contracts + permissions (§24), human-in-the-loop (§25) |
| Output | `outputs` table | AgentArtifact (§23) |
| Vertical template | `lib/products/catalog.ts` ("Content Intelligence", "Programmatic SEO", "Discover") + onboarding → Domain Profile (`lib/products/domain-profile.ts`) | Product/vertical templating — the seed of RouteTemplate/PageTemplate genericity (§27–28) |
| Knowledge Graph | **new in this revision** — `entities`, `entity_relationships`, `entity_evidence` | Entity/EntityRelationship/EntityEvidence (§11–13) |
| Opportunity Engine | **new in this revision** — `opportunities`, explainable partial scoring | Opportunity + score components (§17–19) |
| Project | **new in this revision** — `projects` (one org → many connected websites) | Project (§8) |
| Observability | `lib/observability/logger.ts` (structured JSON logs, request IDs) | Pre-OpenTelemetry; no traces/metrics exporter yet (§48) |
| Security | `lib/security/ssrf-guard.ts`, `lib/rate-limit.ts` (Postgres-backed), `recordAudit()` | SSRF protection (§46), rate limiting, audit log |
| AI cost | `lib/agent/cost.ts`, `WorkerExecution.costUsd/inputTokens/outputTokens/model` | AI cost control (§49) |
| AI provider abstraction | `lib/agent/tools/llm-providers/*` (Anthropic, Gemini, local dev fixture) | LLMProvider interface (§50) |

What does **not** exist yet, honestly: Content Factory as a *multi-agent
pipeline* (today one Skill = one LLM call, evaluated once — not
Research→Entity→Data→Outline→Writer→SEO→GEO→Schema→Link→FactCheck→Quality→
Publish); a Page/PageVersion model or any public-site rendering engine;
a crawler; Search Console/AI-visibility integrations; a durable workflow
engine (Temporal or equivalent) — `executeTask()` is an in-process async
generator, explicitly documented as a placeholder for one; an event outbox;
pgvector/embeddings; RLS at the database level (isolation today is
100% application-layer, enforced by `requireSession()` re-verifying
membership on every request — see ADR-001); a monorepo/package split.

## 2. Foundational decision: evolve, do not rewrite

See **ADR-000**. Rewriting this into the prescribed `apps/*` + `packages/*`
Turborepo before a single additional feature ships would mean weeks of pure
migration risk on a codebase that already passes its own bar for production
seriousness (real tenant isolation, real cost accounting, real audit trail,
zero fabricated data paths) — the exact thing the brief says not to do
("never build the demo instead of the architecture," but also never
gold-plate infrastructure the product hasn't earned yet).

Decision: **evolve this application in place**, using internal
`lib/<domain>/` module boundaries that mirror the target `packages/*` names
1:1 (`lib/knowledge` ≈ `packages/knowledge`, `lib/opportunity` ≈
`packages/domain`'s Opportunity slice, etc.) so that extracting any of them
into a real workspace package later is a mechanical move, not a redesign.
Revisit the monorepo split when either (a) a second deployable app
(`public-site`, a real `worker` process) is actually being built, or (b) team
size makes a single `lib/` directory genuinely unwieldy. Both are roadmap
triggers, not calendar dates — see `docs/architecture/roadmap.md`.

## 3. Document map

- `docs/adr/ADR-000-evolve-in-place.md` … `ADR-015-*.md` — one architectural
  decision each, per the brief's mandated list (§74), plus ADR-000 for the
  monorepo-timing decision above.
- `docs/architecture/domain-model.md` — the full entity model: what's
  implemented today, its column-level shape, and the target model it's a
  step toward.
- `docs/architecture/roadmap.md` — phased implementation plan (§75 order),
  with this revision's scope marked.
- `docs/architecture/risks.md` — architectural risks and missing
  requirements, named explicitly rather than discovered later.
- `docs/architecture/vertical-slice.md` — the §76 end-to-end vertical slice,
  mapped step-by-step onto what exists, what this revision adds, and what's
  still open.

## 4. Revision history

**Revision 1** added the first real Knowledge Graph + Opportunity Engine
persistence layer and wired it into the one skill that already produces
opportunity-shaped output (`skill_seo_opportunity`), so opportunities the
Programmatic SEO worker discovers became first-class, tenant- and project-
scoped, provenance-carrying rows — listable, scored explainably, approvable,
rejectable through a real API.

**Revision 2 (this one)** completes the full §76 vertical slice end to end:
a real Website model and SSRF-safe, bounded, robots-aware crawler
(`lib/crawler/*`); a deterministic Website Knowledge Profile builder
(`lib/knowledge-profile/*`); evidence-first Entity Extraction from real
structured data + text heuristics (`lib/knowledge/extraction.ts`) feeding a
real, threshold-based, auditable Entity Resolution path
(`lib/knowledge/resolution.ts`); a deterministic Opportunity Discovery
engine that finds real gaps in the Knowledge Graph (`lib/opportunity/
discovery.ts`) scored by a real, deterministic Information Gain model
(`lib/opportunity/information-gain.ts`); a PageBrief builder
(`lib/pagebrief/*`); a six-step Content Generation Pipeline — Research,
Outline, Draft (the one LLM call), SEO, GEO/AEO, and a real Quality gate
that can reject a page with explicit reasons (`lib/content-pipeline/*`); a
Page/PageVersion model with immutable versions and an explicit publish
action (`lib/pages/*`); real JSON-LD generation and validation
(`lib/pages/json-ld.ts`); relationship-based internal link recommendations
(`lib/internal-links/*`); a minimal public Next.js render route and a
dynamic sitemap (ADR-016); and a full UI surface (`/websites`, `/knowledge`,
`/opportunities`, `/pages/:id`, `/agent-runs/:id`). A new `agent_runs`/
`agent_run_steps` ledger (ADR-016) makes every one of these system
pipelines inspectable the same way Worker executions already were.

Two new architectural decisions were required and are recorded in
**ADR-016**: a parallel execution ledger for pipelines that aren't tied to
a Worker, and shipping public rendering as a minimal in-app route now
rather than waiting for ADR-007's separate `apps/public-site`.

See `docs/architecture/vertical-slice.md` for the exact, step-by-step
status of the full §76 chain, and `tests/e2e/vertical-slice.test.ts` for
the automated proof that it actually works end to end.
