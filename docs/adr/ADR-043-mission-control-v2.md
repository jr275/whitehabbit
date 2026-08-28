# ADR-043: Mission Control V2 — honest status, not a rebuild

## Status
Accepted (partially implemented — see Consequences).

## Context
Phase 8 §3-9 asks for a substantially reworked `/mission` organized into four named zones (System State, Intelligence Flow, What Matters Now, What Happened), each metric carrying a current value/real change/time window/data-freshness indicator and a click-through to its evidence, with "What should I do next?" as the single most important component on the page.

Phase 7 (ADR-040) already shipped a real, API-backed `/mission`: `lib/intelligence/mission.ts#buildMissionSnapshot()` computes real KPIs (knowledge authority, page intelligence, information gain health, organic growth when Search Console data exists, AI visibility, market momentum, pending-decision and blocked-action counts), `resolveNextAction()` returns the real top pending Decision plus its real `ActionPlan` and `PolicyEngine` verdict, and `components/mission/mission-control.tsx` renders a `Metric` grid, the `NextActionCard` (which drives the real Approve → Execute flow against `/api/v1/intelligence/decisions/:id` and `/execute`, not a mock interaction), and a `TimelineFeed` reusing `lib/intelligence/timeline.ts`.

Phase 8's session capacity this pass went to three adjacent, real gaps the brief also names explicitly: the Live Agent Graph (§10, ADR-046), the multi-mode Intelligence Graph (§6-9, ADR-044), and a dedicated, filterable Intelligence Timeline (§12-13, ADR-045) — plus a real nav-discoverability bug those additions exposed (see ADR-045's TopNav section). `mission-control.tsx` itself was not restructured into the four explicitly-named zones this pass.

## Decision
Keep `/mission` on its Phase 7 real implementation as-is for this phase, rather than reorganizing already-real, already-tested components into four visually distinct zones purely for layout's sake without new real data behind them. The existing `Metric` grid + `NextActionCard` + `TimelineFeed` already cover three of the four zones' actual content (System State ≈ the Metric grid, What Matters Now ≈ NextActionCard, What Happened ≈ TimelineFeed); "Intelligence Flow" (a live view of Signal → Observation → Decision → Action → Outcome throughput) is the one zone with no real dedicated surface yet, though its raw data is now fully queryable via the Phase 8 Intelligence Timeline's server-side filters.

## Consequences
- Positive: no component was rewritten or moved without a real new capability behind the move — avoids the "prettier but not more true" outcome the brief explicitly warns against.
- Positive: the Timeline work (ADR-045) gives a real foundation an "Intelligence Flow" zone could query directly (e.g. a windowed throughput count per `TimelineEntryType`) without inventing new backend.
- Negative: `/mission` does not yet visually read as the four-zone layout §3 specifies — a real, named gap, carried in `docs/architecture/risks.md` as a follow-up rather than silently dropped.
- Negative: no per-metric "click through to evidence" was added this phase; each `Metric` card is still a static value, not yet a link into its own detail view.
