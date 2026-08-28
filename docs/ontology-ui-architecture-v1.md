# Ontology UI Architecture v1

Status: architecture proposal, documentation only — no code changes accompany this document. Builds on `docs/ontology-product-model-v1.md`'s real Object/Property/Link/Action inventory. Every UI pattern below is mapped to what's real and shipped today first, then to what's proposed — per the brief's own §34: reuse existing engines, never build a parallel one.

## 0. What already exists (read this before designing anything new)

This codebase already has four real, shipped UI surfaces that are — without having used the word — ontology UI:

1. **Multi-mode System Graph**, today: `components/mission/intelligence-graph.tsx` + `lib/intelligence/map.ts#buildGraph()` (Phase 8, ADR-044). Seven real `GraphMode`s (decisions/opportunities/knowledge/markets/roles/intents/pages) sharing one `MapNode`/`MapEdge` shape, React Flow rendering, a click-through Inspector reading each node's real detail record, server-side filters. This *is* §22's System Graph, already real.
2. **Object Explorer seed**, today: `lib/search.ts` + `GET /api/v1/search` + `components/studio/command-palette.tsx` (Phase 8). Real, tenant-scoped search across Entity/Opportunity/Page/Decision/Worker, returning `{type, id, title, subtitle, href}`. This is §14/15's Object Explorer's real starting point — not yet resolving to a full Object View, not yet relationship/action-aware.
3. **Real Timeline**, today: `components/mission/intelligence-timeline.tsx` + `lib/intelligence/timeline.ts` (Phase 8, ADR-045). Real server-side filters by type/entity/date/search across Signal→Observation→Decision→Action→Outcome.
4. **Page Factory**, today: `components/home/product-home.tsx` (Phase UX-3). A real production-pipeline homepage over real `OpportunityStatus`/`PageStatus` counts, a real Opportunity→Page spotlight, a real production stream, a real contextual Next-Action.

Nothing in this document proposes replacing any of these four. Every section below states which existing engine it extends.

## 1. Object Explorer

**Real today**: `lib/search.ts#globalSearch()` — bounded ILIKE search, 5 real object types, no relationship/action awareness, results link to list pages (not object detail — see ADR-045's own honest note on this).

**Proposed extension, not a rewrite**: resolve a search result to a real Object View (§2) instead of a list page, and widen the searched object-type set to match §1 of the product model doc (add Market/Role/Query/Trend/Website/AgentRun). The "semantic" search the brief's §15 asks for ("family travel miami" → Market + Role + Intent + Opportunity + Pages) is achievable without new infrastructure: it is real, parallel ILIKE queries against each object type's name/title columns (exactly the existing pattern), returning a real, typed, grouped result set the Command Palette already renders — extending `globalSearch()`'s query set, not building a new search engine. True semantic (embedding-based) search is a real, larger, separate capability — named here as **not proposed for v1**, since it would require new backend (vector storage, embeddings) that §34 explicitly says not to add without cause.

## 2. Object View

**Proposed, real precedent**: no single reusable Object View component exists today — Opportunity (`/opportunities/[id]`) and Page (`/pages/[id]`) each have their own real dedicated detail page; Entity detail lives inline inside `/knowledge`'s explorer component, not its own route — a real inconsistency. The proposed Object View is one shared layout contract (Header/Properties/Relationships/Evidence/Activity/Performance/Actions, per the brief's §16) that each Object Type's real detail page adopts, reading from that type's already-real API (`GET /api/opportunities/:id`, `GET /api/pages/:id`, `GET /api/knowledge/entities/:id`, etc.) — a shared React component (`ObjectView`, see the design-system doc's component list) parameterized by which real sections a given Object Type actually has data for (a Trend has no "Actions" section today; an Opportunity does). Building this is real, scoped frontend work — extending existing detail pages to a shared layout, not new backend.

## 3. System Graph

**Real today, as stated in §0.1**: `lib/intelligence/map.ts#buildGraph()`'s seven modes already cover most of the brief's §22 domain list (Knowledge/Markets/Roles/Intents/Opportunities/Pages/Decisions). **Real, named gaps**: no `agents` or `search`/`ai-visibility` mode exists yet. Proposed: two more `GraphMode` values (`"agents"` — AgentRun/Worker nodes and their real `OPERATES_ON`/`PRODUCES` edges from the product-model doc §6; `"visibility"` — the Visibility Graph, §8 below) added to the *same* dispatcher, never a second graph engine — this is precisely the brief's own §32 architectural discipline ("Do not build five separate graph implementations. Reuse.").

## 4. Relationship View

**Real data, no dedicated UI today**: the Object View's real Relationships section (§2) already lists an object's real links (via the three real edge tables, product-model doc §4). The brief's §17 "path" walk (Miami → targets → Family Traveler → has intent → Best Hotels → creates → Opportunity → materializes as → Page) is a real, traceable chain given today's real FK/edge data — `Page.opportunityId` → `Opportunity.primaryEntityId` → `entity_relationships` rows outward from that Entity. Proposed: a **breadcrumb-style relationship trail** component inside the Object View (not a separate page) that renders exactly this real chain, one hop at a time, each hop a real, clickable object — reusing the System Graph's real node/edge data, rendered as a linear trail rather than a full canvas when the user's intent is "trace this one path," not "explore everything" (per the brief's own §23: table/timeline/graph/trail, chosen by what the moment needs, never one visual treatment for everything — see design-system doc §7 for the deciding rule).

## 5. Action UI

**Real today**: `ActionPlan` + `PolicyDecision` (product-model doc §3) are already computed for every Decision; `components/home/product-home.tsx`'s `NextActionBanner` and `components/mission/mission-control.tsx`'s `NextActionCard` already render one real instance of this (name/reason/risk/confidence/preview via `plan.status === "unsupported"`/execute button/real audit trail via the `intelligence_actions` row it creates).

**Proposed**: extract the shared shape both those components already independently implement into one reusable `ActionButton`/`ActionCard` pair (design-system doc §8) taking `{action: ActionPlan, policy: PolicyDecision, onExecute}` — so a future object type gaining a real action (e.g., a Trend's `EXPAND_MARKET` decision, or a Worker's `Run` action) renders through the same component, not a fourth hand-rolled copy. This is a real refactor opportunity, not a new capability — the underlying real execute chain (`PATCH .../decisions/:id` → `POST .../decisions/:id/execute`) stays exactly as-is.

## 6. Mission Control → Ontology Control Room (reframe, not rebuild)

**Real today**: `components/mission/mission-control.tsx` (ADR-040) + `lib/intelligence/mission.ts#buildMissionSnapshot()`. Real KPIs, real "what to do next," a real Timeline feed. ADR-043 (Phase 8) already named its four-zone reorganization as a real, undone gap.

**Proposed**: rename the *concept* (not necessarily the route) to Ontology Control Room and organize its real zones around the ontology contract (product-model doc §11) rather than generic KPI cards: **System State** ("what objects exist, what changed" — real entity/opportunity/page counts + real Timeline feed), **Ontology** (a compact, real System Graph excerpt — not the full canvas, a "here's your knowledge shape" preview linking out to `/intelligence/map`), **What Matters Now** (the real `resolveNextAction()` — unchanged), **What Happened** (real recent Outcomes). This is the same real data `buildMissionSnapshot()` already computes, reorganized — no new backend, matching ADR-043's own stated follow-up.

## 7. Page Factory (already real — extend, don't rebuild)

`components/home/product-home.tsx` (Phase UX-3) already implements the brief's §24-25 near-exactly: a real six-stage pipeline over real `OpportunityStatus`/`PageStatus`, a real Opportunity→Page spotlight, a real chronological production stream framed as production events. The brief's §25 "Live Page Production" example (an opportunity card showing its real ontology context — Market/Role/Intent — plus real Information Gain, real evidence count, real current stage, real progress) maps directly onto extending the existing spotlight component (`OpportunityToPage` in `product-home.tsx`) with the real ontology-context fields the product-model doc §7-8 already names (`PageBrief.market`/`.role`/`.targetIntent`, real `entity_evidence` count for the primary entity) — a real, scoped enrichment of an already-shipped component, not a new page.

## 8. Visibility Graph

**Real data, no dedicated view today**: the brief's §26 wants Brand/Website/Pages/Queries/Entities/Markets/AI-Engines/Search-Engines/Competitors/Sources/Communities connected into one answer to "where is visibility coming from." Real data already covers most of this: `ai_citations`/`ai_answers`/`ai_runs` (AI engine visibility), `search_query_observations`/`search_console_snapshots` (search engine visibility), `Page`↔`Entity`↔`Opportunity` real chains (which pages/entities drive which visibility). **Real, named gap**: no "Competitor" or "Community" object type exists in this codebase at all today — building the Visibility Graph's competitor/community dimensions would require new domain modeling, which is out of this document's documentation-only scope and is named here as real, larger follow-up work, not something to fabricate a placeholder for. The buildable-today subset (Page/Entity/Query/AI-answer/Search-performance) is a proposed **eighth `GraphMode`** on the same System Graph dispatcher (§3) — never a separate graph engine.

## 9. Watcher

**Real today, unnamed as a layer**: Signal recording (`lib/intelligence/signals.ts#recordSignal()`), Trend detection (real `state`/`velocity`/`momentum` computation), Search Console sync (`search_console_snapshots` ingestion), Website discovery (`WebsiteDiscoveryAgent`). These already are, collectively, the real Watcher — continuously-triggered, deterministic recorders of what changed. **Proposed**: name this existing set as the Watcher layer in documentation and diagrams (this is the correct grouping, no code moves), and — the one real, scoped gap — surface it as a visible activity feed on the Ontology Control Room (§6) using the exact same real Timeline data (`lib/intelligence/timeline.ts`) already built, filtered to Signal/Trend-producing entry types.

## 10. Strategist

**Real today, unnamed as a layer, and explicitly NOT an LLM**: the Correlation Engine (`lib/intelligence/correlation-engine.ts`) and Decision Engine (`lib/intelligence/decision-engine.ts`) — both real, deterministic, rule-based (ADR-032 is explicit and load-bearing: "NO LLM for correlation/decision logic"). This is the real Strategist: it already answers "what changed, why does it matter, what opportunity does it create, what should we do" (the brief's §28) via `resolveNextAction()`'s real, explainable `Decision.reason`/`.expectedImpact`/`.confidence` fields — never an LLM-generated narrative standing in for a real computed answer. **This document explicitly preserves that architectural fact** — any future UI work must not blur the Strategist's deterministic nature by, say, having an LLM write the "why it matters" text; the real `reason` field already exists and is already real.

## 11. Operator

**Real today, unnamed as a layer**: `ActionExecutor` (`lib/intelligence/action-executor.ts`) + `WorkflowEngine` (`lib/workflow/engine.ts`) — the real execution machinery behind every `POST .../decisions/:id/execute` call, already durable, checkpointed, budget-enforced, idempotent (ADR-038/039). The Page Factory's real production pipeline (§7) *is* the Operator's real, current UI expression. No new Operator UI is proposed beyond §7's existing extension.

## 12. Agent Orchestration Visualization

**Real today**: `components/mission/live-agent-graph.tsx` (Phase 8, ADR-046) already shows real per-run, per-step state (not a generic workflow chart) for every active `AgentRun`. The brief's §21 "Object → Action → Agent → Output Object" chain is real and traceable today via `Opportunity.sourceAgentRunId` (input) → `AgentRun.pipeline`/`.status` (the agent) → `Opportunity`/`Page`/`AgentDecisionLog` it produced (output) — proposed: add this real chain as a second view mode on the existing Live Agent Graph page (a per-run "what fed this, what did it produce" trail, reusing §4's Relationship View trail component), not a new page.

## 13. Not everything should be a graph (design discipline, carried into every section above)

Per the brief's own §23 and matching this document's repeated "extend, don't duplicate" thread: System Graph (§3) for relationships, Object View (§2) for one entity, Timeline (already real, `lib/intelligence/timeline.ts`) for sequence, Page Factory's pipeline (§7) for production state, a plain real table for comparison (e.g., the existing `/opportunities` list). No new visualization type is proposed that doesn't already have a real, shipped home in this codebase — the gap this document closes is *connecting* these four real surfaces under one legible ontology story, not adding a fifth kind of view.

## 14. Summary: what is real, what is proposed

| Surface | Status |
|---|---|
| System Graph (7 modes) | **Real** (Phase 8) — 2 more modes proposed (§3, §8) |
| Object Explorer (search) | **Real, narrow** (Phase 8) — resolution to Object View + wider type set proposed (§1) |
| Intelligence Timeline | **Real** (Phase 8) — reused, not extended, by Watcher (§9) |
| Page Factory | **Real** (Phase UX-3) — real-context enrichment proposed (§7) |
| Object View (generic) | **Proposed** — real per-type detail pages exist, shared layout does not |
| Relationship trail | **Proposed** — real data, no dedicated component |
| Action UI (shared component) | **Proposed** — real logic exists twice, independently; proposed to unify |
| Ontology Control Room | **Proposed reframe** of real Mission Control — real data, new organization |
| Visibility Graph | **Proposed, partial** — Competitor/Community objects are a real, named gap outside this document's scope |
| Watcher / Strategist / Operator | **Proposed naming** of real, already-shipped, already-correctly-architected layers |
