# ADR-036: The Decision Layer API surface — new resources under `/intelligence/`, existing resources left where they are

## Status
Accepted.

## Context
The Phase 6 brief names eight API paths: `/api/v1/intelligence/signals`, `/insights`, `/recommendations`, `/decisions`, `/actions`, `/outcomes`, `/timeline`, `/map`. Three of those resources — Signal and Recommendation — already have real, tested endpoints from Phase 5B at `/api/v1/signals` and `/api/v1/recommendations`, wired into whatever already consumes them. A literal reading of the brief would duplicate those two resources under a second path.

## Decision
Add only the genuinely new Phase 6 resources under `/api/v1/intelligence/`: `insights` (Insight already existed as a real, persisted model from Phase 5B but had no endpoint at all — a real gap, not a duplication), `decisions`, `decisions/{id}`, `actions`, `outcomes`, `timeline`, `map`. Signal and Recommendation stay at their existing, already-tested paths rather than being duplicated — a single source of truth per resource, consistent with how the rest of this codebase treats a resource's canonical location.

Within the new surface:
- `actions` is deliberately **read-only** (no POST). An `IntelligenceAction` is a real pointer to a real `agent_runs` row (ADR-031) — accepting a client-POSTed action would let a caller fabricate an execution record disconnected from any real agent run, which is exactly the "second, parallel run-tracking table" ADR-031 explicitly rejected. Actions are created only by real internal execution paths.
- `decisions/{id}` PATCH (approve/reject) follows the same not-found-vs-already-decided distinction `/api/v1/approvals/:id/approve` already established: a nonexistent or cross-tenant decision is 404; an already-decided one is 400 ("already {status} and can't be decided again") — never silently accepted twice.
- `outcomes` POST is the real measurement-ingestion path — `delta` is always server-computed (ADR-033), and the `actionId` it's recorded against must resolve within the caller's own tenant or the request is rejected, never silently attributed to a cross-tenant action.
- `timeline` and `map` are genuinely new aggregations (`lib/intelligence/timeline.ts`, `lib/intelligence/map.ts`), not thin re-exports — a real chronological merge and a real graph assembled from persisted `intelligence_relations` edges, honestly documented as covering the currently-connected subset (Observation → Decision → Subject) rather than overclaiming coverage of every object §6 of the brief names.

## Consequences
- Positive: no resource has two competing "canonical" URLs; a client always knows where to find a given resource.
- Positive: `actions`' read-only design keeps the "an Action IS a real agent run" invariant enforceable at the API boundary, not just by convention in application code.
- Negative: a caller reading the brief literally and expecting `POST /api/v1/intelligence/signals` will need to know it lives at `/api/v1/signals` instead — documented here and in `docs/api/openapi-v1-intelligence.yaml`'s description, not left implicit.
