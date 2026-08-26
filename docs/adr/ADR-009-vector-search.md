# ADR-009: Defer pgvector until a real semantic-search consumer exists

## Status
Accepted (deferred, not rejected).

## Context
The brief specifies pgvector for semantic/hybrid search over entities and
content (§51), with strict tenant isolation on every vector row. No feature
in this revision or the current application does semantic retrieval — the
one retrieval mechanism that exists, `lib/agent/knowledge.ts`'s
`retrieveRelevantKnowledge()`, is a real but simple text-matching function
over a Worker's own small `knowledge[]` array (onboarding-derived Domain
Profile text plus accumulated memory notes), not a vector index over a large
corpus.

## Decision
Do not add the `pgvector` extension or an `embeddings` table in this
revision. Add it when a real consumer needs it — the most likely first
trigger is RAG-grounded content generation once the Content Factory
(ADR-003 follow-on) exists and needs to retrieve entities/facts/content
blocks at generation time (§52), or semantic entity search once the
Knowledge Graph (ADR-002) has enough real entities that name-based lookup
stops being sufficient.

When built: one `embeddings` table, `(tenant_id, entity_id/page_id,
embedding_model, embedding_version, content_hash, embedding vector(n))`, per
the brief's §51 requirement that vectors never mix across tenants or across
embedding model/version — enforced the same way every other tenant-owned
table is today (explicit `org_id` column, filtered in every query).

## Consequences
- Positive: no unused extension, index-maintenance cost, or embedding-
  provider integration exists before there's a feature to justify it.
- Negative: `lib/knowledge`'s current entity dedupe (ADR-002, ADR-014) is
  exact-match-only (name + type) — it will produce more duplicate/near-
  duplicate entities than a semantic match would once real crawled content
  starts flowing in. Accepted for this revision's scope (a single ingestion
  source, low volume); tracked as R-4 alongside Entity Resolution.
