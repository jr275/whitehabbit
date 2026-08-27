# Uncle Scrooge — UX Design Constitution

**Status: the permanent design and UX contract for this product.** Every future screen,
component, and interaction is measured against this document. It does not expire when a phase
ends the way a phase report does — amend it deliberately, don't let it drift silently.

**What this document deliberately does NOT do:** specify a color palette, a typeface, exact
spacing values, or a component library. Those are the Cursor reference's job, once it arrives —
this document defines the *rules* any such palette/typeface/system must satisfy, not the
tokens themselves. Nothing below should be read as an implicit visual decision; where a
principle could be mistaken for one, it says so explicitly.

---

## 1. Product experience thesis

Uncle Scrooge continuously observes a company's financial reality and turns what it finds into
decisions a human can trust and act on. The user never operates the underlying machinery
directly — they experience a Worker's findings, the economic value at stake, what's
recommended, what needs their approval, and what actually happened. The product is judged by
how quickly and calmly it gets a financially literate, non-technical executive from "what
changed" to "what should I do about it."

## 2. Design principles

- **Preserve before replacing.** The Cursor reference (once provided) is the baseline to evolve,
  not a suggestion to reinterpret. Nothing ships in a style the reference hasn't sanctioned.
- **Restraint is the premium signal**, not richness of decoration. Quiet, confident, editorial —
  never loud, never "AI-flavored" for its own sake.
- **One considered accent, used sparingly.** Everything else is neutral structure.
- **Evolve, don't reinvent.** A screen that already works (per the review in
  `docs/ux-backlog.md`) gets refined, not rebuilt from a blank page.

## 3. UX principles

- Business value always outranks operational activity in any hierarchy, on any screen.
- Fewer, deeper entry points beat many shallow, overlapping ones.
- Every destination in primary navigation is either real and mutable, or explicitly
  marked/demoted — never a dead end at equal visual weight with a finished screen.
- The question for every screen is **"what is the user trying to understand or accomplish
  here"** — never "what data can we show" or "what would look sophisticated."

## 4. Information hierarchy

```
ECONOMIC VALUE
  ↓
OPPORTUNITY
  ↓
DECISION
  ↓
ACTION
  ↓
RESULT
  ↓
EVIDENCE
  ↓
TECHNICAL DETAIL
```

Technical telemetry (tokens, model names, execution ids, tool call logs) is available, never
hidden — but it never sits above economic value on any screen, and it's never the first thing a
user sees when a screen loads.

## 5. Visual language

Principles, not tokens (concrete palette/typeface await the Cursor reference):

- Structure comes from thin lines and spacing, not heavy borders, shadows, or filled panels.
- Ornament is earned, not default — a screen with nothing to decorate should stay undecorated.
- Density and hierarchy are not in tension: a calm screen can still be information-dense if the
  hierarchy is doing its job.
- The product should never be mistaken, at a glance, for a generic AI chat product, a developer
  console, an ERP, or a banking app — see §30 for the explicit anti-pattern list.

## 6. Typography principles

- A small, clear type scale — few sizes, each with an obvious job (data, label, body, heading).
- Weight communicates hierarchy deliberately, not habitually — not every heading needs to be
  the boldest thing on the screen.
- Uppercase, tracked labels are reserved for short structural text (eyebrows, status tags) —
  never for anything a user has to actually read at length.
- Numerals that will ever be compared (a table, a metric, a trend) are always tabular.
- Concrete typeface pairing is deferred to the Cursor reference review.

## 7. Spacing principles

- Spacing encodes grouping — related things sit close, unrelated things don't, with no need for
  a border to say so.
- One consistent spacing scale, used everywhere, not invented per-screen.
- Density should flex by purpose: an execution ledger can be dense; a single Opportunity a CFO
  is deciding on should have room to breathe.

## 8. Density principles

- Default to high information density — this is an executive operating tool, not a marketing
  page — but density without hierarchy is just clutter. A screen of forty equally-weighted rows
  is flat, not dense.
- If a screen needs to hide information to feel calm, the problem is the hierarchy, not the
  amount of information.

## 9. Color principles

- One accent color for interactive/brand elements.
- A small, fixed semantic set (good / warning / critical / muted) reserved *only* for state —
  never reused as decoration, never doubling as the brand accent.
- Color is information. If removing all color from a screen would make it unreadable rather
  than just less pretty, color is being used to carry meaning it shouldn't be the only carrier
  of (see §29, Accessibility).

## 10. Motion principles

- Motion communicates a state change — something loaded, something completed, something newly
  arrived — never decoration.
- No animation exists without a reason a user could state back.
- A one-shot arrival animation for a genuinely new item is fine; a looping or ambient animation
  is not, unless it represents genuinely live, ongoing activity.
- `prefers-reduced-motion` is always respected.

## 11. Component principles

- One component per concept, reused everywhere that concept appears — a Skill Card is the same
  component in Studio, in a Worker's detail view, and anywhere else a Skill is shown.
- Reuse before inventing. A new visual pattern needs a reason the existing ones don't cover.
- A component's visual weight matches its data's importance to the business, never its
  convenience to implement.

## 12. Data visualization principles

- A chart exists to help a specific decision — if you can't state the decision it helps make,
  it's texture, not visualization, and it doesn't belong.
- Every number that matters must be legible as a number first; the chart is support, not the
  only way to read it.
- A sparkline or small trend indicator gets the same design care as a full chart — no
  second-class treatment for small data.

## 13. Empty states

- Every empty state says what *would* appear there and why it's currently empty — never a bare
  "no data." The product's existing pattern ("No outputs yet — nothing is fabricated here") is
  the standard every future empty state is held to.
- An empty state is a teaching moment about the product, not a dead end.

## 14. Loading states

- Distinguish "fetching something that already exists" from "real work is in progress right
  now" (a running Execution is not the same experience as a page load) — the two must never
  look identical.
- Never fabricate a plausible-looking skeleton for a shape that isn't actually known yet.

## 15. Error states

- Every error states its real, specific reason — this product's domain layer already
  distinguishes `missing_credential` / `invalid_credential` / `provider_error` /
  `execution_error`; no future UI may collapse that back into a generic "something went wrong."
- An error is never a dead end — it says what would resolve it.

## 16. Success states

- Success is stated in business terms first ("Cash Position Monitor found 2 things worth your
  attention"), technical terms second ("execution completed").
- A success state never implies more certainty than the underlying provenance/economic-state
  actually support (see §17–18) — completion is not the same claim as verification.

## 17. Trust / provenance presentation

The domain layer keeps two dimensions deliberately separate (`docs/financial-domain.md`), and
the UI must never collapse them back into one:

- **Data provenance** — where the information came from (`real` / `connected` / `demo` /
  `simulated` / `not_connected`).
- **Economic state** — how far the resulting dollar figure has actually progressed
  (`estimated` / `approved` / `executed` / `realized` / `verified`).

Both must be visible together wherever a number appears that isn't obviously and permanently
real. `connected` must never *read* as `verified`. `real` provenance must never *read* as
`realized` economic state. If a future screen can only show one of the two, that screen is
wrong, not the model.

## 18. Economic value presentation

- Every dollar figure states its economic state in words next to it, not only through color —
  color alone is not sufficient (see §29).
- A bigger, less-certain number must never visually outweigh a smaller, more-certain one. An
  estimated $2M opportunity does not get to look more solid than a verified $80K result.
- A demo or simulated value is marked at the exact point it's displayed — never only in a
  legend or badge far from the number itself.

## 19. Agent experience

The mandatory narrative shape for anything the product surfaces on its own initiative:

```
I found something.
→ Here is why it matters.
→ Here is the evidence.
→ Here is the potential value.
→ Here is what I recommend.
→ Here is what requires your approval.
→ Here is what happened.
→ Here is the verified result.
```

Never a blank "what would you like me to do?" prompt as the primary interface. This is an
intelligent financial operator, not a chat window.

## 20. Worker experience

```
WORKER → PURPOSE → SKILLS → TOOLS → POLICIES → AUTONOMY → OUTPUTS → EXECUTIONS → ECONOMIC VALUE
```

Every one of these must be answerable by looking at a Worker, without needing to understand
its technical implementation and without opening a second screen for the basics.

## 21. Skill experience

The Skill Card must communicate, without navigation: **what it does, what it needs, what it
produces, business value, confidence, risk, provenance, economic state.** Phase D's domain
layer (`lib/agent/types.ts`'s `SkillDefinition`, `SkillEvaluation`, `MetricEmission`) already
carries every one of these fields as a typed contract — the constitution's requirement is that
the UI renders that contract directly. If a future Skill Card needs to reconstruct any of this
from a tool list or raw JSON, the contract has a gap, not the UI.

## 22. Opportunity experience *(entity not yet built — Phase G)*

An Opportunity always shows its evidence and estimated economic value together, in the same
view — never as a bare alert. It is always traceable back to the specific Worker, Skill, and
Execution that surfaced it.

## 23. Decision experience *(entity not yet built — Phase G)*

A Decision shows what was chosen, why, which Policy governed the choice, and whether Approval
was required — all before it shows any outcome. A Decision is written before its Execution
starts, never reconstructed afterward from the Execution's own log.

## 24. Approval experience *(entity not yet built — Phase G)*

If Approval is shown at all, it must be actionable there. A read-only approval queue is worse
than none — it implies a control that doesn't exist. Every approval ask states exactly what
will happen if it's granted, in plain language, before the click.

## 25. Execution experience

Narrate, don't log. Every technical event has a plain-English restatement ("found 6 sources,"
not `tool_called`). Cost and duration are real and always available, but secondary to what was
actually found.

## 26. Business output experience

A Business Output shows **Finding → Evidence → Economic Impact → Recommendation → Confidence →
Risk → Provenance → Economic State** together, matching the shape the financial skills already
produce (`docs/financial-domain.md`) — never flattened into a single paragraph that loses the
distinctions.

## 27. CFO experience

The home experience must let a CFO answer, quickly, whenever the underlying data supports it:

1. What is Uncle Scrooge doing?
2. What did it find?
3. What matters financially?
4. What needs my attention?
5. What can I do about it?
6. What value is at stake?

If a screen can't answer these when the data exists to answer them, reconsider the screen, not
the questions.

## 28. Responsive experience

Density that works at desktop must degrade to hierarchy, not clutter, on a smaller viewport —
never horizontal scroll for primary content. A CFO checking from a phone must still reach the
top of the hierarchy (economic value, what needs attention) even where technical detail waits
for a desktop session.

## 29. Accessibility principles

- Every state (good/warning/critical) is legible without color alone — an icon or label always
  accompanies it, never color by itself.
- Focus states are always visible; keyboard navigation always works.
- `prefers-reduced-motion` is always respected.
- Contrast requirements apply regardless of whatever palette the Cursor reference introduces —
  the reference is evaluated against this constraint, never exempted from it.

## 30. Anti-patterns — permanent product law

Never:

- Add UI because data happens to exist for it.
- Show technical metadata simply because it's available.
- Default to a card grid when a stronger information hierarchy would serve better.
- Add a chart without a decision it helps the user make.
- Use AI-flavored language to make something feel more intelligent than it is.
- Use animation as decoration.
- Hide important economic information behind more than one click.
- Expose implementation complexity as if it were product complexity.
- Let a frontend infer business value, confidence, risk, provenance, economic state,
  recommendation, decision, or approval from raw implementation data — if that inference is
  needed, the domain/API contract is wrong, not the UI (see §21).
- Fabricate an integration, a result, or an execution that didn't happen.
- Put business logic in a component, or call an LLM directly from one.

## Design review system

From this point forward, every major frontend implementation gets two separate reviews:

- **Implementation review** — does it work?
- **Experience review** — is it good? Judged on clarity, hierarchy, cognitive load,
  discoverability, actionability, trust, visual quality, consistency, responsiveness, and
  accessibility. This second review is mandatory, not optional, and happens separately from
  the first.
