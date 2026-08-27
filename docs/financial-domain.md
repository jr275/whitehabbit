# Financial domain foundation (Phase D)

What Phase D built, why, and exactly how far it goes — written to be read
alongside `docs/domain-model.md` (the consolidation this phase builds on)
and `docs/product-experience-blueprint.md` (the experience this domain
layer exists to eventually support).

## What existed before this phase

One canonical Worker/Skill/Tool/Execution/Output/BusinessEvent/Metric
model (`lib/workforce/*` + `lib/agent/*`), six real skills, all in the
marketing/growth domain. A real "Business Impact" layer
(`lib/workforce/business-results.ts`) already existed with a `finance`
profile — declared but unwired, since no financial skill existed to
write to it.

## What this phase reused, unchanged

- The `SkillDefinition` contract (`execute`/`evaluate`/`metrics`) — every
  new financial skill is written to the exact same interface the six
  marketing skills use. No new skill abstraction was created.
- The `ToolDefinition` contract — the new Financial Data tool is one more
  entry in the same registry, not a new kind of thing.
- `lib/agent/runtime.ts`'s execution loop, persistence, and event
  streaming — untouched except for two additive fields threaded through
  (`dataProvenance`, `economicState`/`valueCategory`).
- `business-results.ts`'s `SUPER_AGENT_PROFILES` — extended (a third
  metric slot, honest labels), not replaced.
- The Studio/Outputs/Approvals UI — nothing in this phase touched a
  screen. The four new skills render through the exact same Skill Card,
  Outputs Hub, and execution timeline every existing skill already uses.

## What's new

### The trust model: two dimensions, never one enum

| Question | Type | Values | Lives on |
|---|---|---|---|
| Where did this number come from? | `DataProvenance` | `real \| connected \| demo \| simulated \| not_connected` | `WorkerExecution.dataProvenance`, canonically defined in `lib/workforce/model.ts` |
| How real is this dollar figure right now? | `EconomicState` | `estimated \| approved \| executed \| realized \| verified` | `MetricRecord.economicState` (only meaningful when `kind === "business"`) |

A metric can be `dataProvenance: "demo"` (an honest financial skill
reasoning over the fictional ledger below) while its future economic
state, once a real reconciliation loop exists (Phase J), could
independently become `approved` or `verified` — the two facts never
collapse into each other. Every business metric emitted by a skill
that doesn't explicitly set `economicState` defaults to `"estimated"`
in the runtime itself (`lib/agent/runtime.ts`) — a skill cannot
accidentally claim more than that.

### The demo financial ledger

One fictional company, "Lumen Distribution Co." (`lib/agent/data/
demo-financial-ledger.ts`): 3 bank accounts, 8 receivables, 6 payables,
and a 13-week cash-flow history — all hand-built to agree with each
other (the flow history's ending balance equals the sum of the bank
accounts; the receivables/payables totals are the ones a real forecast
would be built from). Never randomly generated, never contradictory.

Exposed through one new tool, `tool_financial_data`
(`lib/agent/tools/financial-data.ts`) — `isConnected()` is honestly
`true` (the demo capability really does always work), and its
`provider` name says "Demo Financial Ledger (fictional data)" so no
UI surface can mistake it for a real feed.

### Four financial Skills

| Skill | Id | Business metric it can emit |
|---|---|---|
| Cash Position Monitor | `skill_cash_position_monitor` | `liquidity_risk_exposure` ($, `risk_exposure_reduced`) |
| Cash Forecast | `skill_cash_forecast` | *(deliberately none — see below)* |
| Working Capital Opportunity Detection | `skill_working_capital_opportunity` | `savings` ($, `working_capital_released`) |
| Receivables Risk Detection | `skill_receivables_risk` | `liquidity_risk_exposure` ($, `risk_exposure_reduced`) |

All four share one JSON schema and one evaluator
(`lib/agent/skills/finance-shared.ts`) instead of four near-duplicate
implementations — a `FinancialFinding` is `{finding, evidence,
metric_label/value/unit, recommendation, impact_value/unit, confidence,
risk}`, matching the brief's Finding → Evidence → Metric →
Recommendation → Economic Impact → Confidence → Risk shape exactly.

**Deliberate restraint:** Cash Forecast does not emit a
`forecast_accuracy` business metric, even though the Finance profile
already declares one. Forecast accuracy can only be honestly measured
by comparing a past forecast against what actually happened, and this
codebase has no reconciliation loop yet (Phase J). Emitting a number
here would be emitting a metric this phase cannot back — so it emits
none, and the Finance profile shows "not connected" for that slot
until Phase J makes it real.

### Confidence is explainable, not a single number

Every finding-set's `SkillEvaluation.breakdown` carries five named,
independently-scored dimensions: **data completeness**, **data
freshness**, **historical consistency** (does a finding's cited number
actually appear in the source ledger — a real, cheap
fabrication check, not a re-run of the LLM's own reasoning), **model
confidence** (the average of each finding's own stated confidence),
and **evidence quality**. This reuses the evaluator mechanism every
existing skill already has — no new confidence abstraction was
introduced.

### Cash & Working Capital Worker (seed foundation)

`buildCashWorkingCapitalWorkerSeed()` (`lib/workforce/seed.ts`)
composes all four skills into one real, immediately-runnable Worker
definition — identity "Ledger," autonomy defaulted to `"low"` (not
`"medium"` like the marketing seed; nothing in this domain should
default to acting more independently than a marketing worker does
today). **Not auto-seeded into any organization** — matching the
existing principle that an org's data is never silently populated.
Wiring an explicit way to create it (a seed action, Factory, or
Products onboarding) is a decision for a later phase.

## What Phase D explicitly did not do

No Command Center, no Worker Studio visual work, no real bank/ERP
connector, no Opportunity/Decision/Approval entities (those are
Phase G), no Activity/Input/Output metric split (Phase H), no
Verified Value reconciliation loop (Phase J), no autonomous execution.
Every one of the four skills only ever reads from the demo tool and
calls the LLM — none can take an action, by construction (their
`requiredTools` never include a write/publish/delete/financial/
external_communication-permission tool).

## Verified

`tsc --noEmit`, `next build`, and `pnpm test` (22 tests) all clean. A
real, logged-in, end-to-end run against a live local Postgres database
created a worker with all four skills, ran each one in `LLM_DEV_MODE`,
and confirmed the persisted rows: `execution_mode = "development"` and
`data_provenance = "demo"` independently and correctly set on every
execution; every business metric row landed with `economic_state =
"estimated"`; Cash Forecast's execution correctly has zero business
metric rows.
