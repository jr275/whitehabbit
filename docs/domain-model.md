# Domain model — current → target

**Phase A (Domain Mapping) + Phase B (Model Consolidation) design.** This document is the
required checkpoint before any schema change or deletion: what exists, what it's used by,
what's duplicate, what's kept, what it merges into, and what migration each choice implies.

Nothing in this document is guessed. Every "used by" claim below was verified with a
repo-wide import search (not just a read of the file's own header comment) before it was
written down — several files that *look* live from their own doc-comments turned out to have
zero real importers anywhere in `app/`.

---

## 1. Method

For each candidate file/module, I searched every `app/`, `components/`, `lib/` file for an
`import ... from` reference to it (both `@/...` alias and relative forms), then walked up from
any hit to confirm it terminates in a real `app/**/page.tsx` or `app/api/**/route.ts`. A module
with zero such hits is **dead**: reachable by no URL, rendered by no page, called by no route.

## 2. The ten entities, current → target

| Current model(s) | Purpose | Used by (verified) | Duplicate? | Keep? | Merge into | Migration required? |
|---|---|---|---|---|---|---|
| **Worker** — `lib/workforce/model.ts` (`Worker`, `WorkerVersion`, `WorkerDefinitionSnapshot`) | The real, Postgres-persisted worker: identity, mission, objectives, skills, tools, behaviors, channels, outcome, autonomy, immutable build/release versioning | Studio, Workforce, Outputs, Approvals, Observatory, Factory, Products, Home, all `/api/workers/*` routes, `lib/agent/*` runtime | — (this is the canonical one) | **Keep — canonical** | *is* the target | None |
| **Worker** — `lib/worker/worker-model.ts` + `lib/worker/{worker-state,worker-events,worker-persistence,worker-policies,worker-runtime,worker-evaluation}.ts` | An earlier `Capability/Tool/Policy/Memory/RunResult` worker vocabulary | **Nobody.** Zero importers anywhere in `app/`, `components/`, or the rest of `lib/`. | Yes — superseded by `lib/workforce/model.ts` | **Delete** | `lib/workforce/model.ts` (already does) | Delete files only; no data ever existed in this shape |
| **Worker** — `lib/worker.ts` (`CapabilityId`, `WorkerEvent`, `ATLAS` fixture) + `lib/simulation.ts` + `lib/character/*` | A hand-authored, single hardcoded worker ("Atlas, Enterprise Sales Worker") driving an animated node-graph visualization | 15 components (`fabric-canvas`, `hud`, `task-hud`, `teach-drawer`, `worker-identity`, `mode-switcher`, `outcome-overlay`, `rabbit-hole`, `command-bar`, `event-inspector`, `evolve-drawer`, `explain-panel`, `capability-panel`, `task-queue`, `outcome-card`, `approval-panel`) — **but none of those 15 components is itself imported by any page.** The whole cluster is dead. | Yes | **Delete** | n/a | Delete only; nothing persisted |
| **Worker** — `lib/workforce-demo/*` (`DemoWorker`, org chart, `Skill`-as-IP, heuristics) | A demo org-chart layer for a "living org of AI workers" vision | `components/workforce/{heuristics,org-map,outcome-ledger,skill-card,activity-feed}.tsx`, `components/home/assembly.tsx` — **none of those is imported by any page either.** Dead. | Yes | **Delete** | n/a | Delete only |
| **Worker** — `lib/library/prefabs.ts` (8 fixture archetypes: MAKY, OPY, WAZ, JURI, **FIN**, PIPO, LEXI, Atlas) | A "worker marketplace" concept: fully-imagined vertical archetypes with invented strength scores and outcome deltas | `app/library/page.tsx`, `app/library/[id]/page.tsx`, `components/library/*` — **live**, reachable from the "Skills" top-nav item | Yes, and the only one of the five duplicates that's actually reachable in the shipped app | **Decision needed — see §5** | `lib/workforce/model.ts` (`FIN` becomes the real Cash Intelligence Worker once built; the rest either become real Workers later or are removed) | Content migration only if kept; route/nav change either way |
| **Skill** — `lib/agent/types.ts` `SkillDefinition` (`execute/evaluate/metrics`) + `lib/agent/skills/*.ts` (6 real skills) | The executable contract: what a skill actually does when run | Runtime (`lib/agent/tool-runner.ts`, `lib/agent/runtime.ts`), every Studio run | — | **Keep — canonical** | *is* the target | Add finance skills here (Phase F) |
| **Skill** — `lib/workforce/model.ts` `Skill` (`{id,name,category,enabled,outputType}`) | The client-facing, one-line toggle a Studio user sees for a skill | Studio, Workforce, Outputs | No — this is the thin UI projection of the same real skill, not a competing model | **Keep, extend** | n/a (extend with `requiredTools`, confidence rubric fields already in the backend contract) | Additive column/JSON fields only |
| **Skill** — `lib/library/prefabs.ts` skill tags/strength scores | Cosmetic per-archetype skill tags on fixture cards | `/library` only | Yes, disconnected from real Skill entirely | Fold into real Skill once a Worker exists for that archetype | `lib/agent/skills/*` | n/a until an archetype is built for real |
| **Tool** — `lib/agent/types.ts` `ToolDefinition` (`isConnected()` real check) + `lib/agent/tools/*` | Real, invocable external capability | Runtime | — | **Keep — canonical** | *is* the target | None |
| **Tool** — `lib/workforce/model.ts` `WorkforceTool` (+ `toolExecutionBoundary`) | Client projection: enabled/connected/permission/risk, with the `not_available / not_connected / requires_approval / executable` state machine | Studio, Workforce | No — thin UI projection, same reasoning as Skill above | **Keep** | n/a | None |
| **Tool** — `lib/worker/worker-model.ts` `Tool` (`TOOL_CATALOG`) | Old five-tool catalog (web_search/crm/email/calendar/database) | Dead (part of the orphaned `lib/worker/` cluster above) | Yes | **Delete** | `lib/agent/tools/registry.ts` | None |
| **Organization** — `organizations` table (`lib/db/schema.ts`), `lib/db/repo.ts` | The tenant boundary. Every worker, session, and audit row is scoped to one. | Auth, every API route via `requireSession()` | — | **Keep — canonical, and *is* Tenant** | n/a | None — see next row |
| **Tenant** — no separate concept exists | The brief's canonical list names `Tenant` and `Organization` separately | — | Yes, against Organization — the product only ever needed one tenancy boundary | **Do not introduce a second concept.** `Tenant == Organization`. | `organizations` | None. If a future need for org-of-orgs (e.g. a holding company with subsidiaries) arises, model it as `parent_organization_id` on `organizations`, not a new top-level entity. |
| **Execution** — `lib/workforce/model.ts` `WorkerExecution` + `executions` table | The real, persisted run record: status, reason code, cost, tokens, duration, `executionMode` | Runtime, Outputs, Approvals, Observatory | — | **Keep — canonical** | *is* the target | None |
| **Execution** — `lib/worker/worker-model.ts` `RunResult`, `lib/simulation.ts` `Decision`/`Approval`/`Outcome` types | Old, in-memory-only run shape | Dead cluster only | Yes | **Delete** | `WorkerExecution` + `WorkerEvent` | None |
| **Opportunity** — does not exist | A detected, quantified chance to create/preserve/release value | Nothing today. The word "opportunity" only appears as UI copy (e.g. Studio's readiness panel labels), never as a data model. | n/a | **New entity — Phase G** | New table, references `worker_id`, optionally `execution_id` that surfaced it | New migration |
| **Decision** — `lib/worker.ts` `Decision` ("QUALIFIED"/"NOT_QUALIFIED"/"INCONCLUSIVE"), `lib/simulation.ts` `Decision` | A qualification verdict, in the dead fixture layer only | Dead cluster only | Yes, and also not modeled for real anywhere | **New entity — Phase G**, informed by the shape these fixtures already got right | New table, references `opportunity_id`, `worker_id` | New migration |
| **Approval** — `ApprovalRequiredError` (`lib/agent/types.ts`) + `status: "pending_approval"` on `WorkerExecution` | A real, thrown-before-execution gate. **Not yet a standalone, resumable record** — it's a status value, not an entity with its own lifecycle. | Runtime (gate), Approvals page (read-only) | No duplication — this is real and correct as far as it goes | **Keep the gate. Add the missing entity** — Phase G | New `approvals` table (execution_id, requested_reason, decided_by, decided_at, decision) + a real resume endpoint | New migration + new endpoint |
| **Metric** — `lib/workforce/model.ts` `MetricRecord` (`kind: operational\|quality\|cost\|business`) + `metrics` table | Real, persisted, typed metric emission tied to an execution or business event | Runtime, Outputs | — | **Keep — canonical**, extend `kind` taxonomy | Add `kind: "activity" \| "input" \| "output"` alongside the existing four, per §10–13 of the brief | Additive: widen the `kind` check constraint / enum, no destructive change |
| **Metric** — `lib/insights/marketing-command-data.ts` invented confidence/impact numbers | Fully static fixture numbers with no backing row | `/insights` only (not linked from top nav — reachable by direct URL only) | Yes, and it's fabricated | **Decision needed — see §5** | n/a | Route/nav change only |

## 3. What this means, stated plainly

Of the **six worker vocabularies** the audit found, **four are already dead code** — zero
users can reach them today, regardless of domain or rebrand:

- `lib/worker/*` (7 files)
- `lib/worker.ts` + `lib/simulation.ts` + `lib/character/*` (4 files) + the 15 components that
  only they import (`fabric-canvas.tsx`, `hud.tsx`, `task-hud.tsx`, `teach-drawer.tsx`,
  `worker-identity.tsx`, `mode-switcher.tsx`, `outcome-overlay.tsx`, `rabbit-hole.tsx`,
  `command-bar.tsx`, `event-inspector.tsx`, `evolve-drawer.tsx`, `explain-panel.tsx`,
  `capability-panel.tsx`, `task-queue.tsx`, `outcome-card.tsx`, `approval-panel.tsx`)
- `lib/workforce-demo/*` (6 files) + `components/workforce/{heuristics,org-map,outcome-ledger,
  skill-card,activity-feed}.tsx` (5 files) + `components/home/{assembly,outcome-hero}.tsx` (2 files)

That's **~40 files, zero screens** — removing them is not a product decision, it's cleanup.
Nothing regresses because nothing renders them today.

Two of the six are **live and require an actual product decision**, because real users can
reach them right now:

- **`/library`** ("Skills" in top nav) — the 8-archetype fixture worker marketplace, including
  the unwired "FIN" card the brief points to as a starting point.
- **`/insights`** — the fixture "Marketing Command Center." Not linked from top nav today
  (direct-URL only), which lowers the blast radius of touching it.

## 4. Target canonical model (Phase C onward)

Reusing the existing spine, the brief's full bounded-context list maps as:

| Bounded context | Status |
|---|---|
| Tenant, Organization, User, Role, Permission | Organization/User real today. **Role/Permission do not exist** — org membership is a flat boolean. Needed before Phase L's approval segregation-of-duties. |
| Worker, Skill, Tool, Connector, Credential, Policy, Autonomy | Worker/Skill/Tool/Autonomy real today (canonical rows above). Policy exists as `BehaviorRule` (if/then text), not a structured, evaluable policy object — close, needs strengthening in Phase D. Connector/Credential don't exist as first-class records yet (`ToolDefinition.isConnected()` is a boolean check, not a stored credential) — Phase per §25 of the brief, explicitly deferred past this phase. |
| Opportunity, Decision, Approval | None exist as real entities today (table above). **New in Phase G.** |
| Execution, ExecutionStep, Verification | Execution/ExecutionStep (`WorkerEvent`) real today. **Verification does not exist** — new in Phase J (Verified Value). |
| Metric, InputMetric, OutputMetric, BusinessOutcome, EconomicValue | `MetricRecord` real today with a `kind` taxonomy that already anticipates this — extend, don't replace (Phase H/I). `BusinessOutcome`/`EconomicValue` as named entities: new in Phase I/J, built on top of existing `BusinessEvent` + `MetricRecord`. |
| AuditEvent, AgentRun, AgentMemory | `recordAudit()` already exists and is called from real mutation paths (`lib/db/repo.ts`) — keep. `AgentRun` ≈ existing `WorkerExecution`, no new entity needed. `AgentMemory`: only exists today in the dead `lib/worker/worker-model.ts` `MemoryItem` — genuinely absent from the real model; not in this phase's scope per the brief (§30 doesn't list it under Phases A–L). |

## 5. Decisions needed before I touch `/library` or `/insights`

Everything in §3's dead-code list will be deleted in this same pass — it's zero-risk. These
two are not, because they're the only ones a real user can click into today:

1. **`/library` (Skills nav item, 8 fixture archetypes including FIN).** Options: (a) delete
   now, rebuild the nav item once real Workers exist to list; (b) keep the page, but visually
   quarantine it as a clearly-labeled roadmap/concept view, removed from primary nav until it's
   backed by real Workers; (c) keep as-is for now, revisit after the Cash Intelligence Worker
   ships (so there's at least one real card to show alongside the fixture ones).
2. **`/insights` (fixture command center, not in nav today).** Given it's already
   unreachable from navigation, lowest-risk default is: delete it now along with the rest of
   the dead cluster, since keeping unlinked, fabricated-looking financial-flavored dashboards
   around is a bigger liability than benefit once this product is positioned as a financial
   system of record.

My recommendation: **delete `/insights`** now (low risk, already orphaned from nav), and for
`/library`, **option (b)** — pull "Skills" from primary nav for now rather than deleting the
code outright, since the underlying card component (`components/library/worker-card.tsx`) is
genuinely the best-designed "Skill Card" in the repo and is worth reusing once it's pointed at
real data (see the audit's §12, Skill Experience Assessment). I'll hold off deleting/hiding
either until you confirm.

## 6. Screens and APIs affected by this phase

**Deleted, no replacement needed (zero live screens):** none — see §3, nothing user-facing
changes when the dead cluster is removed.

**Changed pending §5's answer:** `/library`, `/library/[id]`, `/insights`, and the "Skills"
entry in `components/studio/top-nav.tsx`.

**Unaffected:** `/`, `/workforce`, `/workforce/[id]`, `/studio`, `/outputs`, `/approvals`,
`/observatory`, `/outcomes`, `/evolve`, `/factory`, `/products`, `/products/[slug]/onboard`,
`/integrations`, and every `/api/**` route — all sit on the canonical model already and need
no structural change in this phase.

## 7. Migrations in this phase

**None.** Phase B is subtraction (dead code) plus a routing/nav decision (§5) — no schema
change. The additive schema changes flagged above (`metrics.kind` widening, new
`opportunities`/`decisions`/`approvals` tables, Role/Permission) are called out here for
visibility but land in Phases D, G and H, each with its own migration file and its own
commit, per the brief's "no big-bang change" instruction.
