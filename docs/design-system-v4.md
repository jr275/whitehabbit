# Design System v4

Status: architecture proposal, documentation only — no code changes accompany this document. Named "v4" per this task's own instruction; this repository has no v1-v3 design-system document, so this is the first written spec of a visual language that has, in practice, already been converging across Phases 6-8 and Phase UX-2/UX-3. This document names what's already real and consistent, flags the few real inconsistencies, and defines the additions the ontology UI (`docs/ontology-ui-architecture-v1.md`) needs.

## 0. Foundation: the existing token system stays

`app/globals.css` already defines a real, OKLCH-based dark token system — `--background`/`--foreground`/`--card`/`--popover`/`--primary`/`--secondary`/`--muted`/`--accent`/`--destructive`/`--border`/`--input`/`--ring`, plus three signature accents (`--grow`, `--warn`, `--alive`) and a 5-step `--chart-*` scale. This document does not replace any of these — it names their semantic roles precisely (§4) and adds the small set of composite patterns (cards, labels, badges) that recur across every real surface built since Phase 6 but were never written down.

## 1. Typography

Two real families, already loaded: `--font-sans` (Geist Sans, body/UI text) and `--font-mono` (Geist Mono, labels/metadata/numbers). The real, consistent convention across every recent surface (`components/mission/*`, `components/studio/*`, `components/home/product-home.tsx`):

| Role | Real pattern | Example |
|---|---|---|
| Eyebrow / section label | `font-mono text-[9px] uppercase tracking-[0.16em]–[0.22em] text-primary` (or `text-muted-foreground` for secondary labels) | `SEO INTELLIGENCE`, `PAGE FACTORY` |
| H1 (page identity) | `text-4xl sm:text-5xl font-semibold tracking-[-0.03em]` | product-home.tsx headers |
| H2 (section) | `text-xl font-semibold tracking-[-0.01em]` | `SectionHeader` |
| Body | `text-[13px]–[15px] leading-relaxed text-muted-foreground` (secondary) / `text-foreground` (primary) | throughout |
| Numeric / data | `font-mono tabular-nums` always, `text-xl`–`text-2xl font-semibold tracking-[-0.02em]` for a hero number | Pipeline stage counts, PerformanceTile |
| Micro-label under a number | `font-mono text-[8px]–[9px] uppercase tracking-[0.08em]–[0.1em] text-muted-foreground` | "score"/"quality" captions, ADR pattern this session |

**Rule going forward**: any new numeric value gets `tabular-nums` and `font-mono`; any new label gets the eyebrow pattern. No new type scale is proposed — the above six roles cover every real surface today.

## 2. Spacing & density

Real convention: content max-width `1100px`–`1180px` (`mx-auto`), page padding `px-5 sm:px-8`, vertical rhythm between major sections `gap-12`–`gap-14` (`flex flex-col gap-N` on the page root), card interior padding `px-5 py-4` (list rows) or `px-6 py-6 sm:px-7` (feature panels), list-row height driven by content not a fixed height (`py-4`/`py-2.5` depending on row density). This is real, working density — "high-signal, not sparse" per the product-experience-reset.md's own design direction — and is preserved as-is. **No global density change is proposed.**

## 3. The card/row/panel vocabulary (name what's already real)

Three real composite patterns recur everywhere and should be named as the base vocabulary for anything new:

- **Card** — `rounded-xl border border-border bg-card`. The one real container shape. Never a second radius/border treatment introduced ad hoc.
- **Row** (inside a card, in a list) — `flex items-center gap-N px-5 py-4 [transition-colors hover:bg-secondary/40]`, siblings separated by `divide-y divide-border` on the parent, not individual borders.
- **Panel** (a feature-level card with its own eyebrow+title) — a Card with a `SectionHeader`-shaped header (`components/home/product-home.tsx`'s pattern) above its content.

## 4. Color — semantic roles, precisely

| Token | Real hex-equivalent role | Ontology semantic (this doc's addition) |
|---|---|---|
| `--primary` | The living blue (`oklch(0.55 0.235 264)`) | Active/in-progress/primary-action; the one color allowed on a button |
| `--grow` | Green (`oklch(0.66 0.15 150)`) | Succeeded/published/positive real outcome |
| `--warn` | Amber (`oklch(0.75 0.16 75)`) | Needs attention/in review/blocked-but-not-failed |
| `--destructive` | Red (`oklch(0.62 0.2 25)`) | Failed/rejected/error only — never used for "needs attention" |
| `--muted-foreground` | Real neutral gray | Inactive/not-yet-started/de-emphasized evidence |
| `--chart-1..5` | The 5-step categorical scale (blue/green/cyan/amber/purple) | **Proposed use**: Object Type category color when a graph or legend needs to distinguish types (Entity/Opportunity/Page/Decision/Trend), never used for status (status is always primary/grow/warn/destructive/muted, above) |

**Rule going forward**: status color and category color are two different scales and must never be conflated — a node's *type* (what kind of object) uses `--chart-*`; a node's *state* (what's happening to it) uses primary/grow/warn/destructive/muted. This is a real distinction `components/mission/intelligence-graph.tsx`'s `TYPE_TONE` map already gets right implicitly; this document makes it an explicit rule for every future graph/list/badge.

## 5. Object states

Every real closed status union (product-model doc §1) gets one, and only one, color from §4's five-value state scale — never a sixth ad hoc color introduced per feature. The real, working mapping already established in `components/home/product-home.tsx`'s `STAGE_META` and `PAGE_STATUS_TONE`:

- **Not started / queued** (`discovered`, `pending`, `queued`) → `text-muted-foreground`
- **In progress** (`qualified`, `approved`, `generating`, `running`, `crawling`) → `text-primary` (pulse *only* when the specific counted item is real and currently active — never a decorative pulse on a static count)
- **Needs attention** (`ready`/in-review, `waiting_approval`, `retrying`) → `text-warn`
- **Succeeded** (`published`, `succeeded`, `completed`) → `text-grow`
- **Failed/rejected** (`quality_rejected`, `failed`, `blocked`, `cancelled`) → `text-destructive`

This five-bucket mapping is proposed as the one, universal object-state legend — every Object Type's own status union (however many real values it has) reduces to one of these five buckets for color purposes, keeping the whole product's status vocabulary visually consistent even though the underlying enums differ per type.

## 6. Link visualization

Real precedent: `components/home/product-home.tsx`'s `Pipeline` component connects stage nodes with a plain `ChevronRight` in a `text-border` (near-invisible, structural) tone — connection shown, never decorated. `components/mission/intelligence-graph.tsx`'s React Flow edges use a thin, low-opacity stroke by the same logic. **Rule**: an edge/connector is always rendered in `--border` or `text-border`-equivalent opacity unless the edge itself carries real, meaningful state (e.g., a real confidence score) — decoration-free by default, exactly matching the brief's own §31 "minimal decorative UI."

## 7. Choosing a view type (the deciding rule, referenced by the UI architecture doc §4/§13)

| Use | When |
|---|---|
| **Table** | Comparing many objects of the same type on the same properties (existing `/opportunities` list) |
| **Graph** | The relationships between objects *are* the answer to the question (System Graph modes) |
| **Timeline** | Sequence/recency is the answer (Intelligence Timeline, production stream) |
| **Object View** | One specific object, in full |
| **Pipeline** | A closed, ordered lifecycle's aggregate state (Page Factory) |
| **Map** | Geography is the organizing dimension — **real, named gap**: no map view exists in this codebase today; proposed only if a real geographic Object Type (e.g., Market with real lat/lon) justifies it, never built speculatively |

## 8. Actions — visual contract

Per the UI architecture doc §5's proposed shared `ActionButton`/`ActionCard`: primary action = filled `bg-primary text-primary-foreground` button, always singular per view (product-experience-reset.md §15/16, already enforced in `product-home.tsx`). A `plan.status === "unsupported"` or `!policy.allowed` state renders as inline `text-warn`/`text-muted-foreground` explanatory text next to (never instead of) the action's real label — the user always sees *what* the system would do, even when it can't do it automatically yet. An in-flight action shows its real busy state as button-label text ("Working…"), never a separate spinner overlay — matching the existing real pattern in `NextActionBanner`/`NextActionCard`.

## 9. Tables

Real precedent: `/opportunities`, `/pages` list views. Proposed convention for any new object table: sortable by the object's real primary Scoreable property by default, status column always uses §5's five-bucket color legend, row click navigates to the Object View (§ ui-architecture doc §2), never a modal for a full object.

## 10. Graphs

Governed entirely by the real, shipped `lib/intelligence/map.ts#buildGraph()` + `components/mission/intelligence-graph.tsx` pattern (ui-architecture doc §3): one `MapNode`/`MapEdge` shape, React Flow as the one rendering library (already the case — `@xyflow/react`, Phase 8), node color by §4's category scale, node size/intensity by the object's real Scoreable property, click → Object View. No new graph visual language is proposed; this section exists only to say "there isn't a second one."

## 11. Timelines

Governed by the real, shipped `lib/intelligence/timeline.ts` + `components/mission/intelligence-timeline.tsx` pattern: day-grouped, type-colored (§5's status legend, not §4's category scale — a timeline entry's dot color is its real outcome, e.g. published=grow, rejected=destructive), real relative or absolute timestamp per entry. `product-home.tsx`'s production stream already reuses this exact visual grammar (colored dot + label + relative time) independently — proposed: formalize it as one shared `TimelineEntry`/`StreamRow` component (design-system component list, ui-architecture doc's Watcher section) rather than two parallel implementations, closing that real duplication.

## 12. Maps

Not built, not proposed for v1 — see §7's honest gap note. No Object Type today carries real geographic coordinates (`Market.geography` is free text, e.g. "Austin, TX," not `lat`/`lon`). Building a map view before that real data exists would mean either fabricating coordinates or geocoding free text at render time (a real, separate, unscoped capability) — named as future work, not attempted here.

## 13. Responsive behavior

Real, working conventions established this session, to be treated as the standard going forward:
- **Horizontal scroll with a fade affordance**, not silent truncation, for any row of fixed-width items that may overflow (TopNav's grouped dropdowns avoided this entirely by restructuring; `product-home.tsx`'s Pipeline uses a responsive min-width *plus* a `bg-gradient-to-l from-card` edge fade below the breakpoint where it can't fully avoid it). **Rule**: any new horizontally-scrollable strip must ship with this fade affordance from the start, not added after a QA pass catches its absence — as happened twice this session.
- **Stack, don't shrink past legibility**: two/three-column tile grids (Performance strip) collapse to a single column below `sm:`, never a cramped multi-column squeeze (the real bug fixed in Phase UX-2's mobile QA).
- **Rotate directional connectors**: a horizontal `→` connector (Opportunity→Page spotlight) becomes a vertical `↓` below `sm:` via a `rotate-90 sm:rotate-0` utility — already real, keep as the pattern for any future connector.
- **Progressive disclosure over cramming**: mobile's Object View (ui-architecture doc §2) should default to Header+Properties+one primary Action visible, with Relationships/Evidence/Activity behind a real expand, not all six sections rendered flat (no code exists for this yet — named as the mobile Object View's design requirement when it's built).

## 14. Component inventory — real vs. proposed

Per the brief's own component list, cross-referenced against what actually exists in this codebase today:

| Component | Status |
|---|---|
| `Metric` | **Real**, duplicated 3x (`mission-control.tsx`, old `product-home.tsx` v1, `PerformanceTile` in v2) — proposed to unify |
| `ScoreRing` / `ScoreBreakdown` | **Not built** — scores render as plain numbers today (§1's numeric-role pattern); a ring/breakdown visualization is real, proposed net-new work |
| `EntityNode` / `OpportunityNode` | **Real**, inside `intelligence-graph.tsx`'s `IntelligenceNode` (one shared component across modes, not per-type) |
| `GraphCanvas` | **Real** — the React Flow wrapper inside `intelligence-graph.tsx` |
| `Timeline` / `TimelineEvent` | **Real** — `intelligence-timeline.tsx`; proposed to share with the Page Factory's production stream (§11) |
| `AgentNode` / `AgentEdge` / `AgentStatus` | **Real**, inside `live-agent-graph.tsx`'s `StepChip`/`RunRow` — not yet named/extracted as this general contract |
| `DecisionCard` / `DecisionInspector` | **Real** — `decision-center.tsx`'s `DecisionCard` |
| `EvidencePanel` | **Not built** as a shared component — evidence rendered ad hoc where shown today |
| `ProvenanceBadge` / `ConfidenceBadge` | **Not built** — confidence renders as plain text (`Math.round(x*100)%`) today; a shared badge is real, proposed net-new work |
| `ActionButton` | **Real logic, duplicated 2x** (`NextActionCard`, `NextActionBanner`) — proposed to unify, per ui-architecture doc §5 |
| `CommandPalette` | **Real** — `command-palette.tsx` (Phase 8) |
| `IntelligenceInspector` | **Real, narrow** — `intelligence-graph.tsx`'s click-through Inspector; proposed to generalize into the full Object View (§2) |
