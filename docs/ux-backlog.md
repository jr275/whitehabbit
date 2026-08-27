# UX Backlog — current UI reviewed against the Design Constitution

Living document. Reviewed against `docs/ux-design-constitution.md`, grounded in the actual
rendered UI (screenshots from the original audit, re-verified against source for every file
touched by Phase A/B/D — Phase D changed zero UI files; Phase B's UI changes were
screenshot-diffed pixel-identical except the nav item removed). Nothing here is fixed yet, per
instruction — this is the map, not the repair.

---

## Where the current UI already complies

- **Empty states (§13).** "No outputs yet — nothing is fabricated here," "This Worker has not
  received an objective yet" — already exactly the standard the constitution asks every future
  empty state to meet.
- **Error states (§15).** Typed reason codes (`missing_credential`/`invalid_credential`/
  `provider_error`/`execution_error`) already surface distinctly, not as one generic failure.
- **Motion (§10).** The one animation reviewed (`animate-output-in`, a one-shot arrival for a
  genuinely new output) matches the principle exactly; nothing looping or ambient was found.
- **Agent experience (§19).** No chatbot UI exists anywhere in the real product — confirmed
  again, still true.
- **Visual language / anti-patterns (§5, §30).** Phase B's removal of the fabric-organism layer
  and the fixture Insights command center already resolved the original audit's "three
  unreconciled visual registers" finding — there is now one visual register in the real product,
  not three. This is real progress the constitution should recognize, not re-flag as a gap.
- **Component reuse instinct (§11).** Studio's Skill/Tool/Behavior cards are already one
  component reused consistently across the canvas — the instinct is right, just not yet pointed
  at the richer Phase D contract (see P1 below).

## Where it conflicts — prioritized backlog

### P0 — fundamental product experience issues

1. **No economic value anywhere on the real home dashboard.** `components/home/product-home.tsx`
   shows Workers / Active runs / Outputs / Success rate / Issues — all operational counts, zero
   dollar figures. Directly violates §4 (Information Hierarchy) and §27 (CFO Experience,
   questions 3 and 6). The plumbing to fix this already exists
   (`lib/workforce/business-results.ts`, live in Outputs Hub) — it's simply not surfaced here.
2. **Approvals cannot be actioned.** `components/workforce/live-operations-page.tsx`'s Approvals
   view states outright: "Approval decisions are read-only in this release... Mutating controls
   are intentionally unavailable." Directly violates §24 (Approval Experience) — a read-only
   approval queue is explicitly named there as worse than none.
3. **Opportunity and Decision have no experience to review yet**, because the entities don't
   exist (Phase G, not started). Naming this now, in the constitution's terms, so §22–23 are
   ready to hold the first real implementation to account the moment that phase starts.

### P1 — major UX issues

4. **The Skill Card doesn't use the Phase D contract yet.** `components/studio/worker-canvas.tsx`
   (line 173) renders an enabled Skill as nothing more than its catalog name in a list — no
   category, no risk, no confidence. `SkillDefinition` now carries `riskLevel`, `version`,
   `status`, and `SkillEvaluation.breakdown`'s five confidence dimensions — none of it reaches
   this component. Violates §21 directly, and is the clearest case in the whole product of the
   Architecture↔UX principle in §30 ("if the frontend needs to infer... from raw implementation
   data, the contract is wrong") running the other way: the contract is right, the UI hasn't
   caught up to it.
5. **Business value, where it does appear, doesn't show economic state.**
   `components/outputs/provenance-badge.tsx` renders `ResultProvenance` only — `economicState`
   (added in Phase D, on `MetricRecord`) has no corresponding badge anywhere. This is a direct,
   concrete violation of §17–18: right now, a business metric in Outputs Hub can only ever say
   *where* a number came from, never *how real* it currently is.
6. **Some execution events render as raw technical names, inconsistently with the product's own
   better instinct elsewhere.** Correcting an imprecise claim from an earlier draft of this
   backlog: the curated views (`lib/workforce/selectors.ts`'s `todaysTimeline()`, Observatory's
   `flowStages()`) already narrate well — "Atlas completed 'Research trends' — quality 82%," not
   a raw event name. But the raw event feed does leak through unnarrated in two real places:
   `components/home/product-home.tsx`'s "Recent events" panel and
   `components/workforce/live-operations-page.tsx`'s Outcomes view both render
   `event.type.replaceAll("_", " ")` directly ("tool called," "reasoning started"). Violates §25
   and §30 only in these two spots — the fix is to apply the narration pattern the product
   already has right in `todaysTimeline()` consistently, not invent a new one.
7. **Four (now effectively two, post Phase B) overlapping worker-creation entry points** — Home
   "New Worker," Factory's blueprint flow, and Studio's "Assemble another" all do variants of the
   same job with no stated reason to prefer one. Violates §3 ("fewer, deeper entry points").

### P2 — refinements

8. **Primary nav still mixes finished and non-mutating-stub destinations at equal visual
   weight.** Approvals/Outcomes/Improve carry the same nav treatment as fully real destinations.
   Violates §3's "every destination is real or explicitly demoted."
9. **`/products` — arguably the single best-designed funnel in the app (real onboarding →
   honestly-scoped provisioned Worker) — still isn't linked from primary navigation.** A
   discoverability gap, not a quality one.
10. **`/library`'s Skill Card is more polished than the real Skill's**, and it's currently
    unlinked rather than pointed at real data. Low urgency since it's already out of primary
    nav (per the Phase B decision), but worth remembering once real financial Workers exist to
    populate it with real cards instead.

### P3 — polish

11. No items identified at this priority yet that aren't already covered by, or contingent on,
    the Cursor reference below. Revisit once P0–P2 close.

## Deferred until the Cursor reference arrives — not backlog items, not to be actioned now

These aren't "conflicts" to fix — they're visual-register decisions the constitution
explicitly declines to make on its own (see the document's preamble and §5, §6):

- The dark-only, hard-forced color scheme, and whether it's the baseline to refine or a
  superseded intermediate register.
- Concrete palette, typeface, and spacing scale.
- Command Center and Worker Studio's actual visual layout (content specs for both already exist
  in `docs/product-experience-blueprint.md` §16–17, ready to be dressed once the reference
  lands).
