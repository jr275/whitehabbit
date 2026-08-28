# ADR-045: Intelligence Timeline — dedicated, server-filtered page

## Status
Accepted.

## Context
ADR-041 (Phase 7) integrated `lib/intelligence/timeline.ts#buildIntelligenceTimeline()` into Mission Control's feed, but only as an 8-entry preview with no filtering. Phase 8 §12-13 asks for a dedicated `/intelligence/timeline` with filters (event type, entity, date range, search among others) and explicitly warns against "naive client-side [filtering] over unlimited data."

## Decision
Extended `buildIntelligenceTimeline()` to accept a `TimelineFilters` object (`types`, `entityId`, `since`, `until`, `search`, `limit`) instead of only a bare limit, kept backward-compatible via an overload so the existing Mission Control call site needed no change. A type left out of `filters.types` is never queried at all — `listSignals`/`listObservations`/`listDecisions`/`listActions`/`listOutcomes` are only called for the types actually requested, not fetched-then-discarded. Date-range and search filtering happen after the five-way merge (unavoidable — these are heterogeneous rows from five different tables, and a single SQL query across all of them isn't how the rest of this timeline is built, per ADR-032's original design), but the per-kind fetch window is real and bounded (300-row cap) at every step; nothing sends the client the org's full event history to filter in the browser.

`GET /api/v1/intelligence/timeline` gained `types`/`entityId`/`q`/`since`/`until` query params, all forwarded to the lib filter. `components/mission/intelligence-timeline.tsx` (new page at `/intelligence/timeline`) renders type-toggle pills, a search box, and date-range inputs, all driving real query params — day-grouped entries linked out to their real underlying record (Decision Center for decisions, the existing `/agent-runs/:id` inspector for actions with a real `agentRunId`) rather than synthetic narrative text.

A real, unplanned bug surfaced during this work's visual QA pass rather than at typecheck: adding this page's nav link pushed TopNav's desktop link count to 19, silently scrolling the two newest links (Intelligence Graph, this Timeline page) off the visible 1440px viewport with no scroll affordance — the shipped page was itself undiscoverable. Rather than re-padding the same flat row again, TopNav's desktop navigation was restructured into five grouped dropdowns (Workspace/Knowledge/Build/Connect/Observe), each a real disclosure menu (`aria-haspopup`/`aria-expanded`, `role="menu"`, closes on outside click or Escape) — a fix that holds regardless of how many more links future phases add, rather than a one-off overflow patch.

## Consequences
- Positive: filters are real and server-applied; adding a sixth filter dimension later is an extension of the same `TimelineFilters` interface, not a new endpoint.
- Positive: the nav restructure is a real, general improvement, not scoped narrowly to this one page — every existing nav link (Mission Control, Decision Center, Live Agent Graph, etc.) benefits from the same fix.
- Negative: cross-kind search and date filtering are still in-process (post-merge) rather than pushed into five separate SQL `WHERE` clauses — correct and bounded at today's real data volumes, but a true win at the brief's target scale (10k+ decisions) would need either a real unified event-log table or per-kind SQL-level filtering, neither of which exists yet. Named here rather than silently accepted as "done."
