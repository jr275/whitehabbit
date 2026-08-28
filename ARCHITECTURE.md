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
| Durable workflow engine | **new in Revision 3** — `lib/workflow/*` (`agent_runs`/`agent_run_steps`, extended) — provider-independent `WorkflowEngine`, 10-state machine, checkpoint-resume, retry+backoff, idempotency | Durable AgentRun/AgentStep execution (§4–9) |
| Job queue | **new in Revision 3** — `jobs` table; `lib/workflow/queue.ts` (`FOR UPDATE SKIP LOCKED`, tenant concurrency limits, priority) | JobQueue + tenant fairness (§7–9) |
| Budgets & capabilities | **new in Revision 3** — `lib/workflow/budget.ts`, `lib/workflow/permissions.ts` | Agent budgets + capability-based permissions (§10–11) |
| Human approval & autonomy | **new in Revision 3** — `approvals` table; `lib/workflow/approval.ts`, `lib/workflow/autonomy.ts` | Durable human-in-the-loop + AutonomyPolicy LEVEL_0–4 (§12–13) |
| Domains | **new in Revision 3** — `domains`/`domain_verifications` tables; `lib/domains/*` — real DNS TXT/CNAME verification, server-side host→tenant resolution (`proxy.ts`) | Domain/subdomain management (§15–17, ADR-018) |
| Route templates | **new in Revision 3** — `route_templates` table; `lib/route-templates/*` — vertical-agnostic classification matcher | RouteTemplate registry (§19, classification-only — see risks.md R-24) |
| Real-time events | **new in Revision 3** — Postgres `LISTEN`/`NOTIFY` triggers (`migrations/0005_workflow_notify.sql`); `GET /api/v1/workflows/:id/events` | Real-time execution events (§27) |
| Step-level execution | **new in Revision 4** — `lib/workflow/step-worker.ts`, `lib/*/steps.ts` — one durable job per workflow step, real lease-based crash recovery | Step-level durable jobs (ADR-023) |
| Intelligence domain | **new in Revision 5** — `lib/intelligence/*` — Signal/Evidence/Insight/Trend/Query/Role/Market/Recommendation, real Deep Research + Opportunity Graph/Explanation | Intelligence Layer domain model (ADR-024) |
| Search Console | **new in Revision 5** — `lib/intelligence/search-console/*` — real schema, manual import + gated live OAuth, deterministic anomaly detection | Search Console integration (ADR-025) |
| AI Visibility | **new in Revision 5** — `lib/intelligence/ai-visibility/*` — real LLM-provider prompts, citation graph | AI Visibility (ADR-028) |

What does **not** exist yet, honestly: Temporal (or an equivalent managed
durable-execution product) — `lib/workflow/*` provides a real,
provider-independent `WorkflowEngine` (ADR-017) that a Temporal-backed
implementation could satisfy later without a domain-code rewrite, but no
such implementation exists today; TLS/SSL provisioning for a tenant's
verified custom domain (ADR-018 verifies DNS control, not certificates); a
real Agent Control Center dashboard UI consuming the new `/api/v1/*`
surface (the API itself is real and tenant-isolated; a dedicated
multi-run/approvals/domains UI beyond the existing agent-run detail view
is not built); an event outbox for external webhook delivery; pgvector/
embeddings; RLS at the database level (isolation today is 100%
application-layer, enforced by `requireSession()` re-verifying membership
on every request — see ADR-001); a monorepo/package split. See
`docs/architecture/risks.md` R-20 through R-25 for the complete, current
list of named gaps.

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

- `docs/adr/ADR-000-evolve-in-place.md` … `ADR-042-*.md` — one architectural
  decision each, per the brief's mandated list (§74), plus ADR-000 for the
  monorepo-timing decision above. ADR-017 through ADR-022 (Revision 3) cover
  the durable workflow platform; ADR-023 (Revision 4) covers step-level
  async execution; ADR-024 through ADR-030 (Revision 5) cover the
  Intelligence Layer foundation; ADR-031 through ADR-037 (Revision 6) cover
  the Intelligence Decision Layer — real signal correlation, explainable
  decisions, a real enforced Information Gain gate, and a deterministic
  Learning Loop; ADR-038 through ADR-042 (Revision 7) cover the real
  Decision → Action bridge and Mission Control. ADR-003 and ADR-010 are
  marked superseded rather than deleted.
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

**Revision 3** makes the existing system durable rather than adding new
product surface, per the Phase 4 brief's own framing. `lib/workflow/*`
replaces `lib/agent-runs/*`'s synchronous, non-resumable execution with a
real `WorkflowEngine` (ADR-017): a 10-state machine, database-driven
checkpoint-resume (a killed/restarted process resumes past already-
succeeded steps, proven by `tests/integration/durable-workflow.test.ts`),
in-process retry with real backoff+jitter, database-enforced idempotency
(a partial unique index, not just application logic), a Postgres-backed
job queue with tenant-fair concurrency limits, per-run budget enforcement
that stops execution rather than silently continuing, and formalized
per-agent-type capability permissions. A durable human-approval workflow
and a backend-only `AutonomyPolicy` (LEVEL_0–4) replace Revision 2's
immediate-publish-on-quality-pass behavior (ADR-020). Real DNS-verified
domain management (ADR-018) and server-side host→tenant resolution
(`proxy.ts`, made possible because this fork's Proxy defaults to the
Node.js runtime as of Next v16) supersede ADR-010's original deferral.
Real-time execution events use Postgres `LISTEN`/`NOTIFY` (ADR-021), not
polling. A new `/api/v1/*` Agent Control Center API surface (workflows,
approvals, domains, route templates) is real and tenant-isolated, tested
adversarially in `tests/security/phase4-tenant-isolation.test.ts`.
Six new ADRs (**ADR-017 through ADR-022**) record these decisions; ADR-003
and ADR-010 are marked superseded rather than deleted, so the earlier
"why not yet" reasoning stays legible. No new infrastructure vendor was
introduced — Temporal was deliberately not adopted (ADR-017); the
durability guarantees come from Postgres, the platform's existing sole
datastore.

**Revision 5 (Phase 5B, ADR-024)** begins the product's transition from
"AI-powered programmatic SEO platform" toward "Autonomous Knowledge +
Search Intelligence Operating System" — a first-class Intelligence
domain model (`lib/intelligence/*`) implementing the brief's
OBSERVE→UNDERSTAND→DISCOVER→SCORE→DECIDE loop: Signal (raw, confidence-
scored observations), a generic Evidence table alongside Revision 2's
entity-specific one (ADR-029), Insight, Trend (ADR-026, real velocity/
momentum math with a real minimum-volume floor), Query/Intent (a real
rule-based classifier, never claiming to be ML), Role, Market/Metric
(generic — no hard-coded vertical), external Data Connectors with real
freshness-policy staleness detection, the Opportunity Graph + a real,
deterministic Explanation (§25-26 — never an LLM justifying a decision
after the fact), a Deep Research Agent (gap-focused, never writes
content), Information Gain V2 + Gate (ADR-027, additive — v1 remains
the fast discovery-time default), and a Recommendation Engine (ADR-030).
Real Search Console (ADR-025: a manual-import path plus a real, if
unexercised-in-this-sandbox, OAuth client) and AI Visibility (ADR-028:
real prompts to a real configured LLM provider via the existing
`callLlm()` abstraction — never a fabricated answer) integrations feed
real signals into this model. A new `trend_analysis` `WorkflowPipeline`
runs synchronously (a fast deterministic scan, never enqueued through
the Phase 5A step-job queue). Seven new ADRs (**ADR-024 through
ADR-030**) record these decisions. Deliberately not built this
revision: a dedicated UI for any of this (API-first — see
`docs/architecture/risks.md` R-33), and wiring the richer v2 Information
Gain gate into the actual page-generation blocking path (still v1
there). No fabricated data anywhere in this model — every table starts
genuinely empty for a tenant with no real signal source configured yet,
proven by `tests/integration/intelligence-layer.test.ts`'s 24 tests
against real Postgres.

**Revision 4 (Phase 5A, ADR-023)** removes the one durability gap
Revision 3 explicitly left open: a single orchestrator call still ran an
entire pipeline synchronously within one HTTP request or one queue-worker
job. Every step of both pipelines is now its own independent, durable,
tenant-scoped job (`lib/workflow/step-worker.ts`) — starting, resuming, or
retrying a workflow, or approving a publish, only ever enqueues the next
single step and returns; a worker tick executes exactly one step,
persists, and enqueues the next. `lib/website-discovery/steps.ts` and
`lib/content-pipeline/steps.ts` are now the single source of truth for
each pipeline's step logic; the two `orchestrator.ts` files became thin
in-process drivers over the same functions (the "LegacySyncExecutionAdapter"),
used only by tests/internal callers that want a synchronous result — zero
step logic is duplicated between the queue-driven and synchronous paths.
`jobs` gained a real lease (`lease_expires_at`) so a crashed worker's
claimed-but-never-finished job is recovered (`reapExpiredLeases()`) rather
than stuck `locked` forever, proven by a simulated crash in
`tests/integration/step-execution.test.ts`. `tenant_budgets` (real since
Revision 3 but unread) now actually governs both per-tenant concurrency
admission and budget resolution (`lib/workflow/budget-policy.ts`),
alongside a new `project_budgets` override layer — closing Revision 3's
R-22. The real, accepted cost: completing one whole pipeline now needs
4–7 sequential step dispatches instead of 1 (measured and extrapolated in
`docs/architecture/load-test-report.md`) — the durability property this
phase exists to deliver, not a hidden regression. One new ADR
(**ADR-023**) records the decision to extend the existing Job model
rather than introduce a parallel `WorkflowStepJob` concept.

**Revision 6 (Phase 6, ADR-031 through ADR-037)** closes the loop
Revision 5 left open — the transition from "workflow execution engine"
toward a real "Knowledge + Intelligence Operating System" the Phase 6
brief demands. A unified Signal Engine (`lib/intelligence/signal-engine.ts`)
so no module invents its own detection; a deterministic, rule-based
Correlation Engine and Decision Engine (`lib/intelligence/correlation-
engine.ts`, `decision-engine.ts` — explicitly never LLM-only reasoning
for "is this worth acting on," per the brief's own instruction) turning
real signal patterns into a real, explainable `IntelligenceDecision`
across a closed 16-action taxonomy; a real `IntelligenceAction`/
`IntelligenceOutcome` pair pointing at a real `agent_runs` row; Score
Calibration and a real, bounded, sample-gated Learning Loop
(`lib/intelligence/learning-loop.ts`) feeding real predicted-vs-actual
data back into the Information Gain V2 gate; durable, incremental,
event-driven recalculation (`migrations/0010`'s two-tier `pg_notify` +
durable queue design) — never a full recomputation sweep on any real
change; and, closing Revision 5's most-named gap (`docs/architecture/
risks.md` R-30), **Information Gain V2 actually enforced** in the real,
blocking content-generation path for the first time, whose first real
run surfaced and fixed two real bugs (a dead evidence heuristic, an
unreachable REJECT branch) rather than being left as an on-demand-only
inspection endpoint. A full Decision Layer API surface ships at
`/api/v1/intelligence/{insights,decisions,actions,outcomes,timeline,
map}` (Signal and Recommendation deliberately stay at their existing
Phase 5B paths rather than being duplicated — ADR-036), with adversarial
tenant-isolation coverage at every new layer. Seven new ADRs
(**ADR-031 through ADR-037**) record these decisions. Deliberately not
built this revision, continuing Revision 5's posture: a dedicated
Mission Control/Opportunity Map/Agent Control Center UI (API-first,
same reasoning as R-33), single-subject-scoped (vs. project-scoped)
incremental recalculation, and automatic Decision→Agent dispatch for an
approved Decision (the primitives are real and tested; the bridge from
a Decision's subject to the existing Opportunity-rooted content
pipeline is real, deliberately-deferred follow-up work — R-37). No
fabricated data anywhere in this layer — the E2E vertical slice
continues to pass with zero regressions with the gate now genuinely
enforced, proven by `tests/e2e/vertical-slice.test.ts` alongside five
new Phase 6 test files covering the full real chain end to end.

**Revision 7 (Phase 7, ADR-038 through ADR-042)** closes the loop
Revision 6 left explicitly open (`docs/architecture/risks.md` R-37): an
approved `IntelligenceDecision` now really, durably creates and dispatches
a real execution. A `DecisionActionResolver` (`lib/intelligence/
action-plan.ts`) maps the real 16-action taxonomy onto an honest execution
policy — a real `WorkflowRun` for six action types (reusing the exact same
content-generation pipeline every prior revision already proved, never a
second one), a real synchronous operation for two more (real internal-link
generation, real Deep Research), a real no-op for two, and an honest
`BLOCKED` for the remaining six with no real execution path yet — never
silently succeeding. A real, backend-owned `PolicyEngine` gates dispatch
(capability/freshness/budget), and `ActionExecutor` is real, DB-enforced
idempotent per Decision with real worker-crash recovery and a real
completion hook wired into `lib/workflow/engine.ts#finalizeWorkflow()` —
the one real choke point every workflow's terminal transition passes
through, regardless of trigger. Real, working UI ships for the first time
since Revision 5's API-first posture began: `/mission` (real KPIs, "what
should I do next," Approve & Execute) and `/intelligence/decisions` (the
full real Decision lifecycle), both reading live API data only, using this
codebase's existing design system. A real adversarial security review
(`docs/architecture/phase7-security-review.md`) found and fixed two real
issues. Five new ADRs (**ADR-038 through ADR-042**) record these
decisions, including one deliberate deferral (ADR-042: the Opportunity Map
graph UI, whose real backend already shipped in Revision 6, was not built
this revision — a scope decision, not an oversight). `tests/integration/
decision-action-bridge.test.ts` and `tests/api/decision-action-bridge-api.test.ts`
prove the full real chain — approve → execute → drain → real
Opportunity+Page, or an honest Information-Gain-blocked outcome — end to
end against real Postgres; the E2E vertical slice continues to pass with
zero regressions.
