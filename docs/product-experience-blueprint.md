# Uncle Scrooge — Product Experience Blueprint

**Status: planning document only. No product code changes.** Written against the repository
as it stands after Phase A (domain mapping) and Phase B (dead-code + fixture-surface
consolidation) — commits `7bc1787`…`51f197c` on `claude/uncle-scrooge-audit-gw66i8`. Every
claim below was checked against the current source, not carried forward from memory of the
earlier audit.

This document is deliberately **visual-decision-free**. Wherever a proposal touches layout,
color, type, spacing, or component styling, it's marked as waiting on the Cursor reference
(§8). What it does settle: what the product's screens should be *about* — what a user is
trying to understand or accomplish on each one — so that once the visual reference arrives,
design work has a real content spec to dress, not a blank page.

---

## 1. Current product state

The repository, today, is a single, real, Postgres-backed AI-agent product for **marketing,
SEO, content and customer-conversation work**, still shipping under the name "Menlo
Whitehabbit — AI Agent Factory." Phases A and B removed the five competing worker
vocabularies the original audit found; one canonical model remains
(`lib/workforce/*` + `lib/agent/*`), with six real, executable skills, real auth
(bcrypt + NextAuth v5), real multi-tenancy (org membership re-verified per request), and a
real approval gate that gates any write/publish/delete/financial/external-communication tool
action before it runs.

Nothing about the **domain** (marketing/growth) or the **visual register** (dark control-room)
has changed yet — that work is explicitly on hold per this conversation. What changed is that
the codebase now has one worker model instead of six, and the two fixture surfaces that used
to sit at the same visual finish as the real product (`/insights`, `/library`) are either gone
or pulled from primary navigation.

One thing worth surfacing that the original audit undersold: **a real "Business Impact" layer
already exists**, live, in `lib/workforce/business-results.ts` — a `SUPER_AGENT_PROFILES`
table with nine vertical profiles (Sales, Marketing, Customer Success, Support, **Finance**,
Operations, HR, E-commerce, Revenue & Growth), each declaring named business metrics
(`BusinessMetricDefinition`: key, label, unit, source, activation reason). The **Finance**
profile already declares `savings` ("Verified savings", $) and `forecast_accuracy` ("Forecast
accuracy", %) as its two headline metrics. This is wired into the real Outputs Hub today
(`components/outputs/outputs-hub.tsx`, `output-drawer.tsx`) via `businessResults()`, which
joins a worker to its profile and shows each metric's real value, or an honest "not connected"
state with the exact reason, sourced from real `MetricRecord` rows. It is currently empty for
every real worker, because no financial Skill exists yet to write to `savings` or
`forecast_accuracy` — but the shape, the labels, and the honest-provenance plumbing
(`ResultProvenance`: `real | connected | demo | simulated | not_connected`, computed by
`provenanceForExecution()` from a real execution's `executionMode`, never guessed) are already
correct and already load-bearing. This is a foothold worth more than the "FIN" library card —
it's live code, not a fixture.

## 2. Current information architecture

| Group | Items | State |
|---|---|---|
| Workspace | Overview (`/`), Workers (`/workforce`), Runs & Outputs (`/outputs`), Approvals (`/approvals`) | All real; Approvals is read-only by design (no resume endpoint yet) |
| Build | Worker Studio (`/studio`), Factory (`/factory`) | Real; two overlapping worker-creation entry points |
| Connect | Integrations (`/integrations`) | Real UI, no real connectors implemented yet |
| Observe | Observatory (`/observatory`), Outcomes (`/outcomes`), Improve (`/evolve`) | Real routes, but Outcomes/Improve are non-mutating stubs ("insufficient evidence" / "mutation blocked until an API exists") |
| Not in nav | Skills (`/library`, unlinked per your Phase B decision), Products (`/products`, never linked) | Both reachable only by direct URL |

Ten nav items today (down from eleven). The dead-end-stub problem the original audit flagged
is unchanged: Approvals, Outcomes and Improve occupy the same visual weight as fully real
screens while offering no mutation path. That's a content/behavior problem, not a visual one —
it doesn't need to wait for the Cursor reference to be *designed* logically (§9), even though
its final look does.

## 3. Current design system

Dark-only, hard-forced (`color-scheme: dark` on `:root`, no toggle). OKLCH tokens, Geist
Sans/Mono, one restrained blue-violet accent, 1px hairline borders, mono uppercase tracked
eyebrows, tabular numerals on every metric. This register is genuinely calm and premium where
it's finished (Worker Studio, Outputs Hub, Worker detail) — it is **not** being replaced by
assumption, and it is **not** being extended with new screens either, until the Cursor
reference tells us whether it's the baseline to evolve or a legacy register the Cursor
implementation superseded. Every screenshot in the original audit remains an accurate
record of it.

## 4. Current UX strengths

Unchanged from the original audit, now with one addition:

- Honest empty states everywhere reviewed ("No outputs yet — nothing is fabricated here").
- Worker Studio's three-pane control room already models Worker → Skills → Tools → Behavior →
  Autonomy correctly.
- Real approval-gate-before-action (`ApprovalRequiredError`), typed failure reasons, immutable
  Build/Release versioning.
- **Newly surfaced:** a real, honestly-provenanced Business Impact layer
  (`business-results.ts`) already exists and is already rendered in Outputs Hub — this is
  further along than the original audit gave it credit for.

## 5. Current UX weaknesses

Unchanged from the original audit — Phase B removed duplicate/fake *surfaces*, it did not
change any real screen's content or behavior:

- No dollar figure anywhere on the home dashboard (Overview), even though `business-results.ts`
  now proves the plumbing for one already exists one click away, in Outputs.
- Approvals cannot be actioned — the DECIDE → APPROVE step is a dead end.
- The real Skill contract (`requiredTools`, `constraints`, the evaluation rubric) is invisible
  in Studio before a run.
- Execution events render as technical names ("tool_called") instead of narrative English.
- Two redundant worker-creation entry points remain (Home → Factory, and Studio's "Assemble
  another") after Phase B removed the other two.
- `/products` — the single best-designed onboarding funnel in the app — still isn't linked
  from anywhere a new user would find it.

## 6. Current domain foundation

The canonical spine, unchanged by this document, documented in full in
`docs/domain-model.md`:

```
Worker (identity, mission, objectives, skills, tools, behaviors, channels, outcome, autonomy)
  → WorkerVersion (immutable Build/Release snapshot)
  → Task → Execution (typed status, reason code, cost, tokens, executionMode)
    → Event (typed runtime event stream)
    → Output (structured result + sources + evaluation)
      → BusinessEvent → MetricRecord (kind: operational | quality | cost | business)
```

Plus, now correctly credited: `business-results.ts`'s `SUPER_AGENT_PROFILES` /
`BusinessResultCard` / `ResultProvenance` layer sitting on top of `MetricRecord`, and the
`BehaviorRule` + tool-permission-tier system that already implements a working (if not yet
named-entity) Policy concept. Opportunity, Decision, and a resumable Approval entity remain
unbuilt — see `domain-model.md` §4 for the exact gap list.

## 7. What Phases A and B enable

Not new capability — a clean surface to design against:

- **One worker model.** Any future screen has exactly one data shape to be honest about,
  instead of six competing ones at different levels of realism.
- **No fake surface at the real product's finish level.** `/insights` is gone; `/library` is
  quarantined. Whatever the Cursor reference turns out to specify, it will be applied to real
  screens only — there's no parallel "vision" surface left to accidentally make more convincing
  than the real thing.
- **A smaller, named blast radius.** `docs/domain-model.md` is now the one place that says what
  exists and what doesn't — future design work can point at it instead of re-deriving it.
- **Business Impact plumbing surfaced, not invented.** §1's discovery means the future
  financial Command Center and the future Cash Intelligence Worker's metrics don't start from
  zero — they extend `business-results.ts`'s existing Finance profile and provenance model.

## 8. What should wait for the Cursor reference

Explicitly on hold, per this conversation, until the reference arrives:

- Color palette and light/dark decision.
- Typography (typeface pairing, scale, weight).
- Spacing and density system.
- Iconography and any new component's visual styling.
- Logo / wordmark / brand mark.
- The actual pixel layout of the Command Center, Worker Studio, and Skill Card.
- Any decision about whether the current dark control-room register is the baseline to evolve
  or a superseded intermediate step.

**Not blocked**, because none of it is a visual decision:

- Domain modeling, schema design, and migrations (Opportunity/Decision/Approval-as-entity,
  metric taxonomy extension).
- Skill business logic (a real Cash Intelligence Worker's `execute()`/`evaluate()`/`metrics()`).
- API contracts (a real approve/deny/resume endpoint).
- The *logical* information architecture — which concepts group together and in what order
  (§9) — as distinct from how that grouping is ever rendered.
- Terminology and PT-BR copy decisions, captured as content specs (§12), not styled mockups.
- Test infrastructure (tenant isolation, policy, approval-state tests).

## 9. Proposed product information architecture (logical, not visual)

Reordering the *content hierarchy* to match the brief's own required stack — Business Impact →
Opportunities → Decisions → Actions → Risks → Executions → Technical telemetry — without
touching how it's styled:

| Level | Concept | Today | Proposed |
|---|---|---|---|
| 1 | Business Impact | Exists in Outputs, not Overview | Surface on Overview/Command Center, above operational counts |
| 2 | Opportunities | Doesn't exist | New section, once the entity exists (Phase G) |
| 3 | Decisions | Doesn't exist | New section, tied to Opportunities |
| 4 | Approvals/Actions | Read-only stub | Made real (resume endpoint), kept as its own destination |
| 5 | Risks | Doesn't exist as a named concept | Folded into Opportunity/Decision cards initially, not a separate top-level nav item yet — avoid overbuilding IA for an entity that doesn't exist |
| 6 | Executions | Real, in Outputs/Observatory | Kept, narrated better (§15) |
| 7 | Technical telemetry | Mixed into Observatory today | Pushed below Executions, never above it |

This is a grouping proposal, not a nav redesign — the actual widths, colors, and placement of
any of this waits for §8.

## 10. Proposed user journeys

1. **CFO morning check.** Command Center → sees Verified Value / Potential Value / Liquidity
   Risk at a glance → opens the one Opportunity that needs attention → reads why it matters and
   what's recommended → approves or asks a question → done in under a minute.
2. **Treasury analyst configuring a Worker.** Products or Studio → picks/builds a Cash
   Intelligence Worker → sets policies (thresholds, autonomy) → runs it in demo mode → reviews
   the Skill Card's stated confidence and risk before trusting the output.
3. **Controller investigating a flagged anomaly.** Outputs → opens one Execution → sees the
   evidence (which invoices, which accounts) → sees the Estimated value → traces forward to
   whether it was ever Approved/Executed/Verified (§19) → never mistakes one stage for another.
4. **First-time setup.** `/products` (once linked — see §5) → answers real onboarding
   questions about the business → gets a provisioned, honestly-scoped Worker → runs it for the
   first time from a state that explains what it will and won't do yet.

## 11. Proposed Worker experience

Preserve Studio's Build / Run / Outputs / Observe structure (already correct, already what
this conversation asked to keep), and make each tab answer a specific question with real data:

| Tab | Answers |
|---|---|
| Build | What does this Worker do, know, and is allowed to do? (identity, mission, skills, tools, policies, autonomy) |
| Run | What is it doing right now, and what triggered it? |
| Outputs | What did it produce, what's it worth, and how sure are we? |
| Observe | Is it healthy, how has it changed over time, and what value has it produced in total? |

Every one of the brief's ten Worker questions (§7 of the original brief) already maps onto an
existing or clearly-scoped field — none require a new abstraction, only better surfacing of
what `WorkerDefinitionSnapshot` and the runtime already carry.

## 12. Proposed Skill experience

Reuse `components/library/worker-card.tsx`'s card anatomy — the audit's own finding was that
it's the best-designed Skill Card in the repo — and point it at the real `SkillDefinition`
contract instead of `lib/library/prefabs.ts`'s fixture data. Content spec (PT-BR, per your
mega-prompt §20), not a styled mockup:

> **Previsão de Caixa**
> Necessita: Saldos bancários, Recebíveis, Pagáveis, Histórico de fluxo de caixa
> Produz: Forecast de 13 semanas, Risco de liquidez, Necessidade de funding
> Valor: Previne choques de liquidez, Reduz caixa ocioso, Otimiza funding
> Confiança: [from the real `evaluate()` rubric] · Risco: [from the real tool permission tier]

No skill needs a new UI component invented for this — it needs the existing card pointed at
real fields (`requiredTools`, `constraints`, `SkillEvaluation.breakdown`) that the backend
already computes but the UI doesn't render yet.

## 13. Proposed Opportunity experience

New entity (Phase G). Card anatomy: signal detected → why it matters (one sentence, plain
language) → estimated economic value (tagged `estimated`, never bare) → confidence → the
Worker/Skill/execution that surfaced it → the recommended Decision. No Opportunity should ever
render without a link back to the real execution evidence that produced it — no
opportunity-shaped copy without a receipt.

## 14. Proposed Decision experience

New entity (Phase G), tied 1:1 to an Opportunity. Anatomy: the options considered (even if
"act" vs "don't act" is the only pair at first), which one was chosen and why, which Policy
governed the choice, and whether it required human Approval before it could proceed. A
Decision record is the audit trail between "we noticed something" and "here's what we did about
it" — it should never be inferred after the fact from an Execution row; it should be written
before the Execution starts.

## 15. Proposed Execution experience

Same underlying `WorkerEvent` stream, narrated instead of logged: "found 6 sources" instead of
"tool_called," "forming a recommendation" instead of "reasoning_started." Every execution
should visibly answer: what ran, what it used, what it found, what it cost, and — critically —
whether it's real, demo, or simulated, using the existing `ResultProvenance` tagging rather than
inventing a second label system.

## 16. Proposed Business Output experience

Extend, don't replace, `business-results.ts` and Outputs Hub. Add the value-stage ladder from
your mega-prompt (§16 there):

```
ESTIMATED VALUE → APPROVED VALUE → EXECUTED VALUE → REALIZED VALUE → VERIFIED VALUE
```

as a field on `BusinessResultCard` sitting *beside* `ResultProvenance`, not replacing it —
they answer different questions. Provenance answers "where did this number come from" (real
execution vs. demo fixture vs. simulation). Value stage answers "how far has this dollar figure
actually travelled toward being real cash" (a Worker's hypothesis vs. a human-approved
estimate vs. money that has actually moved vs. a number reconciled against a bank statement).
A number can be `real` provenance and still only `estimated` stage — an actual execution
genuinely produced this estimate, it just hasn't been verified yet. Conflating the two is
exactly the failure mode §22 of your mega-prompt warns about ("R$480.000 gerados" when it
should say "SIMULAÇÃO — valor potencial: R$480.000").

## 17. Proposed Command Center experience

Content spec, not layout: above the fold, sourced from real data already available today plus
the new entities from Phases G–J —

1. Total Verified Value, Potential Value, Value Realized (from the extended `business-results.ts`)
2. Cash Position / Liquidity Risk (once the Cash Intelligence Worker exists)
3. Open Opportunities, Pending Decisions, Pending Approvals (once those entities exist)

Below the fold, not above it:

4. Worker performance, execution health, connector health, technical telemetry (already exists,
   already real, just needs to stay subordinate)

This is the same hierarchy §9 describes, applied to one specific screen.

## 18. CFO first-10-seconds experience

Restating the original audit's test as forward-looking acceptance criteria — a future Command
Center is not done until a first-time CFO user can answer all six from the home screen alone,
with real (possibly zero) data, no fixtures:

1. What is this? — a one-line value proposition, not a category label like "AI workforce operations."
2. What is it doing? — active runs, already well-designed today, keep it.
3. What did it discover? — requires Opportunity (Phase G) to exist.
4. How much economic value is involved? — requires §16/§17's extension to be live on this screen, not just in Outputs.
5. What requires my attention? — requires real Approvals (resumable) to have teeth.
6. What action can I take? — a business decision, not just a configuration action ("New Worker").

## 19. Trust / explainability model

The single most important section in this document, because it's the one place a mistake would
actually hurt a financial product's credibility. Two orthogonal, both-necessary taxonomies,
neither replacing the other:

**Provenance — where did this number come from.** Already exists, already correct, extend
rather than reinvent:

```
real → connected → demo → simulated → not_connected     (ResultProvenance, business-results.ts)
```

Add, per the original brief's §15: `forecast`, `user_provided`, `external_benchmark` — three
provenance states the current five-value enum doesn't yet distinguish, needed once the Cash
Intelligence Worker ingests customer-provided figures or a benchmark dataset.

**Value stage — how real is this dollar figure, right now.** New, per §16 above:

```
ESTIMATED → APPROVED → EXECUTED → REALIZED → VERIFIED
```

Every dollar figure anywhere in the product must be able to answer both questions at once. A
`$480,000` estimate from a real execution (provenance: `real`) that a human hasn't looked at
yet (stage: `estimated`) must never render more confidently than a `$230,000` figure that's
been reconciled against a bank statement (stage: `verified`) — regardless of which number is
bigger. The UI's job is to make the smaller, verified number feel more solid than the larger,
estimated one, every time, with no exceptions carved out for "but the estimate is exciting."

## 20. Design principles

- Preserve before you replace — evolve the Cursor reference, don't re-imagine it.
- One visual register at a time; no new screen ships in a style the reference hasn't sanctioned.
- Restraint over decoration: the existing hairline-border, single-accent, tabular-numeral
  grammar already achieves "premium, calm, editorial" — new screens should meet that bar, not
  invent a new one.
- Every screen answers "what is the user trying to understand or accomplish here," never "what
  data can we show."

## 21. UX principles

- Business value outranks operational activity in every hierarchy, every time.
- No screen may imply more certainty than its underlying provenance + value stage support.
- Fewer, deeper entry points over many shallow ones (Studio owns worker creation; Factory
  either becomes Studio's front door or is retired, not both indefinitely).
- Every stub destination (Approvals, Outcomes, Improve) is either made real or demoted from
  primary nav — it may not sit at equal visual weight with a finished screen forever.

## 22. Product principles

- Uncle Scrooge is an operating system for financial decisions, not a chatbot, not an ERP, not
  a BI dashboard. Every screen should be judged against that thesis, not against feature count.
- Start with one excellent Worker before building a marketplace of them.
- A Worker's autonomy ceiling is a policy decision, never a default the product assumes on the
  user's behalf.

## 23. Technical principles

- One canonical model per concept, always (this is the entire point of Phases A/B — never
  regress on it).
- Business logic lives in the domain layer (`lib/agent/*`, `lib/workforce/*`), never in a
  component or a direct LLM call from the UI.
- Every new entity gets its own migration, its own commit, its own test — no big-bang schema
  changes.
- No fabricated executions, integrations, or financial results, ever — the existing discipline
  in `lib/agent/types.ts` (typed reason codes, `executionMode` tagging, real `isConnected()`
  checks) is the bar every new Skill must clear.

## 24. What we should never build

Per your explicit instruction, restated as this document's own commitment: no fake
integrations, no fabricated financial results, no claimed executions that didn't happen, no
speculative domain entities added because a roadmap mentions them, no distributed
infrastructure this product doesn't need yet, no marketplace before there's more than one real
Worker to put in it, no attempt to implement every ERP/connector before the `Connector`
abstraction itself is proven with one real adapter.

## 25. What we should never change without review

- The canonical Worker/Skill/Tool/Execution/Output/BusinessEvent/Metric model.
- The auth/session pattern (bcrypt, NextAuth, edge/node split, per-request org re-verification).
- The approval-gate-before-execution mechanism (`ApprovalRequiredError`).
- The immutable Build/Release versioning machinery.
- **Any visual, layout, or component-styling decision** — explicitly frozen pending the Cursor
  reference, including anything that might look like "just a small styling improvement."
- The scope and timing of the brand rename — held per this conversation until the reference
  arrives and the domain/visual decisions are made together, not piecemeal.

## 26. Phase C–L roadmap, with what can and can't proceed now

| Phase | Can proceed without the Cursor reference? | Notes |
|---|---|---|
| C — Financial Domain Foundation | **Partially.** Schema/vocabulary work yes; brand rename and any user-facing copy/visual change, no. | Held per this conversation |
| D — Worker Canonical Model | **Yes**, if scoped to strengthening the existing model (Policy-as-structured-object, Role/Permission) rather than new screens | |
| E — Demo Financial Data | **Yes** — pure data modeling, no UI | |
| F — Cash Intelligence Worker | **Yes** — `SkillDefinition` implementation, no new UI required to exist and be testable | |
| G — Opportunity / Decision / Approval | **Yes** for the entities/migrations/API; **no** for how they're displayed | |
| H — Activity/Input/Output Metrics | **Yes** — extends `MetricRecord.kind`, no UI dependency | |
| I — Business Outcome | **Yes** — extends `business-results.ts`, no UI dependency | |
| J — Verified Value | **Yes** — the value-stage ladder is a data model addition before it's a UI | |
| K — Command Center | **No** — this is the visual reference's job | |
| L — Worker Studio (visual pass) | **No** — same | |

This suggests a real path forward that doesn't stall on the missing reference: **Phases D
through J are almost entirely backend/domain work** that can proceed now, producing real,
tested, API-reachable functionality with no new screen design — leaving Phases C's
brand/visual pieces, K, and L to start the moment the Cursor reference arrives, applied to a
financial domain that's already real underneath.
