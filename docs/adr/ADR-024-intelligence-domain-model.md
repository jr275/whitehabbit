# ADR-024: A first-class Intelligence domain model — Signal, Evidence, Insight, Trend, Intent, Query, Recommendation, never collapsed into Opportunity

## Status
Accepted.

## Context
Through Phase 4, "Opportunity" was the only first-class artifact between raw crawl/evidence data and a generated page. Phase 5B's brief requires the system to observe real-world change (Search Console, trends, external data, AI visibility) and reason about it in stages — a raw observation is not automatically a fact, a fact is not automatically an opportunity, and an opportunity is not automatically worth acting on. Collapsing all of this into `Opportunity` would either bloat that table with fields meaningful only sometimes, or force premature, unearned certainty onto data that is still just an observation.

## Decision
Introduce genuinely distinct tables/types for each stage of the brief's OBSERVE→UNDERSTAND→DISCOVER→SCORE→DECIDE loop:

- **Signal** — raw observed information, always confidence-scored and sourced, never automatically a fact.
- **Evidence** (generic, `migrations/0007`) — provenance for artifacts beyond Entity, which already had `entity_evidence` (Phase 2). See ADR-029 for why these stay two tables.
- **Insight** — a real, evidence-backed conclusion (references real `signal_ids`), a stage between a Signal and an Opportunity.
- **Trend** — a real, thresholded movement over time-series signals (ADR-026).
- **Query/Intent** — a real observed or candidate search query, deterministically intent-classified.
- **Recommendation** (ADR-030) — a real, actionable suggestion distinct from an Opportunity (a Recommendation can be "refresh this page," which is not a new page at all).

Every new table is tenant-scoped (`org_id`, mostly `project_id` too) and follows the same soft-reference pattern `opportunities.primary_entity_id` already established (a nullable text column, validated at the application layer, not a hard FK to every possible referent) where a genuine hard FK isn't warranted.

## Consequences
- Positive: each concept can evolve its own real confidence/verification discipline without warping Opportunity's schema. `tests/integration/intelligence-layer.test.ts` exercises each stage independently.
- Positive: the Opportunity Graph (ADR-024's own §25, `opportunity_graph_edges`) can express "this opportunity came from this trend, which came from these signals" as real graph edges rather than a growing set of nullable FK columns on `opportunities` itself.
- Negative: more tables to reason about and keep tenant-isolated — mitigated by the same adversarial-testing discipline every prior phase used (`tests/security/phase5b-tenant-isolation.test.ts`).
- Negative: some of these concepts (Signal, Evidence) will only be genuinely populated once real external integrations (Search Console, AI Visibility, external data connectors) are actually configured for a tenant — until then they are honestly empty, never seeded with fabricated rows to look populated.
