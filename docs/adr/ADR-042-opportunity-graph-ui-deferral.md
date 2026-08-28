# ADR-042: Opportunity Map UI — deliberately deferred, real API already real

## Status
Accepted.

## Context
The Phase 7 brief's §19 asks for `/intelligence/map` — an interactive graph visualization of entities/markets/roles/intent/opportunities/pages, node size by business value, node intensity by opportunity score, filterable, with a click-through intelligence panel. The real backend for this — `lib/intelligence/map.ts`, `GET /api/v1/intelligence/map` — already shipped in Phase 6G: real nodes and edges assembled from persisted Observations/Decisions and their real `intelligence_relations` edges, honestly scoped to the currently-connected subset (Observation → Decision → Subject) rather than every object type §6/§19 name. Building the actual interactive graph UI — a real React Flow (or equivalent) canvas with layout, filtering, sizing/intensity encoding, and a click-through detail panel, at the visual quality bar the brief sets ("Palantir Foundry," not a force-directed toy) — is substantial, standalone frontend engineering distinct from the Mission Control/Decision Center work ADR-040 completed this phase.

## Decision
Do not build the Opportunity Map UI this phase. This is a deliberate scope decision, not an oversight: Phase 7's primary, explicitly-named gap was the Decision → Action bridge (ADR-038/039, risks.md R-37) — closing that, and shipping the two UI surfaces that most directly expose it (Mission Control's "what should I do next," Decision Center's full decision lifecycle), was judged the higher-value use of this phase's real capacity than a graph visualization whose real backend already exists and is already real, tested, and callable on its own.

The real API remains exactly as real as it was after Phase 6G — this ADR changes nothing about `lib/intelligence/map.ts` or its endpoint. A future phase building the actual graph UI has a real, stable, already-tenant-isolated data source to render against; it does not need to build or change any backend work first.

## Consequences
- Positive: Phase 7's real capacity went to the backend bridge and the two UI surfaces most tied to it, matching the brief's own stated priority (the closing gap named explicitly, ahead of the visual/exploratory surfaces).
- Positive: no rushed, disconnected graph UI was built against fixtures or a half-real API — when this UI is built, it renders real production shapes from day one.
- Negative: the brief's Definition of Done describes a user opening the platform and visually exploring "what the system knows" as a graph — that specific experience is not yet real, even though the data behind it is. `docs/architecture/risks.md` carries this forward as a named, real follow-up (extending R-41's existing "no dedicated UI" entry) rather than a silently dropped requirement.
