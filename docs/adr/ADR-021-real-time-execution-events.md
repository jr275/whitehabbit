# ADR-021: Real-time workflow events via Postgres LISTEN/NOTIFY, not polling

## Status
Accepted.

## Context
The Phase 4 brief requires real-time execution events in the Agent Control
Center UI, explicitly warning against "fake real-time" — a fixed-interval
poll dressed up as a stream. The deployment has no message broker
(Kafka/Redis pub-sub) and this ADR series (ADR-017) already declined to add
one without a proven need.

## Decision
`migrations/0005_workflow_notify.sql` adds trigger functions
(`notify_workflow_run_change`/`notify_workflow_step_change`) that fire
`pg_notify('workflow_events', ...)` on every `agent_runs`/`agent_run_steps`
write — a real, database-level event, not something application code has to
remember to emit at every call site.

`GET /api/v1/workflows/:id/events` (`app/api/v1/workflows/[id]/events/
route.ts`) opens a dedicated `pg` pool client (outside the shared query
pool, held for the life of the HTTP response — possible because this fork's
routes run on the Node.js runtime, not Edge), issues `LISTEN
workflow_events`, and streams matching notifications to the client as
Server-Sent Events. Tenant isolation is enforced twice: once by
`requireSession()`/`getWorkflowRun()` before the stream opens (a caller who
doesn't own the run never gets a stream at all), and again per-notification
(a payload is only forwarded if its `orgId` matches the session's — every
tenant's writes fire the same channel, so the listener, not Postgres, does
the per-run/per-tenant filtering). A run already in a terminal state closes
the stream immediately after one `terminal` event rather than holding a
connection open forever waiting for a notification that will never come.

## Consequences
- Positive: genuinely real-time — an event reaches a connected client the
  moment the underlying row changes, not on the next poll tick.
- Positive: no new infrastructure — `pg_notify`/`LISTEN` are core
  PostgreSQL, already the platform's sole datastore.
- Negative: `LISTEN` connections are long-lived and don't pass through
  `pg`'s normal pool — each open SSE stream holds one dedicated connection
  for its duration. At meaningful concurrent-viewer scale this is a real
  connection-budget constraint (Postgres connection limits, or a pooler's
  own ceiling); documented in `docs/architecture/risks.md` as a scaling
  concern to revisit (e.g. a single shared `LISTEN` connection fanning out
  to many HTTP responses in-process) before this is relied on at high
  concurrent-viewer counts.
- Negative: `pg_notify` payloads are capped at 8000 bytes and are
  fire-and-forget — a client that's disconnected when a notification fires
  simply never sees it (mitigated by the client re-fetching current state
  on reconnect via the existing `GET /api/v1/workflows/:id`, not solved by
  the event stream itself).
