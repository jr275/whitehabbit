# ADR-040: Mission Control — a real, API-first home screen and Decision Center, not a demo shell

## Status
Accepted.

## Context
Phase 5B and Phase 6 both deliberately shipped API-first, with any dedicated UI explicitly deferred (`docs/architecture/risks.md` R-33, R-41) — visualizing a data model before it has real production usage means designing against fixtures, not real shapes. Phase 7's brief is more insistent: it wants an actual, working "what should I do next" experience a user can open today, not just another set of endpoints. The brief also names a large surface — Mission Control, a Live Agent Graph, an Opportunity Map, a rebuilt Agent Inspector, a Command Palette — that would take multiple phases to build at the quality bar it asks for ("Palantir Foundry × Linear × Vercel," not a generic SEO dashboard).

## Decision
Build the two highest-value, genuinely achievable-at-quality pieces now, real data only, using this codebase's own existing design system (`bg-card`/`border-border`/`text-primary`/`font-mono` uppercase tracking labels — the same tokens `/opportunities` already established) rather than inventing a new visual language or reaching for a component library:

1. **`/mission`** (`components/mission/mission-control.tsx`) — six real KPIs (`lib/intelligence/mission.ts#buildMissionSnapshot()`, every number a real, current query over persisted rows, `null`/honest-zero where no real data exists — Search Console totals are `null`, never a fabricated `0`, when unconfigured), the "What should I do next?" card (the real highest-priority pending Decision, its real ActionPlan, and a one-click "Approve & Execute" that performs the two real API calls in sequence), and a compact real Intelligence Timeline feed (reusing the Phase 6 `/timeline` endpoint unmodified).
2. **`/intelligence/decisions`** (`components/mission/decision-center.tsx`) — real tabs matching the actual, closed `DecisionStatus` values (`pending`/`approved`/`executed`/`rejected`/`expired`/`cancelled`) rather than inventing "Executing"/"Completed" states the Decision object itself doesn't carry (that distinction genuinely lives on the linked Action, shown on expand). Approve/Reject/Execute wired to the real Phase 6/7 endpoints.

Both default to the org's real default project (`getOrCreateDefaultProject()`, matching every legacy `/api/opportunities`-style route) since this app still has no real project-switcher UI (R-12) — `GET /api/v1/intelligence/mission` and `/next-action` accept `projectId` as optional for exactly this reason, unlike the rest of the Phase 6 `/intelligence/*` surface where it's required.

Deliberately deferred, matching the established API-first precedent: the Opportunity Map graph visualization, a rebuilt Agent Run Inspector (the existing agent-run detail view from Revision 2/3 already provides real, if less visually ambitious, inspection), the Live Agent Graph (React Flow or equivalent), and the Command Palette (its `⌘K` trigger already existed in `TopNav` from an earlier revision but dispatches into a listener that was never built — still true today). Each is real, named follow-up work.

## Consequences
- Positive: a user can open `/mission` today and see the real system state the brief's Definition of Done describes — what the system knows, what it thinks is important, what it wants to do next — backed entirely by real data, zero mocked/hardcoded numbers.
- Positive: reusing the existing design system and the Phase 6 timeline/decisions APIs unmodified means this UI adds no new backend surface risk beyond the two new aggregation endpoints (`mission`, `next-action`), both read-only.
- Negative: the deferred surface (Opportunity Map, Live Agent Graph, Command Palette) is real, substantial UI engineering work — building it at the quality bar the brief asks for is multiple further phases, not squeezed into this one alongside the backend bridge that was Phase 7's primary ask.
- Negative: Mission Control's "Approve & Execute" button performs two real, separate API calls in sequence (approve, then execute) from the client — a real, if small, window where the first succeeds and the second fails (network drop) leaves a Decision approved but not yet executed; the Decision Center's own "Execute" button on an already-approved Decision is the real recovery path, not a special case that needed building.
