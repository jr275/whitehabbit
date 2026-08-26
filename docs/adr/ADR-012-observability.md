# ADR-012: Structured logging now, OpenTelemetry when a second process exists

## Status
Accepted (deferred upgrade path, not rejected).

## Context
`lib/observability/logger.ts` provides structured JSON logs with a
`requestId` (see `newRequestId()` used throughout `lib/api-error.ts`'s
`withApiHandler`). There is no distributed tracing (`trace_id` propagated
across services) because there is exactly one process/service today —
tracing exists to correlate work *across* boundaries, and there is currently
only one boundary (this app ↔ Postgres/LLM providers), which structured logs
plus Postgres's own query logs already cover adequately.

## Decision
Adopt OpenTelemetry when a second process exists to correlate against —
concretely, when `apps/worker` or `apps/public-site` (ADR-000/003/007)
ships, because that's the first point a single user-facing action (e.g.
"approve this opportunity" → a worker job → a page render) actually spans
processes. Until then, extend the existing logger's `requestId` convention
to new domains: this revision's opportunity ingestion and API routes log
through the same `logger`, with `orgId`/`projectId`/`executionId` fields
added to every relevant log line, matching the brief's §48 field list
(`tenant_id`, `agent_run_id`) at the granularity that's actually meaningful
today.

## Consequences
- Positive: no OTel collector, exporter config, or sampling policy to
  operate for a single-process app that doesn't yet need cross-process
  correlation.
- Negative: LLM cost/latency and queue-depth-style metrics (§48) are not
  yet aggregated anywhere beyond the per-execution rows already in Postgres
  (`executions.cost_usd`, `.duration_ms`) — there is no dashboard/exporter.
  Tracked as R-10; a real metrics backend is worth adopting once there's
  enough execution volume that querying Postgres directly for these numbers
  stops being sufficient.
