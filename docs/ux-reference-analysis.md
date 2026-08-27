# Uncle Scrooge — Cursor Reference Analysis

**Status: analysis only. No product code changed in this phase.** Grounded in one reference
image (Worker Studio → Build tab, an unconfigured "Untitled financial worker," tenant
"Northstar Holdings") and a line-by-line comparison against the actual repository as it stands
after Phase D. Where the reference shows something this document can't verify precisely (an
exact hex value, an exact typeface), it says `REFERENCE-DEPENDENT` rather than guessing —
per instruction, this document extracts principles and DNA, not a pixel trace to copy.

**Important framing, worth stating before anything else:** this is one screen, not the whole
product. The reference's own copy admits it — "Skill and autonomity changes are local to this
browser session. They are not written to a database" — meaning the reference itself is a
design prototype, not a shipped system. Its job here is to teach the visual and interaction
*language*; extrapolating that language to unseen screens (Command Center, Opportunities,
Decisions) is clearly marked as extrapolation below, not observation.

---

## 1. Reference summary

A left-sidebar-plus-content layout on a warm, off-white paper ground. The sidebar carries a
serif wordmark ("Uncle Scrooge"), a small-caps category label ("Financial OS"), and pure
typographic navigation grouped under four uppercase section labels — Command, Intelligence,
Governance, Settings — with zero icons. The content area shows a tenant header ("Northstar
Holdings," with three named subsidiary entities), a global "DEMO DATA" trust badge, a page
title in the same serif as the wordmark, a plain-English one-line description of the page's
purpose, a tab row (Build / Run / Outputs / Observe), and a two-column body: a list of Skill
Cards on the left, Tools/Policies/Autonomy on the right. The single accent color in the entire
image is a muted, desaturated green, reserved exclusively for the "DEMO DATA" badge.

## 2. Visual DNA

- **Monochrome discipline.** Ink-black text, warm paper ground, one mid-gray for secondary
  text. No blue, no brand color distinct from black itself — black *is* the brand color.
- **One accent, one job.** The muted green never appears anywhere except as a provenance
  signal. It is not a "brand accent" doing double duty — it's reserved, entirely, for trust.
- **Hairlines, not panels.** Every grouping (card, column divider, header rule) is a 1px line at
  low contrast against the paper. No elevation, no shadow, no filled card background distinct
  from the page — cards are *bounded*, not *raised*.
- **Near-zero ornament.** Minimal to no corner rounding; no gradients; no decorative icons in
  navigation at all — wayfinding is entirely typographic (weight, color, an active-state pill).
- **Editorial serif as the single loudest visual signal.** The wordmark and every page H1 share
  one serif display face — moderate stroke contrast, humanist, book-like. This one choice does
  more to signal "considered financial institution, not startup dashboard" than any other
  element in the frame. `REFERENCE-DEPENDENT`: the exact family; what's confidently observable
  is the *character* — a text-optimized serif with warmth, not a slab or a display-heavy face.
- **A clean grotesk for everything operational** — body copy, buttons, list text.
  `REFERENCE-DEPENDENT` on the exact family; observable as neutral, not geometric-quirky.
- **Mono, small, tracked, uppercase, for structural labels only** — "FINANCIAL OS," "SKILLS,"
  "NEEDS," "PRODUCES," "BUSINESS VALUE," "CONFIDENCE BASIS · RISK," "NOT CONFIGURED." Never used
  for anything a user reads at length. This is exactly the three-typeface role split (serif for
  identity/headings, sans for reading/interacting, mono for structure/data) the constitution's
  §6 already called for in principle — the reference makes it concrete.

## 3. Interaction DNA

- **Tabs, not a wizard.** Build / Run / Outputs / Observe is a flat tab row — a document you
  move through, not a multi-step configuration wizard with a progress rail. This is a materially
  different interaction model from the current Studio's left-rail numbered-step wizard.
- **A calm two-column document, not a canvas.** Skills as a vertical list of cards on the left;
  Tools/Policies/Autonomy as a shorter reference column on the right. Nothing floats, nothing
  orbits, nothing needs to be spatially arranged — a materially different interaction model from
  the current Studio's node-canvas-around-an-avatar layout.
- **Buttons are quiet.** "ENABLE" is an outlined rectangle with no fill — a control that reads as
  "available," not "urgent." Nothing in the frame shouts.
- **The active nav state is the one filled element in the whole screen** — a solid black pill.
  Confidence spent in exactly one place.
- **Autonomy is a selectable list of named, numbered levels** ("Level 0 — Observe," "Level 1 —
  Recommend," …), each with a one-sentence capability statement — not a three-way toggle with a
  vague label.

## 4. Information hierarchy

This specific screen is a *configuration* screen for a brand-new, unconfigured Worker — it has
no executions, no findings, no economic value to show yet, and it doesn't fabricate any. What
it does prove: **even a configuration screen frames itself in business-value language.** Each
Skill Card's "BUSINESS VALUE" column says *why the skill matters* ("Prevent liquidity shocks,
Reduce idle cash, Optimize funding") in the same visual weight as "NEEDS"/"PRODUCES" — value
is not saved for a results screen, it's present the moment you're deciding whether to enable
something.

Validating the brief's stack — Economic Value → Opportunity → Decision → Action → Result →
Evidence → Technical Detail — against *this* screen only partially applies, because this
screen sits below Opportunity/Decision in that stack by design (it's Worker configuration, not
a decision moment). What's real evidence either way: technical detail (tokens, execution ids,
tool internals) is completely absent from this screen — not de-emphasized, simply not present
where it isn't the point. That's a stronger form of the same principle.

## 5. UX principles derived from the reference

- State the business reason before the technical means, at every altitude — not just on results
  screens, but on configuration screens too.
- Radical honesty about what's real: two separate disclosures on one screen ("DEMO DATA," and
  the plain sentence about session-local, non-persisted state) — trust is treated as content to
  write, not a color to apply.
- Named, plain-language policy rules with an explicit approver ("IF amount > 1.000.000 BRL THEN
  cfo approval required") make governance legible without requiring the reader to understand a
  permission system.
- Multi-entity context (three subsidiary names under "Northstar Holdings") establishes
  enterprise scale in the header, wordlessly, before anything else on the page does.
- Restraint is spent, not distributed: exactly one accent color, exactly one filled UI element
  (the active nav pill). Everything else is ink, paper, and hairlines.

## 6. Design system specification

Principles first, values only where the reference makes them clearly readable:

| Aspect | Specification | Confidence |
|---|---|---|
| Ground | Warm, low-saturation off-white paper | Observed |
| Ink | Near-black, warm-neutral | Observed |
| Secondary text | Mid-warm-gray | Observed |
| Accent | One muted, desaturated green, reserved for provenance/trust signals only | Observed |
| Border | Low-contrast hairline, warm-neutral | Observed |
| Exact hex values | — | `REFERENCE-DEPENDENT` |
| Display typeface | Humanist serif, moderate contrast, book-like warmth | Observed (character); exact family `REFERENCE-DEPENDENT` |
| Body/UI typeface | Neutral grotesk sans | Observed (character); exact family `REFERENCE-DEPENDENT` |
| Label typeface | Monospace, small, uppercase, tracked | Observed |
| Radius | Minimal — square to barely-rounded | Observed (character); exact px `REFERENCE-DEPENDENT` |
| Elevation | None — no shadows anywhere in frame | Observed |
| Grid | Two-column body (≈70/30 split) below a full-width header/tab stack | Observed on this screen only |
| Density | High per-card information density, generous inter-section spacing | Observed |
| Iconography | None in navigation; unclear whether icons appear elsewhere | Partially observed |
| Button treatment | Outlined, unfilled, small, quiet | Observed |
| Active nav state | Solid fill, inverted text — the one filled element on screen | Observed |
| Motion | Not observable from a static image | `REFERENCE-DEPENDENT` |

## 7. Component language

Mapped against what already exists in the repository — see §15–18 for the full verdicts.

| Component (reference-implied) | Exists today? | Where |
|---|---|---|
| PageHeader (eyebrow + title + description) | No shared component — reimplemented inline per page | Every `app/*/page.tsx` |
| SkillCard (what/needs/produces/value/confidence/risk) | Partially — a rich fixture-only version, and a thin real one | `components/library/worker-card.tsx` (fixture) vs. `components/studio/worker-canvas.tsx:173` (real, name-only) |
| ToolStatusRow ("Not configured") | Yes, conceptually | `lib/agent/types.ts`'s `ToolDefinition.isConnected`, rendered ad hoc in Studio |
| PolicyRule (named IF/THEN + approver role) | Partially — unnamed IF/THEN only, no approver role field | `lib/workforce/model.ts`'s `BehaviorRule` |
| AutonomyLevelSelector (named, numbered levels) | No — today `Autonomy` is a bare `"low"\|"medium"\|"high"` enum | `lib/workforce/model.ts` |
| Metric / stat tile | Yes, but duplicated | `Metric()` in `product-home.tsx`, `Stat()` in `live-operations-page.tsx` — same concept, two implementations |
| EmptyState | Yes, but duplicated at least four ways | `StatePanel`/`InlineEmpty`/`FirstRun` in `product-home.tsx`, `Empty()` in `live-operations-page.tsx`, `Empty()` in `live-observatory.tsx` |
| ProvenanceBadge | Yes | `components/outputs/provenance-badge.tsx` — but doesn't yet render `economicState` (Phase D) |
| EconomicValue (amount + state, together) | No | — |
| OpportunityItem / DecisionItem | No — entities don't exist yet | Phase G |
| Timeline (narrated activity) | Yes, and already good | `components/outputs/timeline.tsx` + `lib/workforce/selectors.ts`'s `todaysTimeline()` |
| CommandSurface (⌘K) | **No — dead control.** The nav's "Search ⌘K" button dispatches a synthetic `keydown` event that nothing listens for; the one component that used to (`command-bar.tsx`) was deleted as dead code in Phase B. | `components/studio/top-nav.tsx:104` |

## 8. Agent experience model

The reference doesn't show a live agent narrative (this screen is Build, not a result), but its
Skill Cards already carry three of the eight beats — evidence-of-need ("NEEDS"), output
("PRODUCES"), and value ("BUSINESS VALUE") — in calm, structural form, with zero AI-flavored
language anywhere ("Predict future liquidity," not "Our AI predicts..."). The extrapolation to
the full agent arc (§19 of the constitution) is consistent with, not contradicted by, what's
shown: plain declarative sentences, no first-person AI voice, no chat affordance anywhere in
the frame.

## 9. Worker experience model

Confirms the constitution's model almost exactly: Worker → Purpose (the page's one-line
description) → Skills → Tools → Policies → Autonomy, all on one screen, no navigation required
to see the shape of what a Worker is. "Outputs" and "Executions" and economic value live behind
the other three tabs (Run/Outputs/Observe), not fabricated on Build.

## 10. Skill experience model

This is the single strongest validation in the whole reference: the Skill Card's fields —
description, Needs, Produces, Business Value, Confidence basis, Risk — map almost one-to-one
onto fields Phase D already added to `SkillDefinition`/`SkillEvaluation`/`MetricEmission`
(`description`, `requiredTools`/`inputs`, `outputType`/`structured`, business-kind
`MetricEmission`, the five-dimension confidence breakdown, `riskLevel`). The domain layer built
before this reference arrived already carries what this card needs to render. What's missing is
`economicState` and `dataProvenance` surfacing on the card — the reference's cards don't show
these (they're pre-execution, so there's no economic state yet), so this is a genuine open
question for a Skill Card that *has* run at least once, not a contradiction.

## 11. Trust model

The reference reinforces, doesn't just match, the constitution's §17: a global "DEMO DATA"
badge in the header *and* a repeated local one on the page, *and* a plain sentence spelling out
exactly what "demo" means here (session-local, not persisted, no execution rights). Three
independent trust signals for one fact, at three levels of specificity — a stronger pattern than
the constitution asked for, worth adopting as written.

## 12. Economic value model

Not directly observable on this screen (no dollar figures appear anywhere in the frame) — this
is itself informative: the reference doesn't fabricate a number to make the Build screen feel
more impressive. Business value is stated qualitatively here ("Cash released, Financing cost
reduced"); the numeric, staged (estimated/approved/executed/realized/verified) presentation
the constitution specifies must be validated against a *results*-type reference screen, which
hasn't been provided yet.

## 13. Responsive model

Not observable — a single desktop-width frame. No claims made.

## 14. Accessibility model

Not directly assessable from a static image (contrast ratios, focus states, and reduced-motion
behavior all need the real page). One relevant observation: the reference's low-contrast
hairlines and gray secondary text will need real contrast-ratio verification once tokens are
finalized — the constitution's §29 requirement (state is never color-only) applies regardless
of how quiet the palette ends up being.

## 15–18. KEEP / REFINE / REBUILD / NEW

Every item: current implementation → reference behavior → gap → recommended change → priority.

### KEEP

| Item | Current | Reference | Gap | Priority |
|---|---|---|---|---|
| Honest empty/trust states | Already excellent (`"No outputs yet — nothing is fabricated here"`) | Reference's own multi-layered "DEMO DATA" disclosure | None — same instinct, reference just goes further (§11) | — |
| Narrated activity timeline | `todaysTimeline()` already produces plain-English sentences | Not directly shown, but consistent | None | — |
| Build/Run/Outputs/Observe as the Worker's four lenses | Exists conceptually (different chrome) | Exists literally, as tabs | Chrome differs, concept doesn't | — |
| No chatbot UI anywhere | True today | True in reference | None | — |
| Postgres/auth/domain layer (Phase A–D) | Real, tested | Not visible in a screenshot, but nothing here contradicts it | None | — |

### REFINE

| Item | Current | Reference | Gap | Priority |
|---|---|---|---|---|
| Policy rules | Unnamed `BehaviorRule` (raw IF/THEN text, no title, no approver role) | Named rules with explicit approver role per rule | Add a name + approver-role field | P1 |
| Autonomy | Bare `"low"\|"medium"\|"high"` enum | Named, numbered levels with a one-sentence capability statement each | Needs richer, still-simple modeling, not a rewrite | P1 |
| ProvenanceBadge | Renders `ResultProvenance` only | Implies provenance and (once results exist) economic state should co-render | Add `economicState` rendering (Phase D field, unused in UI) | P1 |
| Duplicated stat-tile components | `Metric()` and `Stat()`, two implementations of one concept | One tile idiom throughout | Consolidate to one component | P2 |
| Duplicated empty-state components | Four separate implementations | One idiom, reused | Consolidate to one component | P2 |
| Nav weight for stub destinations | Approvals/Outcomes/Improve at equal weight to real screens | Reference doesn't show this ambiguity — every visible nav item reads as real | Demote or complete the stubs | P2 |

### REBUILD

| Item | Current | Reference | Gap | Priority |
|---|---|---|---|---|
| Worker Studio's container layout | Left-rail numbered wizard + node canvas around an avatar | Flat tabs + calm two-column document | Different interaction model, not a skin change | P0 (once visual work starts) |
| Skill Card | A name in a list (`worker-canvas.tsx:173`) | Full card: description, Needs, Produces, Business Value, Confidence, Risk | The real domain contract (Phase D) already has everything this card needs — this is a UI rebuild, not a domain gap | P0 |
| Global color/type system | Dark, forced, OKLCH "control room" | Warm, light, editorial, near-monochrome + one accent | A register change, not a refinement — see the constitution's explicit note that this was pending exactly this reference | P0 |

### NEW

| Item | Current | Reference | Gap | Priority |
|---|---|---|---|---|
| Multi-entity org header (parent + subsidiaries) | Single flat `organizations` row, no parent/child concept | "Northstar Holdings / Brazil · USA · Europe" | A real domain gap (`docs/domain-model.md` already names this as a possible future need) | P2 (domain), P1 (once real) |
| Command palette that does something | Dead button today | Implied by the "⌘K" hint in the reference header | Needs a real implementation, not just a dispatched event | P2 |
| EconomicValue component (amount + provenance + economic state, together) | Doesn't exist | Implied by the trust model, not directly shown | Needs Phase G (Opportunity/Decision) data to have something real to render | P1, blocked on Phase G |
| Opportunity / Decision screens | Don't exist | Implied by "Intelligence" nav group ("Opportunities," "Decisions") | Entities don't exist yet (Phase G) | P0, blocked on Phase G |

## 19. Prioritized implementation roadmap

Not a schedule — an order that respects dependencies:

1. **Design tokens first, once finalized** (P0) — the palette/type/spacing this reference
   implies, turned into real tokens, without touching any screen's structure yet.
2. **Skill Card rebuild** (P0) — highest ratio of visual impact to domain work already done;
   Phase D's contract is ready and unused.
3. **Worker Studio container rebuild** (P0) — tabs + two-column document, replacing the
   wizard/canvas, once tokens exist to build it in.
4. **Policy/Autonomy model refinement** (P1) — named rules with approver roles, numbered
   autonomy levels — a domain change, can start before the visual rebuild if desired.
5. **ProvenanceBadge + EconomicState rendering** (P1) — small, high-trust-value, unblocked.
6. **Component consolidation** (P2) — stat tiles, empty states — cleanup, not urgent, safe to
   fold into whichever screen touches them next rather than a standalone pass.
7. **Opportunity/Decision (Phase G) + the screens that depend on it** (P0 in principle, but
   correctly sequenced last here since the entities don't exist yet).

---

## Final output

### A. What I learned from the Cursor reference

That the product's differentiation is not decorative — it's the discipline of showing less,
more precisely. One accent color used for exactly one job (trust), one filled UI element on the
whole screen (the active nav state), business value stated even on a configuration screen, and
two independent trust disclosures stacked instead of one badge doing all the work. The serif
wordmark and headings do more to signal "considered financial institution" than any color
choice could. And — the thing I could not have predicted from the brief alone — the interaction
model is a calm, flat document (tabs + two columns), not the current app's node-canvas-around-
an-avatar. That's a bigger, more specific change than "reskin it warm."

### B. What should never be lost

The restraint. One accent, reserved for trust, never decoration. The instinct — already present
in today's app — to write an honest empty/trust state rather than paint over an absence. The
Build/Run/Outputs/Observe shape of a Worker. The fact that a configuration screen can still
state business value without needing a live number to justify it.

### C. What is currently wrong

The product's visual register (dark, forced, OKLCH) is not this reference's register at all —
confirmed now, not assumed. The Skill Card in the real product is a name in a list; the
reference's Skill Card is the richest, most complete idea in the whole frame, and the domain
data to power it has existed since Phase D with nobody rendering it. Policies and Autonomy are
modeled more thinly in code than the reference implies they should be. A "⌘K" control exists
and does nothing.

### D. What should be improved

Bring the Policy and Autonomy models up to the reference's richness (named rules with an
approver role; numbered autonomy levels with capability statements) — this is domain work,
independently startable, not gated on final visual tokens. Consolidate the duplicated stat-tile
and empty-state components before adding more surfaces that would duplicate them a third time.

### E. What should be built next

In dependency order: finalized design tokens from this reference → the Skill Card rebuild
(highest leverage, zero domain work left to do) → the Worker Studio container rebuild → then,
separately and not blocking either, the Policy/Autonomy domain refinement.

### F. The exact first UX implementation

**The Skill Card.** It's the smallest, most self-contained piece of this reference; every field
it needs already exists in `lib/agent/types.ts`/`SkillEvaluation`/`MetricEmission`; and getting
it right first gives every later screen (Studio, and eventually Opportunity/Decision) a proven
component to reuse rather than a fourth reimplementation of "a card with some facts on it."

### G. The exact next implementation prompt

*(For when you're ready — not started automatically.)*

> Implement the Skill Card as a new, single, reusable component
> (`components/skills/skill-card.tsx`), grounded in `docs/ux-reference-analysis.md` §6–7 and
> the reference image's Skill Card anatomy: title + description + an ENABLE/enabled control,
> a three-column Needs/Produces/Business Value grid, and a "confidence basis · risk" line.
> Source every field from the real `SkillDefinition`/`SkillEvaluation`/`MetricEmission`
> contract (Phase D) — never invent a prop this component can't get from real domain data.
> Do not yet apply final color/type tokens (mark them with clearly-named CSS variables a token
> pass can fill in later) and do not touch Worker Studio's container layout, navigation, or any
> other screen. Replace only the one call site in `components/studio/worker-canvas.tsx:173`
> that currently renders a Skill as a bare name. Validate: tsc, existing tests, a screenshot
> comparison showing the new card next to the reference image, and confirm every other screen
> is pixel-unchanged. Commit as one slice. Report before touching anything else.
