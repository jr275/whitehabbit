# Domain Model

Companion to `ARCHITECTURE.md`. Two layers per concept: **Implemented**
(real table/type, shipped) and **Target** (brief's full shape, not yet
built). Vocabulary mapping between this codebase's existing names and the
brief's names is called out inline — see `ARCHITECTURE.md` §1 for why the
mapping exists instead of a rename.

## Tenancy

| Concept | Implemented | Target (brief) |
|---|---|---|
| Tenant | `organizations` (id, name, created_at) | Tenant |
| Membership | `memberships` (user_id, org_id, role: owner\|member) | Membership with granular capabilities, roles OWNER/ADMIN/EDITOR/ANALYST/AGENT_OPERATOR/VIEWER |
| Project | **new**: `projects` (id, org_id, name, primary_domain, created_at, created_by) — one connected website per row | Project + Environment |
| User | `users` (id, email, password_hash, created_at) | TenantUser |

`getOrCreateDefaultProject(orgId)` (new, `lib/projects/repo.ts`) lazily
creates one "Default Project" per org so existing Worker/Product flows keep
working unmodified while the schema is ready for real multi-project
onboarding (§9) later — see `docs/architecture/risks.md` R-12.

## Agents (brief's Agent Orchestration, §22–25)

| Concept | Implemented | Target |
|---|---|---|
| AgentDefinition | `workers` (definition JSONB: identity/mission/skills/tools/behaviors/channels/outcome) | AgentDefinition |
| AgentVersion | `worker_versions` (immutable, fingerprinted, build→release→archive) | AgentVersion |
| AgentRun | `executions` (status, reason_code, cost_usd, tokens, model, execution_mode) | AgentRun |
| AgentStep | `execution_events` (sequenced, durable, typed payload) | AgentStep |
| AgentArtifact | `outputs` (structured + summary + sources + evaluation) | AgentArtifact |
| AgentApproval | `ApprovalRequiredError` → execution status `pending_approval` (no dedicated table — state lives on `executions`) | AgentApproval |
| Skill (capability) | `lib/agent/skills/*` — one skill = one LLM call + tools + real evaluation | one stage of a multi-agent Content Factory pipeline |
| Tool | `lib/agent/tools/*` with `ToolPermission`/`RiskLevel` | Agent tool contract |

## Knowledge Graph (new this revision — brief §11–13)

| Table | Columns | Notes |
|---|---|---|
| `entities` | id, org_id, project_id, entity_type, name, canonical_entity_id, attributes JSONB, created_at, updated_at | `entity_type` is free text — no fixed enum, per brief §3's vertical-independence requirement |
| `entity_relationships` | id, org_id, project_id, source_entity_id, target_entity_id, relationship_type, weight, confidence, source, valid_from, valid_to, created_at | first-class rows, never inferred |
| `entity_evidence` | id, org_id, project_id, entity_id, fact, source_url, source_type, retrieved_at, confidence, verification_status, created_at | verification_status ∈ verified\|unverified\|conflicting\|stale\|deprecated |

Not implemented: EntityResolutionAgent / merge workflow beyond exact-match
dedupe (ADR-002); vector embeddings on entities (ADR-009); Role/Market/Intent
as their own entity types with dedicated tables — for now they are
representable as `entities` rows with `entity_type = 'Role' | 'Market' |
'Intent'`, which is intentionally how the generic ontology is meant to work
(brief §3/§14–16), not a placeholder.

## Opportunity Engine (new this revision — brief §17–19)

| Table | Columns |
|---|---|
| `opportunities` | id, org_id, project_id, source_execution_id, source_output_id, primary_entity_id, title, topic, target_intent, outline JSONB, status, source_grounding_score, outline_completeness_score, confidence_score, demand_score, trend_score, business_value_score, competition_score, authority_gap_score, information_gain_score, citation_potential_score, cannibalization_risk_score, final_score, score_notes, reviewed_by, reviewed_at, created_at, updated_at |

`status` ∈ `discovered | approved | rejected` in this revision (the brief's
fuller `qualified/generating/published/monitoring/stale/merged` states are
schema-compatible text values, added when the workflow steps that produce
them — QA, generation, publishing — exist; adding unused enum values now
would be exactly the "TODO-driven architecture" the brief prohibits).

Score columns ending `_score` are `NULL` unless a real computation backs
them (ADR-005, ADR-006, ADR-015) — only `source_grounding_score`,
`outline_completeness_score`, and `confidence_score` are populated by this
revision's ingestion path; the rest are reserved columns, not placeholders.

## Implemented since this section was first written (kept here so the
history stays legible — see each ADR for the real decision)

Page / PageVersion / ContentBlock (§26–28, ADR-016), RouteTemplate (§27,
classification-only — ADR-016 amendment, `route_templates`), TenantDomain
(§57, ADR-018, `domains`/`domain_verifications` — supersedes ADR-010's
original deferral), Trend/TrendSignal (§31, ADR-026, `trends`), Search
Console warehouse (§32, ADR-025, `search_console_*`), AI Visibility (§33,
ADR-028, `ai_prompts`/`ai_runs`/`ai_answers`/`ai_citations`), DataSource/
Dataset (§20, ADR-024, `data_sources`/`datasets`/`dataset_versions`/
`data_observations`), Role/Market as dedicated first-class tables (§14–15,
ADR-024, `roles`/`markets`/`metric_definitions`/`metric_observations`).

## Intelligence Decision Layer (Phase 6, brief's OBSERVE→DECIDE→ACT→LEARN loop — ADR-031..037)

| Table | Columns | Notes |
|---|---|---|
| `intelligence_observations` | id, org_id, project_id, pattern, summary, signal_ids JSONB, confidence, status, source, correlation_key, created_at, updated_at, expires_at | the real Correlation Engine's output — a deterministic rule match over ≥1 real Signal rows, never itself a fact. `correlation_key` (`entity:<id>` \| `page:<id>` \| `market:<id>` \| `signal:<id>`, `migrations/0009`) is how the Decision Engine resolves a real subject without guessing. |
| `intelligence_decisions` | id, org_id, project_id, action (16-value closed CHECK), subject_type, subject_id, reason, evidence_ids JSONB, expected_impact, estimated_cost JSONB, risk, confidence, priority, recommended_agent, required_approval, status, decided_by, decided_at, expires_at, created_at, updated_at | a real, explainable choice — every row states its own reason/evidence/cost/risk/confidence; "AI decided this" is never acceptable anywhere in this codebase. |
| `intelligence_actions` | id, org_id, project_id, decision_id, agent_run_id, status, output JSONB, started_at, completed_at, created_at | deliberately references a real `agent_runs` row — never a second, parallel run-tracking table. |
| `intelligence_outcomes` | id, org_id, project_id, action_id, metric, baseline, value, delta, confidence, evidence JSONB, measured_at, created_at | `delta` always server-computed (`value - baseline`), never client-supplied; `null` when no real baseline exists yet. |
| `intelligence_relations` | id, org_id, subject_type, subject_id, node_type, node_id, relation, created_at | a NEW, generic cross-object graph edge, deliberately kept separate from the existing `opportunity_graph_edges` (ADR-031) — no `project_id` column yet (risks.md R-38). |
| `agent_decision_logs` | id, org_id, agent_run_id, agent, decision, reason, evidence JSONB, policy, confidence, risk, approval_required, approved_by, created_at | real, append-only — the tactical "why did the agent do X right now" audit trail, distinct from the strategic `intelligence_decisions`. |
| `score_calibrations` | id, org_id, project_id, model (closed union), subject_type, subject_id, predicted_value, actual_value, delta, outcome_id, computed_at | real predicted-vs-actual bookkeeping — infrastructure for future model training, not itself machine learning (ADR-034). |
| `intelligence_event_queue` | id, org_id, project_id, event_type, subject_id, status, attempts, last_error, created_at, processed_at | durable companion to the real `pg_notify` trigger (`migrations/0010`) — guarantees every real invalidating change is eventually processed, never silently lost to a disconnected listener (ADR-033). |

`Insight` (id, org_id, project_id, title, summary, category, confidence,
signal_ids, created_at — `insights` table, Phase 5B) now has a real API
surface (`GET/POST /api/v1/intelligence/insights`, ADR-036) but is not yet
populated by any real detector — honestly empty until one exists, never
seeded with fabricated rows to look active.

## Decision → Action bridge additions (Phase 7, ADR-038)

`intelligence_actions` (migrations/0008, extended by `migrations/0011`)
gains a real `'blocked'` status (distinct from `'failed'` — a categorical
"never even attempted" outcome), a `blocked_reason` column, and a
`retry_of_action_id` self-reference (a real retry creates a new, linked
row rather than mutating the terminal one it retries — full lineage
preserved). A real, DB-enforced partial unique index on
`(decision_id)` for active statuses (`queued`/`running`/`succeeded`/
`blocked`) is the actual idempotency guard — the same pattern
`agent_runs.idempotency_key`'s own unique index already established.

`WorkflowPipeline` (`lib/workflow/types.ts`) gains a fourth real value,
`"decision_execution"` — the same real-but-synchronous-provenance-run
pattern `"trend_analysis"` already established, used only so a
Decision-driven `Opportunity` has a real `source_agent_run_id` to satisfy
`opportunities`' own CHECK constraint. `WorkflowSubjectType` gains
`"decision"` to match. Neither is ever enqueued/dequeued through the real
step-job queue.

`AgentCapability` (`lib/workflow/permissions.ts`) gains two real,
narrowly-scoped capabilities for the two new synchronous execution paths:
`write_internal_links` (granted to `PublisherAgent`) and `run_research`
(granted to `WebsiteDiscoveryAgent`) — never a parallel permission system.

Neither `ActionPlan` (`lib/intelligence/action-plan.ts`) nor
`PolicyDecision` (`lib/intelligence/policy-engine.ts`) is a persisted
table — both are real, freshly-resolved-on-every-call structures derived
from a Decision's own current fields plus (for `ActionPlan`) one real
lookup when the subject is an existing page, so neither can ever go stale
relative to the real data it describes.

## Intelligence Graph / Timeline UI additions (Phase 8, ADR-044/045)

No new persisted table or column. `GraphMode` (`lib/intelligence/map.ts`)
and `TimelineFilters` (`lib/intelligence/timeline.ts`) are both real,
freshly-resolved-on-every-call query shapes over already-persisted rows —
same non-stale-by-construction pattern as `ActionPlan`/`PolicyDecision`
above. `MapNode`/`MapEdge` is one shared output shape across all seven
`GraphMode`s (never seven separate node/edge types); a node's `id` is
always `"<type>:<realId>"`, the convention the Intelligence Graph UI's
click-through Inspector relies on to look the real record back up.

## Not yet modeled at all

CommunitySignal (§21 — no real community-source integration exists),
Hub/Spoke/Cluster (§37), Webhook delivery (§41), domain-events/outbox
(§43–44, see ADR-004), MetricSeries as a stored table (§19 — it is a real
query over `metric_observations`, not a separate table; see ADR-024),
a unified Evidence view spanning `entity_evidence` and the newer generic
`evidence` table (see ADR-029, risks.md R-32).
