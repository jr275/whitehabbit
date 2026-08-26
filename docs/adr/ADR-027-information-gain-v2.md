# ADR-027: Information Gain V2 as an additive, on-demand layer — v1 stays the fast discovery-time default

## Status
Accepted.

## Context
The Phase 3 Information Gain model (`lib/opportunity/information-gain.ts`, amending ADR-015) is a real, deterministic, tested score computed at discovery time for every candidate opportunity (up to 20 per run). The Phase 5B brief asks for a richer model with twelve named components (Original Data, Local Specificity, Freshness, Evidence Quality, Entity Depth, Market Depth, Role Specificity, Unique Calculation, Unique Comparison, Proprietary Data, First-party Data, Research Depth) and a real Information Gain Gate blocking page creation below threshold.

Several of the new components need data that didn't exist before this phase (Market Depth needs real `metric_observations`; Research Depth needs a real Deep Research Agent artifact; Freshness needs `evidence.retrievedAt`). Computing all twelve for every discovery-time candidate would mean running a Deep Research pass (itself several real queries) for every one of up to 20 opportunities per discovery run — a real, unnecessary cost increase to the fast path that already works and is tested.

## Decision
Keep v1 as the default, fast, discovery-time score (`lib/opportunity/discovery.ts`'s call site unchanged). Add v2 (`lib/opportunity/information-gain-v2.ts`) as a richer, on-demand model:
- Each of the twelve components is independently `known` (a real number, 0-100) or `unavailable` (with a real, specific reason) — never a fabricated number for a component with no real data behind it.
- The overall score is the average of only the `known` components — a project with several `unavailable` dimensions is scored fairly on what it does have, not penalized to zero for what it doesn't (yet).
- `lib/opportunity/information-gain-v2-input.ts` assembles the real inputs from the Knowledge Graph, the generic `evidence` table, the Opportunity Graph, and a real Deep Research Agent run (`lib/intelligence/deep-research.ts`) — computed fresh on each call, not cached, since a caller invoking this endpoint wants the current picture.
- `GET /api/v1/opportunities/:id/information-gain` exposes v2 plus the real Gate decision (ADR §24: CREATE / MERGE / ENRICH / WAIT / RESEARCH / CREATE_DATA_ASSET) for a human or agent wanting a deeper look before committing to generate a page.

## Consequences
- Positive: no regression risk to the already-tested discovery pipeline — v1's call site and behavior are completely unchanged.
- Positive: v2 is genuinely richer and fully explainable (`components`, `evidence`, `missingRequirements`, `recommendations` in the response) — `tests/integration/intelligence-layer.test.ts` proves the gate names a real reason and a real recommended action for a low score, and specifically recommends MERGE when an equivalent page already exists.
- Negative: v1 and v2 can disagree (a project might score well on v1's simpler five inputs but poorly on v2's twelve, or vice versa) — this is accepted as an honest reflection of two real but different models, not resolved by picking a "winner" in this revision. `opportunities.informationGainScore` (v1) remains the field the Quality Gate and autonomy policy actually check.
- Negative: v2 is not yet wired into the actual page-generation blocking path — it exists and is real, but a low v2 score today only shows up if someone calls the endpoint; it doesn't (yet) stop `POST /api/opportunities/:id/generate`. Wiring the v2 gate into that path is real, named future work once v1's existing gate (already part of the Quality Gate, §Information Gain check) is confirmed insufficient in practice.
