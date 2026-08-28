# ADR-044: Opportunity Graph — multi-mode Intelligence Graph UI

## Status
Accepted (real, with named scale limitations — see Consequences).

## Context
ADR-042 deliberately deferred building the Opportunity Map UI in Phase 7, keeping only its real backend (`lib/intelligence/map.ts#buildIntelligenceMap()`, `GET /api/v1/intelligence/map`). Phase 8 §6-9 asks for a real interactive graph — React Flow or equivalent, node visual encoding by score/trend/business value/info gain/status, click-through to an Intelligence Inspector, multiple graph "modes" (decisions/opportunities/knowledge/markets/roles/intents/pages) sharing one infrastructure rather than five separate implementations, and explicit scale discipline: "DO NOT render thousands of nodes simultaneously" via viewport-based loading, progressive rendering, node clustering, LOD, and server-side filtering/pagination.

## Decision
Added `@xyflow/react` (v12.11.5) as the one graph rendering library — no second, competing graph engine.

`lib/intelligence/map.ts` gained a single dispatcher, `buildGraph(orgId, projectId, filters)`, switching on a `GraphMode` (`decisions | opportunities | knowledge | markets | roles | intents | pages`) into one of four builders that all emit the same `MapNode`/`MapEdge` shape the original `buildIntelligenceMap()` (kept, now the "decisions" mode) already used:
- `buildOpportunityGraph()` — real `Opportunity` nodes sized/colored by their real score, edged to their primary `Entity` and real Market/Role/Trend relations via `listOpportunityGraph()`.
- `buildKnowledgeGraph()` — real `Entity` + `entity_relationships` subgraph, filtered server-side to an `entityType` (markets/roles/intents modes reuse this builder with a fixed `entityType`) via `listCanonicalEntities()` + `listRelationshipsForProject()`, bounded to only edges where both endpoints are already in the fetched node set (never an unbounded relationship scan).
- `buildPageGraph()` — real Page → Opportunity → Entity chains.

`GET /api/v1/intelligence/map` accepts `mode`/`entityType`/`status`/`minScore`/`limit`, all forwarded to the one dispatcher — every filter is applied in the query layer, never fetched unfiltered and narrowed client-side. `components/mission/intelligence-graph.tsx` renders the seven mode pills, a filter bar (entity type / status / min score, all sent as real query params), a React Flow canvas with a real depth-based layout, a click-through `Inspector` side panel that fetches the node's real detail record (`/api/opportunities/:id`, `/api/knowledge/entities/:id`, or `/api/pages/:id` depending on node type) — and a List view toggle as the screen-reader/keyboard fallback the graph canvas itself can't fully offer.

## Consequences
- Positive: one real, shared graph substrate for seven different views — adding an eighth mode later means one more builder function against the same `MapNode`/`MapEdge` contract and one more pill, not a new page.
- Positive: real click-through inspector, real filters, real server-side scoping (confirmed via the same tenant-isolation test pattern the rest of `/api/v1/intelligence/*` uses).
- **Named limitation, not silently dropped**: the brief's explicit scale requirements — viewport-based loading, progressive rendering, node clustering, and level-of-detail rendering — are **not implemented**. Every mode currently uses one bounded server-side `limit` (default 100, hard-capped 200) rather than true incremental/viewport-driven fetching. At the tested scale (tens to low hundreds of nodes) this renders correctly and stays responsive; at the brief's stated target scale (10k opportunities, 100k entities) the current implementation would either truncate silently at 200 nodes or need to be paired with real pagination controls in the UI, neither of which exists yet. `docs/architecture/risks.md` carries this forward as a named follow-up.
- Negative: the Inspector's node-id parsing (`node.id.slice(node.type.length + 1)`) is a real but implicit convention tying `MapNode.id`'s `"<type>:<realId>"` format to the inspector's ability to look the record up — any future node type must keep that id format or the inspector needs an explicit id field added to `MapNode` instead of parsing.
