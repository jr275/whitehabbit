# ADR-013: Analytics stays split by kind, matching the brief's own §64 taxonomy

## Status
Accepted.

## Context
The brief separates operational analytics (jobs/agents/errors/queues) from
growth analytics (impressions/clicks/CTR/ranking/AI visibility) from
knowledge analytics (entities/relationships/information gain/coverage). The
existing app already has real operational analytics: `metrics` (kind ∈
operational|quality|cost|business), `execution_events`, and
`lib/insights/*` (`insights-data.ts`, `marketing-command-data.ts`) surfacing
them. It has no growth analytics (no Search Console/rank data exists to
report — §32 is not built) and, until this revision, no knowledge analytics
(no entities existed to have coverage/freshness stats about).

## Decision
Keep the three kinds structurally distinct rather than merging them into one
generic "analytics" table/dashboard, per the brief. This revision's
Knowledge Graph and Opportunity tables are the first real data for the
"knowledge" bucket — a coverage/freshness view (entity count by type,
evidence recency, opportunity funnel by status) is a natural near-term
addition once there's more than one ingestion path feeding `entities`, but
is not built in this revision (see `docs/architecture/roadmap.md` — it is
UI, and this revision is scoped to persistence + API, per
`docs/architecture/vertical-slice.md`).

## Consequences
- Positive: no premature unification of fundamentally different data
  shapes (a click-through rate and an entity's evidence count are not the
  same kind of number and should never share a table/normalization scheme).
- Negative: growth analytics remains entirely unbuilt until Search Console
  integration (§32) exists — named in `docs/architecture/risks.md`, not
  implied to exist by this ADR's structure.
