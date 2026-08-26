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

## Not yet modeled at all

Page / PageVersion / ContentBlock (§26–28), RouteTemplate (§27), Trend/
TrendSignal (§31), Search Console warehouse (§32), AI Visibility (§33),
DataSource/Dataset (§20), CommunitySignal (§21), Role/Market as dedicated
first-class tables beyond generic `entities` rows (§14–15), Hub/Spoke/
Cluster (§37), Webhook delivery (§41), domain-events/outbox (§43–44, see
ADR-004), TenantDomain (§57, see ADR-010).
