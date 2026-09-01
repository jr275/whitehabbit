# Phase 5 — Contradiction Resolutions

Every contradiction across Phases 1–4, plus **four discovered in this phase by inspecting the running repository** rather than the documents.

Format: **CONFLICT · SOURCE · IMPACT · DECISION · REASON · CONSEQUENCE**

Sixteen resolutions. Three are new findings that change earlier conclusions materially (**R3**, **R5**, **R11**).

---

## R1 — Is the Agent Workforce / Studio product retired?

**CONFLICT** Phase 2 §32 Q1 and Phase 4 C12 treat this as a blocking unknown. Phase 4's entire Week 1 begins by deleting `lib/workforce*`, `lib/character/*`, `lib/agent/skills/*` and eight route groups; migration `0005` drops eight tables.

**SOURCE** Phase 2 §32 Q1 · Phase 4 §1.2 C12 · Phase 4 §23.2 migration 0005 · Phase 4 §24.3 Week 1

**IMPACT** Blocking. Roughly half of Phase 4's Week 1 is deletion work that is now forbidden.

**DECISION** **The Workforce/Studio product continues to exist and is not modified.** The Knowledge Library is a new, additive product surface in the same repository and the same deployment.

**REASON** Directed by Phase 5's Decision 1. Independently, it is also the lower-risk path: the Workforce product is working, deployed code with no test suite, and deleting untested code is how you discover what depended on it.

**CONSEQUENCE** Phase 4 migration `0005` (`retire_workforce`) is **cancelled**. Week 1's retirement work is removed. Every Knowledge Library migration must be **purely additive**. `lib/workforce*`, `lib/character/*`, `lib/agent/skills/*`, `lib/db/schema.ts`, `lib/library/*`, `lib/products/*`, `lib/insights/*` and all 88 existing components **stay**. Phase 2 §2's "retire the product surface" and Phase 4 §2.13's DELETE column are superseded.

---

## R2 — Team size

**CONFLICT** Phase 3 §18 and Phase 4 §24.3 assume 3 engineers. Phase 4 C13 flags it as blocking and states 2 engineers = ~11 weeks.

**SOURCE** Phase 3 §18 · Phase 4 §1.2 C13 · Phase 4 §24.5

**IMPACT** Blocking. The 8-week plan is not achievable at the assumed staffing.

**DECISION** **Two engineers.** The 8-week whole-MVP plan is **withdrawn**. Work is re-scoped into milestones, the first of which is a thin vertical slice (Readiness §14).

**REASON** Directed by Phase 5's Decision 2. Phase 4 §24.5 already stated 2 engineers ≈ 11 weeks; the honest response is to cut scope per milestone, not to compress the schedule.

**CONSEQUENCE** Phase 4 §24's three-track plan is replaced by a two-workstream Milestone 1 (Readiness §2). Milestone 1 contains **no AI**, which removes the entire critical-path chain Phase 4 §24.2 identified as having zero slack.

---

## R3 — `/library`, `lib/library/` and `components/library/` are already taken ⚠ NEW

**CONFLICT** Phase 3 §5 and Phase 4 §15/§17 place the Knowledge Library at route `/library` with API `/api/library` and code in `lib/knowledge`. **The repository already has `app/library/page.tsx`, `app/library/[id]/page.tsx`, `lib/library/` (5 files) and `components/library/` (6 files) — all belonging to the Workforce product's "worker library" (the prefab agent catalog).**

**SOURCE** Discovered in Phase 5 by inspection. Contradicts Phase 3 §5, Phase 4 §15.1, §16, §17.1.

**IMPACT** **High.** Phases 3 and 4 assumed a free namespace. Under R1 the existing route cannot be moved, because moving it changes Workforce behaviour. Building at `/library` would either collide outright or silently hijack a working Workforce screen.

**DECISION** The Knowledge Library is namespaced **`knowledge`** throughout:

| | Path |
|---|---|
| Pages | `app/(knowledge)/knowledge`, `app/(knowledge)/knowledge/read/[id]`, `app/(knowledge)/knowledge/search` |
| API | `app/api/knowledge/*` |
| Domain | `lib/knowledge/*` |
| Components | `components/knowledge/*` |

The **UI label remains "Library"** — the URL and the label are independent, and users never see the path segment as product language.

**REASON** It is the only option that satisfies R1. Renaming Workforce's `/library` is a behaviour change; nesting the new product under an existing Workforce route would couple them; a bare `/k` prefix is cryptic. `knowledge` is free at every level (verified: `app/knowledge`, `app/api/knowledge`, `lib/knowledge`, `components/knowledge` do not exist) and it is greppable, which matters when two products share a repository.

**CONSEQUENCE** Every path in Phase 4 §15 (`/api/save`, `/api/library/...`) is rewritten under `/api/knowledge/*` (Readiness §3). Phase 4 §17.1's route table is superseded. If the Workforce team ever frees `/library`, a redirect can be added — that is a later, optional convenience, not a dependency.

---

## R4 — `organizations → workspaces` rename ⚠ NEW

**CONFLICT** Phase 4 §4.2 and migration `0003` rename `organizations` to `workspaces` and `audit_log.org_id` to `workspace_id`. Under R1, 14 modules import `lib/db/repo.ts` and every Workforce repository function is typed on `orgId`.

**SOURCE** Discovered in Phase 5. Contradicts Phase 4 §4.2, §23.2.

**IMPACT** **High.** The rename would touch every Workforce repository function, every API route, and `lib/session.ts` — a broad, behaviour-affecting refactor of a product that must not change, with no tests to catch a mistake.

**DECISION** **Do not rename.** `organizations` remains the physical tenant table and is **shared** by both products. Knowledge Library tables carry `org_id TEXT NOT NULL REFERENCES organizations(id)`. The Knowledge Library's own domain types name it `workspaceId`, mapped at its repository boundary.

**REASON** The tenant must be shared — a user signs in once and both products must resolve the same tenant from the same session. Sharing the table is therefore required; renaming it is merely cosmetic and carries real regression risk. One physical table, two domain vocabularies, one mapping point.

**CONSEQUENCE** Phase 4 migration `0003` is **cancelled**. `lib/session.ts` is unchanged; the Knowledge Library adapts `organizationId → workspaceId` inside `lib/knowledge/access`. The mapping is a documented naming hazard (Readiness §4).

---

## R5 — `typescript.ignoreBuildErrors` severity ⚠ NEW EVIDENCE

**CONFLICT** Phase 4 §27.1 R1 rates this **Critical**, describes it as disabling the primary tenant-isolation control, and allocates a timeboxed Week-1 remediation with a two-day escape hatch. Phase 4 §24.4 treats it as a top-three week-1 risk.

**SOURCE** Phase 4 §27.1 R1, §24.4, §21.4. **Contradicted by measurement in Phase 5.**

**IMPACT** Phase 4 planned significant Week-1 capacity for a problem whose size was assumed, never measured.

**DECISION** Measured directly:

```
./node_modules/.bin/tsc --noEmit --pretty false     → exit 0, ZERO errors
npx next build                                       → exit 0, build succeeds
tsc re-run after .next/types generation              → exit 0, ZERO errors
tsconfig: "strict": true                             (already enabled)
```

**There are zero TypeScript errors in the repository today, under `strict: true`, including generated route types.** The flag masks nothing. **Remove it immediately**, in its own small PR, with a CI typecheck gate added in the same change.

**REASON** The severity in Phase 4 was inferred from the flag's presence, not from evidence. The measurement changes the remediation from "timeboxed multi-day effort with an escape hatch" to "a one-line change with zero fallout."

**CONSEQUENCE** Phase 4 §27.1 R1's severity is **downgraded from Critical to Low-effort/High-value**. Phase 4 §24.4's de-risking measure #3 (the `@ts-expect-error` quarantine) is unnecessary and is withdrawn. **The flag must still be removed** — its danger is prospective: it means the *next* type error ships silently, and the Knowledge Library's tenant-isolation design depends on the compiler enforcing `AccessScope`. Readiness §6.

---

## R6 — Three repository functions have no tenant scope ⚠ NEW

**CONFLICT** Phase 2 §2 and Phase 4 §2.7 state that every repository function takes `orgId` and that "there is deliberately no get-by-id-alone path."

**SOURCE** Discovered in Phase 5 by auditing all 32 exported functions in `lib/db/repo.ts`.

**IMPACT** Three **write** functions execute unscoped SQL:

```
updateTaskStatus(id, status)        UPDATE tasks      SET status=$1 WHERE id=$2
updateExecutionStatus(id, status)   UPDATE executions SET status=$1 WHERE id=$2
finalizeExecution(id, patch)        UPDATE executions SET ...      WHERE id=$11
```

**Verified not currently exploitable:** all 8 call sites are in `lib/agent/runtime.ts`, and every id passed is a server-generated `randomUUID()` created moments earlier in the same execution. No client-supplied id reaches them. `app/api/executions/[id]/route.ts`, which *does* take a client id, correctly passes `organizationId` to both `getExecution` and `getExecutionEvents`.

**DECISION** Record as a **latent defect, not a live vulnerability.** Add `orgId` to all three signatures and `AND org_id = $n` to all three statements — a **behaviour-preserving** change, since the ids already belong to the caller's org. **Not done in this phase** (documentation only) and requires explicit approval because it touches Workforce files.

**REASON** The claim in Phases 2 and 4 was an overstatement — accurate for reads, not for these three writes. The correction costs minutes and removes an entire class of future mistake, because the *pattern* is what the Knowledge Library will be copied from.

**CONSEQUENCE** Readiness §6 makes tenant-scoped signatures a hard rule for all new code and specifies a test that fails any repository function lacking a scope parameter. Phase 2 §2's and Phase 4 §2.7's claims are corrected here.

---

## R7 — Collections is a primary destination with nothing behind it

**CONFLICT** Phase 3 §5 makes Collections one of three primary destinations. Phase 3 §18 ships no collections. Phase 4 D21 recommended smart collections (~2 days) to make the nav honest.

**SOURCE** Phase 3 §5 vs §18 · Phase 4 §1.2 C4, D21

**IMPACT** The MVP would ship a primary nav item leading to an empty screen — which Phase 3 §6's "never appears" list explicitly forbids.

**DECISION** **Option A — remove Collections from primary navigation**, and preserve the cheap capability as **"Saved views"** inside Library (a dropdown on the filter bar, backed by the same `rule` JSONB). Collections returns as a destination when manual curation ships.

**REASON** Phase 4's D21 recommendation assumed 3 engineers. At 2 (R2), even two days is real scope against a milestone that deliberately contains no AI. More fundamentally: a *place* is warranted when a thing has content of its own. A saved filter is a view of the Library, so it belongs in the Library. Navigation should follow the data model, not aspiration.

**CONSEQUENCE** MVP navigation is **Library · Search**, plus the command palette. Phase 3 §5's three-destination IA is revised to two. `collections` and `collection_objects` tables are **deferred entirely** — saved views need only a small `saved_views` table, or a user-preferences row. Phase 4 D21 is superseded.

---

## R8 — Authentication: remove or keep Credentials?

**CONFLICT** Phase 3 §18 cuts email/password ("a week of edge cases"). Phase 4 C5 found Credentials auth already implemented and working — so removing it is *net work*.

**SOURCE** Phase 3 §18 · Phase 4 §1.2 C5, §2.4

**IMPACT** Phase 3's reasoning was inverted against the actual baseline.

**DECISION** **Keep the existing Credentials provider. Add Google OAuth alongside it.** Neither is removed.

**REASON** Prefer reuse over replacement. `lib/auth.ts`, `lib/auth-password.ts` (bcryptjs, 12 rounds), `/api/auth/register` and the JWT session with `organizationId` in the token all work today, and **the Workforce product depends on them** — removing Credentials under R1 would break a live product. Adding Google is additive and is table stakes for a consumer surface.

**CONSEQUENCE** Auth is **not on Milestone 1's critical path at all** — it already works. Google OAuth becomes a small independent task. Account recovery (password reset) is a genuine gap and is scheduled explicitly (Readiness §16 remaining risks) rather than assumed. Phase 3 §18's item 1 is superseded.

---

## R9 — RLS: migration one, or week seven?

**CONFLICT** Phase 2 §9 mandates RLS on every workspace-scoped table "from the first migration". Phase 4 D24 sequences it to week 7.

**SOURCE** Phase 2 §9 · Phase 4 D24, §23.3

**IMPACT** Weeks of implementation relying on repository-layer scoping alone.

**DECISION** **Keep Phase 4's sequencing** — RLS after the schema stabilises, before any launch — **with one addition**: because the tenant table is now shared with a product that does *not* use RLS (R4), policies must be applied **only to Knowledge Library tables**, never to `organizations`, `users`, `memberships` or any Workforce table.

**REASON** Enabling RLS while the schema is still moving produces policy churn and confusing failures. But the shared-table constraint is new and decisive: an RLS policy on `organizations` would silently break every Workforce query.

**CONSEQUENCE** RLS is scoped to `knowledge_*` tables. Readiness §6 makes "never enable RLS on a shared or Workforce table" an explicit rule. Phase 2 §9 is refined rather than followed literally.

---

## R10 — Import enqueues everything at once ⚠ NEW

**CONFLICT** Phase 4 §14.3 inserts objects and enqueues capture jobs in batches of 500 until the file is consumed. Phase 5 §9 requires the architecture to hold at 100,000 URLs.

**SOURCE** Phase 4 §14.3, §14.6 (which caps expectations at 50,000 rows)

**IMPACT** A 100,000-row import creates 100,000 queue rows in one pass and commits the entire library to extraction and AI processing with no ability to stop. Phase 4's per-workspace concurrency cap limits *throughput* but not *commitment* — the cost is already incurred the moment the jobs exist.

**DECISION** Replace enqueue-everything with a **pull-based dispatcher**. Import inserts objects as `pending` (cheap rows, no queue entries). An `import_dispatcher` job runs every 30 seconds, measures in-flight work for that workspace, and enqueues only up to the headroom. **The objects table is the backlog; the queue holds only what is actively being worked.**

**REASON** It makes the queue depth bounded by the concurrency cap rather than by import size, makes an import pausable and cancellable at any point, and makes the cost ceiling enforceable *before* spend rather than after.

**CONSEQUENCE** Phase 4 §14.3's enqueue step is superseded (Readiness §8). Adds one scheduled job. It also enables the large-import policy in Readiness §8: above a threshold, extract everything but defer AI understanding.

---

## R11 — Two fields are asked of the LLM that can be computed ⚠ NEW

**CONFLICT** Phase 4 §9.4's output schema includes `reading_difficulty` and `detected_language`. Phase 5 §11 directs deriving as much as possible deterministically.

**SOURCE** Phase 4 §9.4 · Phase 5 §11

**IMPACT** Minor cost, meaningful reliability: both fields are non-reproducible across runs, occupy schema surface, and add validation paths for values a library computes exactly.

**DECISION** Remove both from the LLM schema. `reading_difficulty` ← **Flesch–Kincaid** computed from `plain_text`. `detected_language` ← a language-detection library, with the extracted `<html lang>` as a prior.

**REASON** Deterministic, free, reproducible, and independently testable. `importance_signal` and `key_ideas` stay with the model, because they require judgement no formula provides.

**CONSEQUENCE** The understanding schema drops from nine fields to seven. Both derived values are computed in the `extract` stage, so they exist **before** AI runs and survive an AI failure — an object in `partial` still has a difficulty and a language. Phase 4 §9.4 is superseded.

---

## R12 — Prompt-version changes could silently reprocess the library

**CONFLICT** Phase 4 §9.7 and D14 make `prompt_version` part of the idempotency key so "bumping it correctly re-runs the whole library." Phase 5 §12 requires avoiding accidental reprocessing of thousands of articles.

**SOURCE** Phase 4 §9.7, D14 · Phase 5 §12

**IMPACT** A developer editing a prompt and bumping the version could trigger an unbudgeted re-run across every object in every workspace — potentially thousands of dollars, with no confirmation step.

**DECISION** Separate the two concepts. `prompt_version` participates in the idempotency key **for objects being processed anyway** — it never *triggers* processing. Reprocessing is an explicit, admin-initiated, per-workspace backfill job that **shows a cost estimate and an object count before it starts**.

**REASON** Phase 4 conflated "would this produce a different result?" with "should we recompute it now?". The first is a cache-key question; the second is a budget decision.

**CONSEQUENCE** Bumping a prompt affects only new saves. Existing objects keep their intelligence and record the version that produced it, so a mixed-version library is visible and queryable. Readiness §11.

---

## R13 — Wow moment and MVP scope drift across phases

**CONFLICT** Phase 2 §27 names semantic search the wow moment; Phase 3 §3 names Topic Shelves. Phase 2 §26 lists 13 MVP MUST-HAVEs including Ask and highlights; Phase 3 §18 cuts them.

**SOURCE** Phase 2 §26/§27 · Phase 3 §0/§3/§18 · Phase 4 §1.1 C1, C2

**IMPACT** None operationally — Phase 3 flagged both revisions explicitly in its §0.

**DECISION** **Phase 3 stands.** Phase 2 §26 and §27 are historical and should be read as superseded.

**REASON** Already resolved and documented. Restated here so the resolution survives in one place.

**CONSEQUENCE** Under R2, neither is in Milestone 1 — shelves need AI, which Milestone 1 excludes.

---

## R14 — Third import format: Wallabag or Raindrop?

**CONFLICT** Phase 2 §26 says Pocket, Instapaper, **Wallabag JSON**. Phase 3 §18 says Pocket, Instapaper, **Raindrop**.

**SOURCE** Phase 2 §26 · Phase 3 §18 · Phase 4 C3

**IMPACT** Low — one parser, roughly one week apart in value.

**DECISION** **Milestone 1 ships no import at all.** For the milestone that does: **Pocket first, alone.** Instapaper second. The third format is deferred until there is user demand to point at, and the generic CSV fallback (any file with a detectable URL column) covers the tail in the meantime.

**REASON** Under R2 this is a real cost. Pocket's 2025 shutdown makes it by far the highest-volume source; a generic CSV fallback serves Raindrop and Wallabag adequately without a bespoke parser for either.

**CONSEQUENCE** C3 is closed without choosing between them. Phase 4 §14.1's three-format table becomes Pocket + generic CSV, with Instapaper next.

---

## R15 — Ask-This-Article: cut, or pull forward?

**CONFLICT** Phase 2 §26 lists it as MVP. Phase 3 §18 cuts it to weeks 9–12. Phase 3 §19 says the cut "may be wrong" and it should be pulled forward first.

**SOURCE** Phase 2 §26 · Phase 3 §18/§19 · Phase 4 C7

**IMPACT** Was to be decided by a week-6 trigger that no longer exists under R2.

**DECISION** **Not in Milestone 1** (no AI at all) and **not in Milestone 2**. Revisit after Milestone 3, when the understanding pipeline is real and citation grounding can be built properly.

**REASON** Phase 3 §19's argument — it is architecturally cheap — is still true. But at 2 engineers the constraint is engineer-weeks, not architectural difficulty, and a rushed citation implementation is exactly the thing Phase 3 §10 says destroys trust permanently.

**CONSEQUENCE** C7 is closed. The pre-agreed trigger from Phase 4 §1.2 is withdrawn.

---

## R16 — Embedding provider and dimension chosen without evidence

**CONFLICT** Phase 2 §5/§32 Q6 say decide against the golden retrieval set. Phase 4 D17 fixes `vector(1536)` before any golden set exists.

**SOURCE** Phase 2 §5, §32 Q6 · Phase 4 D17, C9

**IMPACT** The dimension is baked into a column type and is among the hardest things to change later.

**DECISION** **Defer entirely.** Milestone 1 has no embeddings and creates no `object_chunks` table. The decision moves to the milestone that introduces search, by which point a golden set can be built from a real corpus first.

**REASON** R2 removes the schedule pressure that forced Phase 4's judgement call. Phase 4 D17 was explicit that it was a judgement, not a measurement; deferring converts it into a measurement.

**CONSEQUENCE** C9 is closed for now. Phase 4 D17's `vector(1536)` stands as a **provisional default** with the pgvector HNSW 2000-dimension ceiling as a real constraint on the eventual choice.

---

## Summary

| Ref | Resolution | Supersedes |
|---|---|---|
| R1 | Workforce coexists; nothing deleted | P2 §2, P4 §2.13, P4 migration 0005 |
| R2 | Two engineers; milestone-based delivery | P3 §18, P4 §24 |
| R3 | **`knowledge` namespace** — `/library` is taken | P3 §5, P4 §15/§16/§17 |
| R4 | **No `organizations` rename** — shared tenant table | P4 §4.2, migration 0003 |
| R5 | **Zero TS errors** — remove the flag now | P4 §27.1 R1, §24.4 |
| R6 | Three unscoped writes — latent, fix with approval | P2 §2, P4 §2.7 |
| R7 | Collections out of nav; saved views in Library | P3 §5, P4 D21 |
| R8 | Keep Credentials, add Google | P3 §18 |
| R9 | RLS on Knowledge tables only, after stabilisation | P2 §9 |
| R10 | **Pull-based dispatcher**, not enqueue-everything | P4 §14.3 |
| R11 | Difficulty and language computed, not prompted | P4 §9.4 |
| R12 | Prompt bump never auto-reprocesses | P4 §9.7 |
| R13 | Phase 3's wow moment and scope stand | P2 §26/§27 |
| R14 | Pocket + generic CSV; no third parser | P2 §26, P3 §18 |
| R15 | Ask deferred past Milestone 3 | P2 §26, P3 §19 |
| R16 | Embedding decision deferred to the search milestone | P4 D17 |
