# ADR-041: Intelligence Timeline — real integration into Mission Control, real gaps named

## Status
Accepted.

## Context
The Phase 6 Intelligence Timeline (`lib/intelligence/timeline.ts`, `GET /api/v1/intelligence/timeline`) already existed as a real, tested API — a chronological merge of Signal/Observation/Decision/Action/Outcome — but had never been rendered anywhere; nothing consumed it. Phase 7's brief asks for the timeline to be part of the actual product experience: "09:42 Trend detected → … → 7 days later: Organic impressions +38%."

## Decision
Mission Control (ADR-040) renders the real timeline feed unmodified — `TimelineFeed` in `components/mission/mission-control.tsx` fetches the same `GET /api/v1/intelligence/timeline` endpoint Phase 6 shipped and lists the most recent real entries with their real type, summary, and timestamp. No new timeline logic was added; this is real integration of already-real data, not a rebuild.

Two real gaps, named rather than papered over:

1. **No real-time push.** The feed loads once, on page mount — it does not subscribe to the existing `intelligence_events` `pg_notify` channel (ADR-033) the way `/api/v1/workflows/:id/events` already does for a single workflow run. A tenant-wide live intelligence stream (every Signal/Decision/Action/Outcome across a project, not just one run) is real, distinct follow-up work — the existing SSE pattern is a real precedent to extend, but extending it to a whole-project stream (not just one subject) needs its own design pass on fan-out and connection budget (risks.md R-21 already names the per-connection cost of the current pattern).
2. **No real outcome-narrative synthesis.** The brief's example ("7 days later: Organic impressions +38%, AI citations +12%") implies comparing an Outcome's real `delta` against the Decision/Action that produced it, presented as a connected story. `buildIntelligenceTimeline()` already includes real Outcome entries with their real `delta` field — the raw data exists — but nothing yet threads "this Outcome resulted from that Action which came from that Decision" into a single narrative view; today a viewer reconstructs that chain by reading each entry's own `detail` fields (`decisionId`/`actionId`) across separate rows. A real, deterministic "outcome story" builder (never LLM-narrated — this system's whole discipline is against letting a model narrate causality it didn't itself compute) is real follow-up work.

## Consequences
- Positive: the timeline is no longer a real-but-unused API — it's part of the real product experience for the first time, with zero new backend risk (the endpoint was already tested in Phase 6).
- Positive: both real gaps are gaps in *presentation*, not in the underlying data — every field a richer view would need (Decision→Action→Outcome linkage, real deltas) already exists and is already tested.
- Negative: a user watching Mission Control today must refresh to see new timeline entries — not the "real-time" feel the brief's Mission Control vision describes.
