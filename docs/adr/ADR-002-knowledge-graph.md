# ADR-002: Knowledge Graph as relational tables in PostgreSQL, not a graph database

## Status
Accepted.

## Context
The brief is explicit: "PostgreSQL is the initial source of truth. Do NOT
introduce Neo4j simply because the project contains the word 'graph.'"
This application has no graph database dependency and no existing traversal
workload that would justify one.

## Decision
Model the Knowledge Graph as three relational tables, all tenant- and
project-scoped, introduced in this revision (`migrations/0002_knowledge_graph.sql`):

- `entities` — `id, org_id, project_id, entity_type (free text, not a fixed
  enum — the ontology is tenant/vertical-specific per the brief's §3
  generalization requirement), name, canonical_entity_id (self-FK, null
  until a merge — see the Entity Resolution note below), attributes JSONB,
  created_at, updated_at`.
- `entity_relationships` — `id, org_id, project_id, source_entity_id,
  target_entity_id, relationship_type, weight, confidence, source,
  valid_from, valid_to, created_at` — first-class rows, never inferred at
  query time, per the brief's §11 requirement.
- `entity_evidence` — provenance per fact (§13): `entity_id, fact,
  source_url, source_type, retrieved_at, confidence, verification_status
  ∈ {verified, unverified, conflicting, stale, deprecated}`.

Entity Resolution (§12: candidate → review/threshold → merge, never silent)
is explicitly **not** implemented in this revision beyond the schema's
`canonical_entity_id` column existing to support it later. Today's only
entity-creation path (SEO Opportunity ingestion, see ADR-014) does a simple
exact-name-plus-type dedupe within a project — good enough for a single
ingestion source, not a real resolution pipeline. Building
`EntityResolutionAgent` before there is a second entity source that could
actually conflict would be speculative work; tracked in
`docs/architecture/risks.md` R-4.

## Consequences
- Positive: joins, indexes, and transactions "just work" with the same
  Postgres the rest of the app already runs on; no new operational
  dependency, no new backup/HA story, no new client library.
- Positive: `entity_relationships` being real rows (not derived) makes every
  downstream consumer — internal linking (§36), opportunity → entity
  attachment — auditable and independently queryable.
- Negative: deep multi-hop graph traversal (e.g. "all entities within 3 hops
  of X") is recursive-CTE territory, not a native graph query language.
  Acceptable at current and near-term scale; revisit only if a real product
  feature needs traversal depth/performance Postgres can't give (brief's own
  instruction: don't adopt Neo4j pre-emptively).
- Negative: no vector/embedding column yet on `entities` — semantic
  entity search is out of scope for this revision (see ADR-009).
