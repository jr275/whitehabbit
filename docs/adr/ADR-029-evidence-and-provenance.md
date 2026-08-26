# ADR-029: A second Evidence table for non-entity subjects, not a migration of entity_evidence

## Status
Accepted.

## Context
`entity_evidence` (Phase 2, `migrations/0002`) already gives real, entity-scoped facts a provenance discipline (`source_url`, `source_type`, `retrieved_at`, `confidence`, `verification_status`). Phase 5B's brief asks for Evidence attached to Insight, Opportunity, Page, Answer, and Recommendation too — subjects `entity_evidence`'s schema (`entity_id NOT NULL REFERENCES entities(id)`) cannot represent.

## Decision
Add a second table, `evidence` (`migrations/0007`), polymorphic via `(subject_type, subject_id)` rather than a typed FK per subject — the same soft-reference pattern already used elsewhere in this codebase (`opportunities.primary_entity_id`, `signals`' entity/market/role/intent columns). `entity_evidence` is **not** migrated into it: entity-attached facts stay exactly where they are, with their existing real FK to `entities(id)` and every call site (`lib/knowledge/repo.ts#listEvidenceForEntity`, the Research Agent, Deep Research Agent) unchanged.

This was a deliberate choice between two real options:
1. Migrate everything into one polymorphic `evidence` table, losing `entity_evidence`'s real FK-enforced referential integrity for the majority (entity) case, for the sake of schema uniformity.
2. Keep two tables — `entity_evidence` for the common, FK-safe entity case; `evidence` for everything else — accepting that "evidence" is genuinely represented two ways in this schema.

Option 2 was chosen: the entity case is both the most common and the one where real referential integrity (a `entity_evidence` row can never outlive its entity, enforced by `ON DELETE CASCADE`) matters most; the generic case's subjects (an Opportunity, a Page, an AI Answer) are heterogeneous enough that a single typed FK column per subject type would mean a wide, mostly-null table anyway.

## Consequences
- Positive: zero migration risk to the already-working, already-tested entity evidence path.
- Positive: `lib/intelligence/evidence.ts` is a clean, minimal addition — no existing code touched.
- Negative: "evidence" as a concept is genuinely split across two tables — a caller wanting ALL evidence connected to a given entity, including evidence attached to opportunities ABOUT that entity, must query both `entity_evidence` (direct) and `evidence` (indirect, via the opportunity's own `primary_entity_id`). No single unified query exists for this in the current revision; named here so it is not mistaken for an oversight.
- Negative: the two tables' `verification_status` enums are defined identically but separately (`entity_evidence`'s original CHECK constraint and `evidence`'s new one) — a future change to one's allowed values must be manually mirrored to the other if consistency is desired.
