# ADR-030: Recommendation Engine — real deterministic rules over real data, generated opportunistically

## Status
Accepted.

## Context
The brief asks for a Recommendation Engine that surfaces real, actionable suggestions ("refresh this page," "investigate this rising query") with a real reason/evidence/expected-impact/confidence/priority — explicitly not an LLM asked to invent a suggestion, since a fabricated recommendation with no real evidence behind it would be actively harmful (misdirecting a tenant's real effort).

## Decision
`lib/intelligence/recommendations.ts#generateRecommendations()` is a real, deterministic rule pass over already-persisted data:
1. **Stale + trending page → `refresh_page`**: a published page not updated in 90+ real days, while a real `rising`/`breaking` Trend is active in the same project — both the staleness and the trend are real, queried facts, and the recommendation's `evidenceIds` names the real Trend row.
2. **Stale dataset → `create_data_asset`**: a real `stale_data` Signal (from `lib/intelligence/data-freshness.ts`'s real freshness-policy check) becomes a real recommendation naming the actual stale dataset.
3. **Emerging query with no page → `investigate_query`**: a real `query_emergence` Signal (from Search Console signal detection) with no existing page targeting it.

Each rule checks for an already-open recommendation for the same real subject before creating a new one (a real `SELECT ... WHERE status = 'open'` guard, not an in-memory dedup) — re-running the generator (e.g., on a schedule) never produces duplicate open recommendations for the same underlying condition. This exact guard caught a real bug during implementation: an early version compared the dedup check against the *signal's* id while persisting the *data source's* id as `subject_id`, so the check never matched and every re-scan created a fresh duplicate — fixed and covered by a regression test (`tests/integration/intelligence-layer.test.ts`'s "never duplicates" case).

No scheduling infrastructure of its own — `generateRecommendations()` is called opportunistically (via `POST /api/v1/recommendations`), the same pattern `lib/workflow/approval.ts`'s `expireOverdueApprovals()` already established.

## Consequences
- Positive: every recommendation is traceable to real, named evidence — `evidenceIds` always points at a real row (a Trend, a Signal), never empty for a rule that claims to have evidence.
- Positive: the dedup-by-real-subject-id discipline means this can be called repeatedly (e.g., from a UI "refresh recommendations" button) without flooding a tenant's recommendation list with duplicates.
- Negative: only three rules exist in this revision (refresh_page, create_data_asset, investigate_query) — the brief's full example list (build_calculator, merge_pages, add_entity_relationship) needs real triggering signals this revision doesn't yet compute (e.g., a real duplicate-content/cannibalization detector for merge_pages) — named as real future work, not stubbed out with fake logic.
- Negative: `refresh_page`'s "related trend" selection (`activeTrends[0]`) is a best-effort "any active trend in the project," not yet a real per-page topical match to the specific trend most relevant to that page's content — a reasonable v1 simplification, revisit once trend volume is high enough that this matters.
