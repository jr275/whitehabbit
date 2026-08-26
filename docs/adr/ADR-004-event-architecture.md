# ADR-004: Domain events — durable append-only tables now, transactional outbox deferred

## Status
Accepted, with a named follow-up.

## Context
`execution_events` is already a real, durable, sequenced, append-only event
log — `sequence` is computed inside the INSERT itself (`MAX+1` subquery), so
it stays correct across concurrent serverless instances, and it is the
system's documented "durable source of truth for the timeline," not the live
NDJSON stream. `business_events` similarly records real domain occurrences
(e.g. content_published) tied to a Worker/Output.

There is no outbound event bus, no webhook delivery system, and no
transactional outbox pattern (write + publish as one atomic unit) — nothing
external currently subscribes to these events; they are read back by the
same application that wrote them (bootstrap state, live polling).

## Decision
Keep events as durable rows in the owning domain's own tables
(`execution_events`, `business_events`, and this revision's implicit
opportunity lifecycle — see ADR-014) rather than introducing a generic
`events` table or an outbox before there is a real external consumer
(a webhook subscriber, a second service, a search-index updater). Building
the brief's full event model (`EntityCreated`, `OpportunityCreated`,
`PagePublished`, etc. with `correlation_id`/`causation_id`) and a
transactional outbox now would be infrastructure with no consumer —
exactly the premature-infrastructure trap the brief warns against
elsewhere, applied here to its own §43–44.

The trigger to build the outbox: the first real external consumer, most
likely webhook delivery (§41) once a tenant can configure one, or a search-
index / cache-invalidation step once `public-site` (ADR-007) exists and
needs to react to `page.published`. At that point, the outbox pattern
applies to *that* write path specifically (e.g. "insert opportunity row +
enqueue `opportunity.created`" as one transaction), not retrofitted onto
every existing table blindly.

## Consequences
- Positive: zero speculative schema (`outbox_events`, a generic `events`
  table with a payload/version envelope) sits unused.
- Positive: when the outbox is built, `execution_events`'s existing pattern
  (sequence assigned transactionally, ordering guaranteed, append-only) is
  the proven template to extend, not a new design.
- Negative: nothing outside this application can react to a domain
  occurrence today — no webhook, no external search index, no analytics
  pipeline. This is a real, named gap (`docs/architecture/risks.md` R-6),
  not an oversight; it is a straight line to the pattern above once needed.
