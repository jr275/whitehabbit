# Ontology Product Model v1

Status: architecture proposal, documentation only — no code changes accompany this document, per the explicit scope of this task. It defines the conceptual and (where real) physical model the UI architecture doc and design system doc build on.

## 0. What this document is

This platform has already been, since Phase 2, an ontology in substance without the name: real Object Types (Entity, Opportunity, Page, Website, Trend, Market, Role, Query, Decision, Action, Outcome, Worker...), real Properties (columns/JSONB fields on each), real Links (three separate real edge tables — see §4), and real Actions (a closed `DecisionAction` taxonomy gated by a real `PolicyEngine`, and a closed `AgentCapability` allow-list gated by `assertCapability()`). What has been missing is not the substance — it is a single, named, cross-cutting model that makes all of it legible as one system, and a UI that treats objects and actions as first-class rather than as rows in separate feature pages.

This document does that naming and mapping. It distinguishes, throughout, between:
- **Real** — a table, column, function, or constraint that exists today, cited by file/table name.
- **Proposed** — a concept this document introduces to unify or extend real things, not yet physically implemented.

Per the brief's own instruction (§6): "Do not necessarily implement all of these physically in the database immediately if the current architecture does not require it. But the domain model and UI architecture must support the concept." Nothing here requires a migration to start being useful — the UI architecture doc (docs/ontology-ui-architecture-v1.md) shows how to build the ontology *experience* over what's real today.

## 1. Object Types

An Object Type is a real, closed kind of thing the system knows about. Every one below already exists as a real table (or a real, closed status/type union within one) — this section is a naming and inventory pass, not new modeling.

| Object Type | Real backing | Org/Project scoped | Notes |
|---|---|---|---|
| **Website** | `websites` (migrations/0003) | org+project | `WebsiteStatus` (pending/active/failed), `WebsiteDiscoveryStatus` (8-state real lifecycle) |
| **Entity** | `entities` (0002) | org+project | Free-text `entity_type` (e.g. `Place`, `Role`, `Intent` by convention — see §6's honest gap) |
| **Market** | `markets` (0007) | org+project | name + free-text geography |
| **Role** | `roles` (0007) | org+project | questions/pain_points/kpis/decision_criteria/preferred_terminology, all real JSONB |
| **Query** | `queries` (0007) | org+project | Real closed `intent` enum (informational/commercial/transactional/navigational/local/comparison/problem/how_to/definition/research/investment) |
| **Trend** | `trends` (0007) | org+project | Real closed `state` enum (emerging/rising/stable/declining/breaking), velocity/acceleration/momentum |
| **Opportunity** | `opportunities` (0002, extended 0007/0008) | org+project | Real closed `OpportunityStatus` (9 values), full real `OpportunityScoreComponents` |
| **Page** | `pages` (0003) | org+project | Real closed `PageStatus` (4 values), quality/seo/aeo/geo/information-gain scores |
| **PageBrief** | `page_briefs` (0003) | org+project | The real, structured generation spec a Page is produced from |
| **Signal** | `signals` (0007) | org+project | Real, typed observed events (`SignalType`), the ground floor of the Decision Layer |
| **Observation** | `intelligence_observations` (0008) | org+project | A real correlated pattern across Signals |
| **Decision** | `intelligence_decisions` (0008) | org+project | The real, explainable "what to do" object — 16-value closed `DecisionAction`, real reason/evidence/risk/confidence |
| **Action** | `intelligence_actions` (0008, extended 0011) | org+project | The real, DB-idempotent execution of an approved Decision |
| **Outcome** | `intelligence_outcomes` (0008) | org+project | Real measured result of an Action, `delta` null until a real baseline exists |
| **Worker** | `workers` (0001) + `worker_versions` | org only | A user-configured, buildable/releasable agent blueprint — distinct from the fixed system `AgentType`s below; see §7 |
| **AgentRun** | `agent_runs` (0003, extended 0004) | org+project | The real `WorkflowRun` — durable, checkpointed, budget-enforced execution of one pipeline |
| **AiRun / AiAnswer / AiCitation** | `ai_runs`/`ai_answers`/`ai_citations` (0007+) | org+project | Real AI-visibility measurement chain |
| **SearchConsoleProperty / Snapshot** | `search_console_properties`/`search_console_snapshots` | org+project | Real, connected external performance data |

**Not yet a first-class Object Type — real but fragmented (a named gap, not silently unified)**: **Intent**. Today "intent" exists in three real, disconnected places: `Query.intent` (a real closed enum), `Opportunity.targetIntent` (free text), and `entities` rows with `entity_type = 'Intent'` (a convention, not a constraint). Unifying these into one real object type is real, scoped follow-up work — this document names it rather than picking a database migration to make silently.

## 2. Properties

Every Object Type's real columns/JSONB fields are its Properties — nothing new here, this is the existing schema read through the ontology lens. Two property patterns recur across many Object Types and are worth naming as shared behavior (an "Interface," §5):

- **Scored** (`finalScore`/`qualityScore`/`confidence`/`momentum`/etc.) — always `number | null`, never a fabricated 0. This is the existing Known/Estimated/Unavailable discipline (ADR-005/006/029), already real across Opportunity, Page, Decision, Trend, Signal.
- **Timestamped** (`createdAt`/`updatedAt`, real epoch-ms BIGINT columns) — present on every Object Type, already the real substrate `components/home/product-home.tsx`'s production stream sorts by (Phase UX-3).

## 3. Actions

An Action is something the system (or a user) can *do* to or with an object — real, closed, gated, auditable. Three real action systems already exist, each covering a different layer:

1. **DecisionAction** (`lib/intelligence/decisions.ts`) — the 16-value closed taxonomy a Decision proposes: `CREATE_PAGE`, `UPDATE_PAGE`, `MERGE_PAGES`, `REDIRECT_PAGE`, `ADD_INTERNAL_LINKS`, `CREATE_HUB`, `CREATE_DATASET`, `CREATE_CALCULATOR`, `CREATE_COMPARISON`, `CREATE_FAQ`, `REFRESH_CONTENT`, `INVESTIGATE_ENTITY`, `EXPAND_MARKET`, `EXPAND_ROLE`, `MONITOR`, `DO_NOTHING`. Each maps to a real `ActionExecutionPolicy` (`workflow`/`synchronous`/`noop`/`blocked`, `lib/intelligence/action-plan.ts`) — an honest, closed answer to "can this actually be automated," never silently treated as always-yes.
2. **AgentCapability** (`lib/workflow/permissions.ts`) — the real, fail-closed allow-list an `AgentType` may exercise (`crawl_website`, `write_opportunity`, `publish_page_version`, `change_facts`, `delete_tenant_data`, 22 values total). `assertCapability()` denies anything not explicitly granted — this *is* the real backend-owned PolicyEngine the brief's §9 Action framework asks for; it is not being rebuilt, only surfaced.
3. **PolicyDecision** (`lib/intelligence/policy-engine.ts`) — the real, per-attempt gate combining capability + decision-approval + expiry + budget into one `{allowed, reason}` verdict. This is the real "risk/permissions" field the brief's §9 example Action card asks for — already computed, not yet uniformly surfaced per-object in the UI.

**Proposed, not yet real**: a single reusable `Action` UI *component* contract (name/description/object/parameters/risk/permissions/preview/execution-state/result/audit-trail, per §9 of the brief) that renders any of the above three real action systems consistently. This is a UI-architecture concern (see the companion doc's Action UI section) — the underlying real data (`ActionPlan`, `PolicyDecision`, `intelligence_actions` rows as the real audit trail) already exists; only the shared presentation contract is proposed.

## 4. Link Types — real, and honestly fragmented today

Three real, separate edge tables already exist. This is the single most important "Ontology ≠ Knowledge Graph, and also ≠ one unified table today" fact this document needs to be honest about:

| Table | Real since | Edge shape | Covers |
|---|---|---|---|
| `entity_relationships` | 0002 | `source_entity_id → target_entity_id`, `relationship_type` free text | Entity ↔ Entity only (e.g. `LOCATED_IN`, `TARGETS_ROLE`) |
| `opportunity_graph_edges` | 0007 | `opportunity_id → node_type/node_id`, `relation` | Opportunity → anything (signal/trend/query/intent/entity/role/market/evidence/data_observation/business_goal/page) |
| `intelligence_relations` | 0008 | `subject_type/subject_id → node_type/node_id`, `relation` | Decision-layer object (signal/observation/insight/recommendation/decision/action/outcome) → anything |

Plus real, direct FK-based links that never went through an edge table at all: `Opportunity.primaryEntityId → Entity`, `Page.opportunityId → Opportunity`, `PageBrief.opportunityId → Opportunity`, `Page.pageBriefId → PageBrief`, `Trend.entityId → Entity`, `Query.entityId → Entity`.

**Proposed LinkType unification**: a real, generalized `Link` read-model — not a new table, a query-layer abstraction — that presents all of the above (3 edge tables + 6 direct FK relationships) as one consistent `{sourceType, sourceId, targetType, targetId, relation, confidence?}` shape. `lib/intelligence/map.ts#buildGraph()` (Phase 8, ADR-044) already does exactly this kind of unification for its seven graph modes — the proposed `Link` read-model is that same real pattern, generalized and named, not new engineering. See the UI architecture doc's System Graph section.

## 5. Interfaces — proposed, real precedent

An Interface (Palantir's sense: a reusable contract of properties/actions multiple Object Types share) is not physically real in this codebase today, but the *pattern* already is — `OpportunityScoreComponents` (`lib/opportunity/model.ts`) is exactly an interface: any object with a `finalScore`/`confidenceScore`/etc. shape. Proposed interfaces, each grounded in a property set that already recurs:

- **Scoreable** — `score: number | null`, `confidence: number | null`. Already shared in substance by Opportunity, Page, Trend, Decision, Signal.
- **Evidenced** — has real rows in `evidence` or `entity_evidence` as its provenance. Already shared by Opportunity/Insight/Page/Answer/Fact (`evidence.subject_type`) and Entity (`entity_evidence`).
- **Actionable** — has one or more real `ActionPlan`s resolvable against it (currently only Decision, via `resolveActionPlan()`; proposed to generalize to any object with a real action mapping).
- **Timestamped** — `createdAt`/`updatedAt`, universal today.

These are documentation-and-query-layer constructs (shared TypeScript interfaces + shared SQL column conventions), never a schema change — they let the UI architecture doc define one `ScoreBadge`, one `EvidencePanel`, one `ActionButton` component per interface rather than per Object Type.

## 6. Agent relationships

Two real, distinct "agent" concepts exist and must not be conflated in the ontology or the UI:

1. **AgentType** (`WebsiteDiscoveryAgent`, `ContentGenerationAgent`, `PublisherAgent`, `TrendAnalysisAgent`, `AIVisibilityAgent`, `DataIngestionAgent`) — the six real, fixed, code-defined pipeline agents. Each `AgentRun` (`agent_runs`) is one real execution of one `AgentType` against one `WorkflowPipeline` (`website_discovery`/`content_generation`/`trend_analysis`/`decision_execution`), producing real `agent_decision_logs` rows as its audit trail.
2. **Worker** (`workers` table) — a user-configured, buildable, releasable agent blueprint (name/definition/skills/tools), built via the existing Factory/Studio. A Worker is a *product feature* for users who want custom automation; it is org-scoped, not tied to the fixed six `AgentType`s, and runs via `executions`/`outputs` (the pre-Decision-Layer real model, `migrations/0001`).

Real relationships: `AgentRun OPERATES_ON → {Website | Opportunity | Decision}` (via `subject_type`/`subject_id`), `AgentRun PRODUCES → {Opportunity | Page | AgentDecisionLog}` (via real FK chains — e.g. `Opportunity.sourceAgentRunId`), `Worker EXECUTES_AS → Execution → PRODUCES → Output`.

## 7. Page relationships

`Page MATERIALIZES → Opportunity` (`Page.opportunityId`, real, NOT NULL FK) — the one real, always-present link the brief's §19 Page Object asks for. `Page BUILT_FROM → PageBrief` (`Page.pageBriefId`, real NOT NULL FK). `PageBrief TARGETS → Entity` (`primaryEntityId`, nullable) and carries real `market`/`role`/`targetIntent` free-text fields. A Page's real `informationGainScore`/`qualityScore`/`seoScore`/`aeoScore`/`geoScore` are its own Scoreable properties — no separate "citation potential" object exists yet (a real, named gap versus the brief's §19 wishlist).

## 8. Opportunity relationships

`Opportunity TARGETS → Entity` (`primaryEntityId`), `Opportunity DERIVED_FROM → AgentRun` (`sourceAgentRunId`/`sourceExecutionId`/`sourceOutputId` — the real `opportunities_source_check` constraint requires at least one real provenance link, never an orphaned opportunity), `Opportunity CONNECTED_TO → {Signal|Trend|Query|Entity|Role|Market|Evidence|Page}` via the real `opportunity_graph_edges` table (§4), `Opportunity MATERIALIZES_AS → Page` (the inverse of §7, via `Page.opportunityId`). `Opportunity.businessValueScore`/`.confidenceScore`/`.sourceGroundingScore`/`.outlineCompletenessScore` are its real Scoreable properties (some `null` — "Unavailable," not zero — for score components not computed this revision, per `lib/opportunity/model.ts`'s own real doc comments).

## 9. Evidence

Two real, separate evidence tables, each real and honest about what it's not: `entity_evidence` (`fact`/`source_url`/`source_type`/`confidence`/`verification_status`, entity-scoped only) and the newer, general-purpose `evidence` table (`subject_type` in `opportunity|insight|page|answer|recommendation|fact`, `source`/`source_type`/`source_url`/`confidence`/`verification_status`). ADR-029 and risks.md R-32 already name this exact fragmentation as a real, open gap — not new information, restated here because the ontology model depends on it: an "Evidenced" interface (§5) spans both tables today, not one.

## 10. Security

Every real Object Type table carries `org_id` (all) and, except `workers`, `project_id` — the two-level real tenant boundary. `requireSession()` (`lib/session.ts`) is the one real chokepoint: it resolves `{userId, organizationId}` from the real Auth.js session and verifies real org membership (`userBelongsToOrg()`), throwing a 404-shaped error rather than leaking existence of another tenant's data (`docs/architecture` convention, established since Phase 1). Every API route this document's objects are read through already calls `requireSession()` first — this section names the existing real boundary the ontology UI must never bypass, not a new one to build. `AgentCapability`'s fail-closed `assertCapability()` (§3) is the real, second security boundary — a human's org membership does not itself grant an agent write access; capability is asserted "at the exact point of the side-effecting action" (established codebase convention, not new).

## 11. The Ontology Contract

Per the brief's §35, the UI (documented in the companion architecture doc) must eventually be able to answer, for any real object, using only real data named in this document:

| Question | Real answer source |
|---|---|
| What objects exist? | §1's table list, queried tenant-scoped |
| What relationships exist? | §4's three real edge tables + real FK chains |
| What changed? | Real `updatedAt` + the real Intelligence Timeline (`lib/intelligence/timeline.ts`) |
| What actions are possible? | Real `ActionPlan`/`resolveActionPlan()` |
| What actions are running? | Real `agent_runs` where `status` is active |
| What evidence supports this? | §9's two real evidence tables |
| What agent made this decision? | Real `Decision.recommendedAgent` + `agent_decision_logs` |
| What happened after the action? | Real `intelligence_outcomes` (honestly `null`/pending when not yet measurable) |
| What should happen next? | Real `resolveNextAction()` (`lib/intelligence/mission.ts`) |

Every row in this table already has a real answer today — this document's contribution is naming the contract, not building new data to satisfy it.
