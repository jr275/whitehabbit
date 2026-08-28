# ADR-033: Outcomes as real, measured results, and a two-tier real-time event design

## Status
Accepted.

## Context
A Decision approved and executed into a real Action needs a real, honest way to record what actually happened — never a guessed "it probably worked." And the system needs to know, in near-real-time, when something worth reacting to changed (a Search Console import, a trend update, a page publishing) — but a naive "NOTIFY and hope something is listening" design silently loses events, which this system's whole discipline (Known/Estimated/Unavailable, never fabricate) forbids doing to real signal.

## Decision
1. **`intelligence_outcomes`** (`lib/intelligence/outcomes.ts`) — `recordOutcome()` always computes `delta = value - baseline` server-side when a real baseline is provided, `null` otherwise — a client can never supply a delta directly, and a metric with no real baseline yet is honestly `null`, never a guessed number. `POST /api/v1/intelligence/outcomes` is the real measurement-ingestion path (e.g. a Search Console/AI Visibility delta measured after a page publishes).
2. **Two-tier real-time events, mirroring the existing `workflow_events` pattern (`migrations/0005`)**: the `notify_intelligence_invalidation()` trigger (`migrations/0008`, extended in `migrations/0010`) both `pg_notify`s on channel `intelligence_events` (for any live listener — e.g. a future SSE stream, the same pattern `/api/v1/workflows/:id/events` already uses for workflow runs) AND inserts a durable row into `intelligence_event_queue`. The NOTIFY tier serves anyone connected right now; the queue tier guarantees every real event is eventually processed regardless of whether anyone was listening at the moment it fired — the same two-tier durability trade-off ADR-022/023 already made for workflow step execution, applied here to intelligence invalidation.
3. `POST /api/v1/intelligence/process` is the real worker tick draining that queue (same `CRON_SECRET` convention, same shape as `/api/v1/workflows/process`), wired into `vercel.json` on the same 5-minute cadence.

## Consequences
- Positive: an Outcome is always traceable back to a real Action, and a Decision's real predicted-vs-actual comparison (ADR-034) always has a real, non-fabricated number to compare against.
- Positive: no real intelligence-affecting change is ever silently lost to a disconnected listener — the durable queue is the guarantee, the NOTIFY is a convenience for anyone watching live.
- Negative: this deployment runs no persistent listener process — like the workflow queue, `intelligence_event_queue` is only as fresh as the last cron tick (up to 5 minutes of latency), not truly instantaneous. A genuinely real-time UI would need to open its own SSE connection against the NOTIFY channel directly, which is real follow-up work.
