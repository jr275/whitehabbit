# Phase 8 UI Architecture — inspection before coding

Written per §0 of the Phase 8 brief, before any new UI code. Maps exactly
what already exists so nothing below invents an API contract, a component,
or a capability that isn't real yet.

## 1. Existing APIs (real, tenant-scoped, already tested)

**Intelligence Decision Layer** (`/api/v1/intelligence/*`, Phase 6-7):
`signals` (top-level, Phase 5B), `insights`, `decisions` (+`/:id`,
`/:id/action-plan`, `/:id/execute`), `actions` (+`/:id`, `/:id/retry`,
`/:id/cancel`, `/process`), `outcomes`, `timeline`, `map`, `mission`,
`next-action`, `process`. `recommendations` (top-level, Phase 5B).

**Opportunity Engine** (`/api/opportunities`, `/api/opportunities/:id`,
`/api/opportunities/:id/generate`, `/api/v1/opportunities/:id/explain`,
`/api/v1/opportunities/:id/information-gain`).

**Workflow / Agent Control** (`/api/v1/workflows`, `/:id`, `/:id/cancel`,
`/:id/pause`, `/:id/resume`, `/:id/retry`, `/:id/events` [SSE, real,
per-run `LISTEN`], `/process`; `/api/agent-runs`, `/api/agent-runs/:id`).

**Knowledge Graph** (`/api/knowledge/entities`, `/api/knowledge/entities/:id`
— real relationships/evidence/opportunities per entity; `/api/knowledge/
merge-candidates`).

**Pages / Publishing** (`/api/pages`, `/api/pages/:id`, `/api/pages/:id/
publish`).

**Approvals, domains, route-templates, search-console, ai-visibility,
trends, evidence, queries, intents, research** — all real, all
tenant-scoped, unchanged by this phase.

Every route enforces tenant isolation via `requireSession()` — a
cross-tenant resource 404s, never 403s. This phase adds no new backend
capability that doesn't already exist; new endpoints (§4 below) are thin,
real aggregations/filters over the above.

## 2. Existing domain models the UI must render honestly

`Opportunity` (12 score components, each `null`-or-real — Known/
Estimated/Unavailable, ADR-005), `IntelligenceDecision` (16-action closed
taxonomy, real reason/evidence/cost/risk/confidence), `ActionPlan`
(`lib/intelligence/action-plan.ts`, resolved fresh — not persisted),
`IntelligenceAction` (`queued|running|succeeded|failed|cancelled|blocked`),
`IntelligenceOutcome` (real, server-computed `delta`), `WorkflowRun`/
`WorkflowStep` (10-state machine, real checkpoints), `Entity`/
`EntityEvidence`/`EntityRelationship`, `InformationGainV2Result` (12 named
components, each `known`/`unavailable`), `Page`/`PageVersion` (quality/
SEO/AEO/GEO/information-gain scores), `Trend`, `AIAnswer`/`AICitation`.

## 3. Existing realtime capability

**Real**: one SSE stream, `GET /api/v1/workflows/:id/events` — a
dedicated Postgres `LISTEN` connection per open HTTP response, scoped to
one `WorkflowRun`. Not pooled (risks.md R-21) — a real, named connection-
budget ceiling.

**Not real yet**: no tenant/project-wide intelligence stream. The
`intelligence_events` `pg_notify` channel (migrations/0008/0010) exists
and is real, but nothing in the UI subscribes to it, and no route exposes
it as SSE beyond the one per-run channel above (ADR-041, R-45 already
name this gap). This phase does not build a new stream — it reuses the
one real one where it fits (a single agent run's own live status) and is
honest everywhere else that "live" means "refetch on a real event/action,
not push."

## 4. Reusable components / design system

No component library beyond `@base-ui/react`-based `components/ui/
button.tsx` and a `chart.tsx` wrapper — every feature page (`/opportunities`,
`/mission`, `/knowledge`, `/agent-runs/:id`) hand-rolls its own layout
directly with Tailwind v4 utility classes against a real, shared token set
(`app/globals.css`: `--color-primary`, `--color-grow`, `--color-warn`,
`--color-destructive`, `bg-card`/`border-border`/`text-muted-foreground`,
`font-mono uppercase tracking-[0.x em]` for section labels). `TopNav`
(`components/studio/top-nav.tsx`) is the one real, shared shell — grouped
nav links, tenant name display (no real switcher), a `⌘K` button that
dispatches into a listener that doesn't exist yet (R-47).

`components/agent-runs/agent-run-detail.tsx` (`/agent-runs/:id`) already
implements a real, working single-run inspector: real status/duration/
cost/attempts, a real clickable step timeline (color = real state, never
decorative), real cancel/pause/resume/retry wired to the real Workflow
API. This is Phase 8's real "Agent Run Inspector" — extended, not
rebuilt, in this phase.

`components/knowledge/knowledge-explorer.tsx` (`/knowledge`) already
implements real entity search + progressive detail loading (relationships/
evidence/opportunities fetched only once an entity is selected — never
the whole graph up front).

No graph-visualization library exists yet. `@xyflow/react` (React Flow,
production-grade, MIT) is added this phase for the Opportunity Map and
Live Agent Graph — no second competing library, no custom canvas engine.

## 5. UI gaps (what Phase 8 must build)

No dedicated `/intelligence/map` graph UI (the real API existed since
Phase 6G, unconsumed). No dedicated `/intelligence/timeline` page (the
real API existed since Phase 6G, only consumed as a compact feed inside
Mission Control). No `/agents/live` cross-run view. No Command Palette
listener. No global search. Mission Control (`/mission`) exists (Phase 7)
but as a flat KPI strip + one decision card, not the four-zone layout
Phase 8 asks for. Decision Center (`/intelligence/decisions`) exists but
shows evidence as plain text, not a connected causal chain.

## 6. Performance considerations

Real constraints already established elsewhere in this codebase apply
directly: every list endpoint caps at 100-500 rows (`Math.min(limit,
cap)`), every query is `(org_id, project_id, ...)`-indexed. The
Opportunity Map's existing backend (`lib/intelligence/map.ts`) has a real,
already-documented N+1 (risks.md R-38) — this phase does not fix that
backend shape; it designs the UI to request a bounded, filtered slice
(never "fetch everything, filter in the browser") so the existing N+1
stays bounded by the same real list caps already in place. React Flow
itself only renders nodes actually in the returned set — this phase does
not implement clustering/level-of-detail (an honest, named deferral, not
claimed as done — see ADR-044).

## 7. Visualization strategy

Reuse the existing token-driven color language for state (grow/warn/
destructive/primary/muted) across every new visualization — a graph node
or timeline entry's color must mean the same real thing (succeeded/
running/blocked/failed) everywhere in the app, never a page-local palette.
React Flow's built-in pan/zoom/minimap for the two graph pages; the
Intelligence Timeline and Decision causal chain use the existing list/
card patterns already established, not a second bespoke rendering engine.

## 8. Accessibility strategy

Every new interactive element (graph node, timeline entry, command
palette item) is a real, focusable, keyboard-activatable element (a
`<button>`, never a `<div onClick>`) — matching the existing pattern in
`agent-run-detail.tsx`'s step list. The two graph pages ship a real,
non-visual list fallback (the same data the graph renders, as a plain
filterable list) rather than only a canvas — screen-reader users get the
real underlying data, not a degraded experience. Full WCAG audit
(contrast ratios, `prefers-reduced-motion` handling beyond "no decorative
animation exists at all") is not exhaustively re-verified this phase —
named as a real follow-up, not claimed as fully audited.

## 9. Tenant-isolation strategy

Unchanged discipline: every new/extended API route resolves its data via
`requireSession()`'s real `organizationId`, never a client-supplied
tenant id; every new list/graph/search endpoint accepts filters as real
query parameters resolved server-side (never "fetch all tenants' rows and
filter client-side"). New adversarial tests follow the exact pattern
`tests/api/*.test.ts` already established across Phases 6-7.
