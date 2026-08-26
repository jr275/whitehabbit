# ADR-006: Opportunity Engine ships before the Page Engine; explainable partial scoring over one opaque score

## Status
Accepted.

## Context
The brief's §17–19 Opportunity Engine and §27–28 Page/Route Template Engine
are both large, and the brief's own §75 development order puts Knowledge
Graph and Opportunity Engine (steps 15–16) before the Page Engine and Agent
System expansion (steps 17–18). The one existing skill that produces
opportunity-shaped output today, `skill_seo_opportunity`, already identifies
real topic opportunities from real web-search sources and already computes a
real, explainable per-run quality evaluation (source grounding %, outline
completeness %) — but that evaluation lives only inside one `outputs` row's
JSON and disappears into the execution history; it is not a queryable,
approvable, first-class Opportunity.

## Decision
This revision builds the Opportunity Engine's persistence and scoring layer
(`opportunities` table, `lib/opportunity/*`) and explicitly defers the Page
Engine (RouteTemplate, PageTemplate, Next.js `/[...slug]` rendering) to the
next phase. An Opportunity with no page-generation target yet is still a
real, useful artifact: it's the thing a human approves or rejects, and the
brief itself insists generation must never happen without one (§19: "If
Information Gain is below threshold: DO NOT GENERATE").

Scoring follows the brief's §18 explainability requirement literally: each
score component is a named, independently-visible 0–100 number (or `NULL` —
see ADR-005) rather than one opaque AI-produced score. This revision computes
exactly the components for which real signal exists today:
- `source_grounding_score` — % of identified opportunities that cite a real
  search source (from the skill's own `SkillEvaluation.breakdown`).
- `outline_completeness_score` — % with a full (≥3-section) outline.
- `confidence_score` — the LLM's own stated confidence for that specific
  opportunity (0–100, not the run-level average).

`demand_score`, `trend_score`, `business_value_score`, `competition_score`,
`authority_gap_score`, `information_gain_score`, `citation_potential`,
`cannibalization_risk` are schema-ready columns, all `NULL` until Search
Console (§32), a trend data source (§31), and a real Information Gain
service (§19) exist to compute them for real — see
`docs/architecture/risks.md` R-7. `final_score` is a documented weighted
average of only the non-`NULL` components, explicitly labeled (in the API
response) as a **partial/preliminary score**, never presented as the
brief's full multi-signal score before the data exists to back it.

## Consequences
- Positive: matches the brief's explicit preference — "1,000 exceptional
  pages over 100,000 thin pages," enforced structurally by requiring a
  scored, approved Opportunity before any generation step can exist, rather
  than generation code being written first with scoring bolted on after.
- Positive: the weighting function (`lib/opportunity/scoring.ts`) is one
  small, pure, testable module — adding a real `demand_score` later (once
  Search Console lands) is "compute the number, stop returning NULL," not a
  scoring-engine redesign.
- Negative: `final_score` is not comparable across opportunities scored
  before vs. after a new component comes online (adding `demand_score` to
  the weighted average changes what "80" means). Mitigated by storing the
  raw components (never discarded) and documenting the weight version in
  code; a future migration can recompute historical `final_score` values if
  that comparability is ever needed.
