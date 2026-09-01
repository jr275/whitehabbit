# Phase 4 — MVP Technical Implementation Specification
## AI Personal Knowledge Library · SAVE → UNDERSTAND → ORGANIZE → FIND

**Status:** Specification only. No application code, migrations, UI components, dependencies or configuration changed.
**Date:** 2026-09-01
**Inputs read in full:** `docs/PHASE-1-ARCHITECTURE-AUDIT.md`, `docs/PHASE-2-TARGET-ARCHITECTURE.md`, `docs/PHASE-3-PRODUCT-EXPERIENCE.md`, plus a fresh re-inspection of the current codebase.
**Companion:** `docs/PHASE-4-DECISIONS.md`

---

# 1. PHASE 1–3 CONSISTENCY CHECK

Fourteen inconsistencies found. **Six are resolved** (a later phase deliberately superseded an earlier one and said so). **Eight are unresolved** and need a human decision — they are not resolved here, per instruction. Unresolved items are marked **⚠ OPEN** and repeated in §27.

## 1.1 Resolved — a later phase superseded an earlier one

| # | Contradiction | Resolution |
|---|---|---|
| **C1** | **Wow moment.** P2 §27 says semantic search. P3 §3 says Topic Shelves. | **P3 wins**, flagged in P3 §0. P2 reasoned about the organic path only; P3 reasoned about the import path, which is most users. *P2 §27's text is now stale and should be read as superseded.* |
| **C2** | **MVP scope.** P2 §26 lists 13 MUST-HAVEs including Ask-This-Article, highlights, mobile. P3 §18 ships 12 and cuts those. | **P3 wins.** P2 defined the smallest *valuable* product; P3 defined what fits in 8 weeks. Different questions. *P2 §26's list is stale for MVP purposes and remains valid as the Phase-1-through-6 target.* |
| **C6** | **Auto-collections phase.** P2 §30 puts them in Phase 8. P3 §18 puts a "cheap version" in the 8-week build. | **P3 wins**, flagged in P3 §0. §12 of this document defines the cheap/rich split precisely so the ambiguity does not survive into implementation. |
| **C8** | **Highlights.** P2 §26 MVP includes "reader — highlights, notes". P3 §18 cuts them to weeks 9–12. | **P3 wins**, with the acknowledged cost that P3 §15 names highlights the strongest engagement signal, so 8 weeks of that measurement is lost. |
| **C11** | **Extraction tiers.** P2 §7 defines four (site-config → readability → headless → metadata-only). P3 §18 skips the headless tier. | **Not a contradiction — an explicit scope reduction.** §7 of this document specifies a three-tier MVP with `js_required` as an honest terminal state. |
| **C15** | **Ask-This-Article's phase.** P2 §26 lists it as MVP; P2 §30 lists it under Phase 6. | P2 itself noted this ("MVP-scoped and therefore lands earlier in practice"). Moot now — C7 supersedes. |

## 1.2 ⚠ OPEN — needs a decision before implementation

| # | Contradiction | Why it matters | Options |
|---|---|---|---|
| **C3 ⚠** | **Third import format.** P2 §26 says Pocket, Instapaper, **Wallabag JSON**. P3 §18 says Pocket, Instapaper, **Raindrop**. | Different parser, different user population. One week of work either way. | (a) Raindrop — P3's competitive analysis targets its users, and it has a clean JSON/CSV export; (b) Wallabag — P1 gives us a working reference parser; (c) both, if week 5 has slack. **Recommendation: Raindrop**, on market grounds, with Wallabag as the first fast-follow. |
| **C4 ⚠** | **Collections nav vs. Collections build.** P3 §5 makes Collections one of three primary destinations. P3 §18 ships **no collections at all**. The MVP would ship a nav item leading nowhere. | A visible dead end in primary navigation is worse than no nav item. | (a) Drop Collections from MVP nav — two destinations (Library, Ask-later) + palette; (b) ship **smart collections only** ("Save this view"), which P3 §11 calls architecturally free — ~2 days; (c) ship the nav item disabled with a "coming soon" — **rejected, this is exactly the kind of thing P3 §6's "never appears" list forbids**. **Recommendation: (b)**, because it is genuinely cheap and it makes the nav honest. |
| **C5 ⚠** | **Auth.** P3 §18 says "Google sign-in only — email/password is a week of edge cases." But **Credentials auth already exists and works** in the baseline (`lib/auth.ts`, `lib/auth-password.ts`, bcryptjs 12 rounds, `/api/auth/register`). | P3's reasoning is inverted against the actual baseline: removing working code is *net work*, and adding Google is the new work. | (a) **Keep Credentials, add Google** — strictly less work than P3 proposed; (b) hide Credentials in the UI, keep the code path for seeding and tests; (c) delete it. **Recommendation: (a).** This is a case where P3 reasoned about a greenfield build rather than this repository. |
| **C7 ⚠** | **Ask-This-Article.** P3 §18 cuts it; P3 §19 says the cut "may be wrong" and it should be the first thing pulled forward. | It is the trust moment and architecturally cheap (chunks already in hand, one call). | (a) Hold the cut and ship weeks 9–12; (b) pull it into week 8 if week 6 lands early; (c) commit to it now and cut something else. **Recommendation: (a) with a pre-agreed trigger** — if the week-6 exit criterion is met on schedule, pull it into week 8. Decide the trigger now, not in week 7. |
| **C9 ⚠** | **Embedding model + dimension.** P2 §5 and §32 Q6 say decide against the Phase 4 golden retrieval set. In an 8-week MVP, search ships in weeks 6–7 and **no golden set exists yet**. | The vector dimension is baked into the column type and is one of the hardest things to change later. | (a) Pick a dimension now on judgement and build the golden set during week 6 to validate; (b) delay search a week to build the golden set first — **breaks the 8-week plan**; (c) store the dimension generously and pad — wastes index memory. **Recommendation: (a)**, with the golden set as a week-6 deliverable and the honest acknowledgement that the first choice is a judgement call, not a measurement. |
| **C12 ⚠** | **Is the agent-workforce product being retired?** P2 §32 Q1 — **still unanswered**, and it gates Week 1. | Week 1 begins by deleting `lib/workforce*`, `lib/character/*`, `lib/agent/skills/*` and eight route groups. If that product must keep running, Week 1 is a different week and the schema plan changes. | **BLOCKER. Must be answered before Week 1 starts.** No recommendation — this is a business decision. |
| **C13 ⚠** | **Team size.** P3 §18 assumes 3 engineers + v0. P2 §32 Q9 — unanswered. | The entire 8-week plan rests on this. At 2 engineers the plan is ~11 weeks; at 4 it is ~7 with coordination overhead. | **Must be confirmed before committing to the date.** §24 gives the plan at 3 and states the scaling. |
| **C14 ⚠** | **Week ordering.** P3 §18 orders: foundation(1–2), capture+library(3–4), import(5), understanding(6), search(7), harden(8). The Phase 4 brief proposes: foundation(1), save(2), AI(3), library+shelves(4), search(5), import(6), polish(7), QA(8). | These are materially different, and both are sequential when the work is parallelisable across 3 engineers. | §24 **revises both** into a three-track plan and states the critical path. Neither original ordering is adopted as-is. |

## 1.3 Constraints carried forward (no conflict, restated so they are not lost)

| Source | Constraint |
|---|---|
| P2 §5 | Vercel function ceiling 60s → **the pipeline must never run in a route handler** |
| P2 §5 | No ORM. Raw parameterized SQL. No Prisma. |
| P2 §5 | No Redis at MVP. Rate limiting stays Postgres-backed. |
| P2 §9 | `workspace_id` on every content row **from the first migration**; RLS as backstop |
| P2 §10 | Save returns <200ms; everything expensive is asynchronous |
| P2 §11 | Summarization + classification + entities + topics are **ONE LLM call** |
| P2 §13 | Agent tools are constructed pre-bound to an `AccessScope`; no tool schema accepts a tenant id |
| P2 §14 | `workspace_id` is the first predicate on both search branches, **before** kNN |
| P2 §17 | `activity_events` schema defined in Phase 1, **written from Phase 2** — signals cannot be backfilled |
| P2 §23 | Cost ledger + quotas ship in Phase 3 of the roadmap, not Phase 11 |
| P3 §6 | No unread badges, no streaks, no upgrade banner above the fold, no modal on load |
| P3 §7 | Grid default, List toggle. **No masonry, no timeline view.** |
| P3 §18 | Zero agents in the MVP |

## 1.4 Deferred features (protected — see §26)

Audio · Ask-My-Library · knowledge graph and contradictions · related content · briefs · recommendations · research · sharing · public collections · content creation · collaboration · PDF/video/podcast/post adapters · native apps · masonry · timeline.

---

# 2. CURRENT IMPLEMENTATION BASELINE

Re-inspected directly. **This section is the authority on what must not be rebuilt.**

## 2.1 Framework and build

| | |
|---|---|
| Framework | **Next.js 16.3.0**, App Router, React 19, TypeScript 5.7.3 |
| Styling | **Tailwind CSS 4.3** via `@tailwindcss/postcss`; `app/globals.css` (300 lines) already defines a full shadcn-compatible `@theme inline` token set with light/dark variables |
| UI kit | `@base-ui/react`, `shadcn` 4.8, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `framer-motion`, `recharts` |
| Package manager | **pnpm** (`pnpm-lock.yaml`), Node ≥22.5 |
| ⚠ Liability | `next.config.mjs` sets **`typescript.ignoreBuildErrors: true`** and **`images.unoptimized: true`** |
| ⚠ Liability | **Zero tests.** No test runner in `package.json`, no test files anywhere. |

## 2.2 Next.js architecture

- 31 route files; 12 API route handlers under `app/api/`; 88 components.
- `middleware.ts` gates `/studio` and `/outputs` using an **edge-safe** NextAuth instance built from `lib/auth.config.ts` alone (no providers, no `pg`) — and its own comment correctly states it is a UX convenience, **not** the security boundary.
- One route (`app/api/workers/[id]/run/route.ts`) demonstrates the **streaming + `after()` pattern**: NDJSON stream to the client, `after(drain)` keeps execution alive past disconnect, `export const maxDuration = 60`.

## 2.3 PostgreSQL architecture

`lib/db/client.ts` — node-postgres `Pool`, global singleton across warm invocations.

```
query<T>(text, params)        parameterized, returns rows
queryOne<T>(text, params)     first row or null
withTransaction(fn)           BEGIN / COMMIT / ROLLBACK with a PoolClient
DatabaseNotConfiguredError    thrown loudly if DATABASE_URL is unset — never a silent fallback
Pool config                   max: 5, idleTimeout 10s, connectTimeout 10s
```

> ⚠ **`max: 5` is tuned for serverless only.** Adding a long-running worker container that batch-processes imports requires its own pool configuration (higher `max`, longer idle) and the serverless side should use a pooled endpoint (e.g. Neon's pooler). Flagged in §23 and §27.

Migrations: `scripts/migrate.mjs` — applies `migrations/*.sql` in filename order, tracked in `_migrations`, each file in its own transaction with rollback on failure. **Sound. Keep as-is.**

Current schema (`migrations/0001_init.sql`, PostgreSQL): `organizations`, `users`, `memberships`, `workers`, `worker_versions`, `tasks`, `executions`, `execution_events`, `outputs`, `business_events`, `metrics`, `rate_limit_counters`, `audit_log`. Timestamps are `BIGINT` epoch-ms throughout; IDs are prefixed `TEXT`.

> `lib/db/schema.ts` is a **dead SQLite schema**, superseded by the migration. Delete in Week 1.

## 2.4 Authentication

Auth.js v5 (`next-auth@5.0.0-beta.32`), **JWT sessions**, Credentials provider.

- `lib/auth.config.ts` — edge-safe, provider-less; `jwt`/`session` callbacks put `userId`, `organizationId`, `organizationName` on the token and session.
- `lib/auth.ts` — Node-runtime config adding the real Credentials provider; `authorize()` looks up the user, verifies bcrypt, resolves the primary org, and **returns null rather than papering over** a user with no organization.
- `lib/auth-password.ts` — **bcryptjs, 12 rounds**, `isPasswordAcceptable` (length ≥ 8).
- `app/api/auth/register/route.ts` — signup; `app/api/auth/[...nextauth]/route.ts` — handlers.

**Verdict: working email/password auth already exists.** See C5 — P3's "cut email/password" is inverted against this baseline.

## 2.5 Tenancy model

Already correct and the most valuable thing in the repo.

```
users ──N:M(memberships: role)──► organizations ──1:N──► every content table (org_id)
```

`lib/session.ts` → `requireSession()`:
1. `auth()` → session; extract `userId` + `organizationId` from the **verified JWT only**, never a client field
2. `userBelongsToOrg(userId, orgId)` — **a real database check on every request**, so a forged or stale org claim in a tampered cookie grants nothing
3. Throws `UnauthenticatedError` / `UnauthorizedOrgError`; never silently falls back to a default org

**Verified: all 10 non-auth API routes call `requireSession()`.**

## 2.6 API architecture

`lib/api-error.ts` → `withApiHandler(routeName, handler)`:

| Thrown | HTTP |
|---|---|
| `UnauthenticatedError` | 401 |
| `UnauthorizedOrgError`, `NotFoundError` | **404** — deliberately not 403, so another tenant's resources are never confirmed to exist |
| `ValidationError` | 400 |
| `RateLimitedError` | 429 |
| `DatabaseNotConfiguredError` | 503 + structured log |
| anything else | 500 + structured log, generic message |

Every handler receives a `requestId`. **Reuse verbatim; add `QuotaExceededError` → 402/429.**

## 2.7 Database layer

`lib/db/repo.ts` — 692 lines, 36 exported functions, raw parameterized SQL. Every worker read/write takes `orgId` and filters on it; **there is deliberately no "get by id alone" path.** Row-to-domain mappers (`rowToWorker`, `rowToExecution`, `rowToVersion`) are the pattern to copy.

## 2.8 AI provider abstraction — reuse verbatim

`lib/agent/tools/llm-providers/types.ts` defines `LlmProvider`:

```
id · displayName · isConfigured() · notConfiguredReason() · call(LlmCallInput) → ToolActionResult<LlmCallOutput>
LlmCallOutput: { text, model, inputTokens, outputTokens, provider, executionMode? }
```

Implementations: `anthropic.ts`, `gemini.ts`, `development.ts`. `lib/agent/tools/llm.ts` dispatches on `LLM_PROVIDER`; an unrecognised value is a **misconfiguration, never a silent fallback**. `lib/runtime-mode.ts` **hard-blocks the development provider in production** regardless of `LLM_DEV_MODE`. `lib/agent/cost.ts` computes real cost from real tokens and returns `undefined` — not 0 — when no rate is configured, so "unmeasured" is distinguishable from "free".

**This is exactly the seam §9 needs. Do not rebuild.**

## 2.9 Execution / workflow infrastructure

`lib/agent/runtime.ts` — `executeTask()` async generator. Patterns worth keeping:

| Pattern | Reuse |
|---|---|
| `EventQueue` bridging sync `emit()` to an async iterator | ✔ as a reference |
| `SerialWriter` chaining writes so event `sequence` is meaningful | **✔ port directly to `job_events`** |
| Persist task + execution **before** emitting anything | ✔ |
| Structured terminal states with `reason_code` | **✔ port directly** |
| Runs a **frozen version**, never the live draft | ✔ conceptually (prompt versioning) |
| Execution host = an in-request generator | **✘ replace** — must become an out-of-process worker |

Failure vocabulary in `lib/agent/types.ts` — `SkillBlockedError` (missing_credential), `InvalidCredentialError`, `ProviderError`, `ApprovalRequiredError`, `ExecutionReasonCode` — **ports directly to the ingestion pipeline.**

## 2.10 Security infrastructure

`lib/security/ssrf-guard.ts` → `assertSafeUrl(rawUrl): Promise<URL>`:
- scheme allowlist (http/https only)
- `BLOCKED_HOSTNAMES` (`localhost`, `metadata.google.internal`)
- IPv6 bracket stripping so `[::1]` is recognised as a literal
- literal-IP check → private-range rejection
- **DNS `lookup(host, {all:true})` and validation of every resolved address** — defeats rebinding
- IPv4 private ranges (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16 incl. metadata, 0/8), IPv6 (`::1`, `::`, `fe80::/10`, `fc00::/7`, IPv4-mapped)
- malformed input → **treated as unsafe** rather than guessed

Caller (`lib/agent/tools/browser.ts`) pairs it with `redirect: "error"` and a 15s timeout.

**This is the single highest-value security asset in the repo and the exact control Wallabag lacks.** Gaps to close in §21: TOCTOU (guard resolves DNS, then `fetch` resolves again), no response size limit, no content-type restriction, redirects rejected rather than validated per hop.

## 2.11 Logging

`lib/observability/logger.ts` — one JSON line per event to stdout (Vercel captures it). `LogContext` currently carries `requestId`, `executionId`, `workerId`, `organizationId`, `userId`. `newRequestId()` generates `req_…`.

**Reuse; rename the domain fields** to `workspaceId` / `objectId` / `jobId` in Week 1.

## 2.12 Rate limiting

`checkRateLimit(scope, subject, limit, windowMs)` — atomic fixed-window counter via `INSERT … ON CONFLICT DO UPDATE … RETURNING count`. Correct across concurrent serverless instances. `lib/rate-limit.ts` holds the scope table and throws `RateLimitedError`.

> ⚠ `pruneExpiredRateLimits()` is called **opportunistically, not on a schedule**. Once a worker exists, make it a scheduled job.

## 2.13 Reuse verdict

| Component | Verdict |
|---|---|
| Next.js/React/TS/Tailwind + `globals.css` token set | **KEEP** |
| `lib/db/client.ts`, `scripts/migrate.mjs` | **KEEP** (worker needs its own pool config) |
| `lib/session.ts`, `lib/auth*.ts` | **KEEP**, add Google |
| `lib/api-error.ts` | **KEEP**, add `QuotaExceededError` |
| `lib/rate-limit.ts` + `checkRateLimit` | **KEEP**, add ingestion scopes |
| `lib/observability/logger.ts` | **KEEP**, rename fields |
| `lib/security/ssrf-guard.ts` | **KEEP**, harden (§21) |
| `lib/agent/tools/llm-providers/*`, `llm.ts`, `cost.ts`, `runtime-mode.ts` | **KEEP verbatim** |
| `lib/agent/types.ts` error vocabulary | **KEEP**, port |
| `organizations`/`memberships`/`users`/`audit_log`/`rate_limit_counters` tables | **KEEP** (rename `organizations`→`workspaces`) |
| `lib/db/repo.ts` worker functions | **REPLACE** with knowledge-domain repos, same style |
| `lib/agent/runtime.ts` host | **REPLACE** with worker; port the patterns |
| `lib/workforce/*`, `lib/workforce-demo/*`, `lib/character/*`, `lib/agent/skills/*`, `lib/library/*`, `lib/insights/*`, `lib/products/*`, `lib/fabric-graph.ts`, `lib/simulation.ts`, `lib/worker*.ts` | **DELETE** (gated on C12) |
| `lib/db/schema.ts` | **DELETE** — dead SQLite schema |
| 88 components except `components/ui/button.tsx` | **DELETE** — v0 rebuilds |
| `workers`/`worker_versions`/`tasks`/`executions`/`execution_events`/`outputs`/`business_events`/`metrics` tables | **DROP** (gated on C12/C10-open-question) |

**Estimated reuse: ~60% of backend infrastructure, ~0% of domain and UI.**

---

# 3. MVP BOUNDED CONTEXTS

The brief proposes nine (Identity, Library, Content, Ingestion, Collections, Topics, Search, AI Understanding, Import). **Six is the right number.** Three of the nine are not separate contexts:

| Proposed | Verdict |
|---|---|
| **Content** | ✘ **Merged into Ingestion.** Content has no lifecycle independent of the pipeline that produces it. A separate context would own one table and no behaviour. |
| **Topics** | ✘ **Merged into Library.** Topic shelves are a *read model over the library*, not an aggregate. Topics have no lifecycle of their own — they are created by Understanding and read by Library. |
| **Collections** | ✘ **Merged into Library** for MVP. With only smart collections (C4 option b), a collection is a named saved query — a Library read model. Promote to its own context when manual collections land in weeks 13–16. |

## The six

```
┌──────────────┐   ┌──────────────────────────────────────────────┐
│  IDENTITY    │   │  INGESTION                                    │
│  (exists)    │   │  save → capture → extract → normalize        │
│  users       │──►│  owns: pipeline, jobs, extraction, content    │
│  workspaces  │   │  emits: ObjectCreated, ContentExtracted       │
│  memberships │   └──────────┬───────────────────────────────────┘
│  AccessScope │              │ ContentExtracted
└──────┬───────┘              ▼
       │            ┌──────────────────────────────────────────────┐
       │            │  UNDERSTANDING                                │
       │            │  ONE LLM call → tldr/summary/ideas/topics/    │
       │            │  entities/difficulty/language + embeddings    │
       │            │  emits: ObjectUnderstood, ObjectIndexed       │
       │            └──────────┬───────────────────────────────────┘
       │                       │
       ▼                       ▼
┌────────────────────────────────────────┐   ┌─────────────────────┐
│  LIBRARY                                │   │  SEARCH             │
│  read+write model over objects          │◄──│  hybrid retrieval   │
│  lists · filters · user state · topics  │   │  read-only          │
│  shelves · smart collections · reader   │   │  no writes ever     │
└────────────────────────────────────────┘   └─────────────────────┘
                       ▲
                       │ bulk ObjectCreated
            ┌──────────────────────────┐
            │  IMPORT                   │
            │  parse → dedupe → enqueue │
            │  batch, progress, report  │
            └───────────────────────────┘
```

### 3.1 IDENTITY *(exists — extend only)*

| | |
|---|---|
| **Responsibility** | Who is asking, and what may they see |
| **Entities** | `users`, `workspaces` (renamed from `organizations`), `memberships` |
| **Services** | `requireSession()` → `AccessScope` ✔ exists; `signUp()` ✔ exists |
| **Repositories** | `getUserByEmail`, `createUserWithWorkspace`, `userBelongsToWorkspace` ✔ exist |
| **Events** | `UserRegistered` (→ create workspace) |
| **APIs** | `/api/auth/*` ✔ exist; add Google provider |
| **Jobs** | none |
| **Depends on** | nothing |

### 3.2 INGESTION

| | |
|---|---|
| **Responsibility** | A URL becomes durable, normalized content. Owns the pipeline and every failure mode in it. |
| **Entities** | `knowledge_objects` (root), `object_content`, `jobs`, `job_events` |
| **Services** | `UrlCanonicalizer`, `SafeFetcher`, `ExtractionService` (sidecar client + fallbacks), `HtmlSanitizer`, `ContentNormalizer` |
| **Repositories** | `objectsRepo`, `contentRepo`, `jobsRepo` |
| **Events** | `ObjectCreated`, `CaptureCompleted`, `ContentExtracted`, `ExtractionFailed` |
| **APIs** | `POST /api/save`, `GET /api/processing/:id` |
| **Jobs** | `capture`, `extract` |
| **Depends on** | Identity |

### 3.3 UNDERSTANDING

| | |
|---|---|
| **Responsibility** | Content becomes derived knowledge. **Everything it produces is disposable and regenerable** (P2 §7). |
| **Entities** | `object_intelligence`, `object_chunks`, `topics`, `object_topics`, `entities`, `object_entities`, `tags`, `object_tags`, `cost_ledger` |
| **Services** | `UnderstandingService` (one LLM call), `TopicResolver` (canonicalisation/merge), `EmbeddingService`, `Chunker`, `CostRecorder` |
| **Repositories** | `intelligenceRepo`, `chunksRepo`, `topicsRepo`, `costRepo` |
| **Events** | `ObjectUnderstood`, `ObjectEmbedded`, `UnderstandingFailed` |
| **APIs** | none directly — results surface through Library and Search |
| **Jobs** | `understand`, `embed` |
| **Depends on** | Ingestion (needs `plain_text`) |

### 3.4 LIBRARY

| | |
|---|---|
| **Responsibility** | Everything the user sees and manipulates: lists, filters, per-user state, shelves, smart collections, the reader |
| **Entities** | `user_object_state`, `collections`, `collection_objects`, `activity_events` |
| **Services** | `LibraryQueryService`, `ShelfService`, `UserStateService`, `ActivityRecorder` |
| **Repositories** | `libraryRepo`, `userStateRepo`, `collectionsRepo`, `activityRepo` |
| **Events** | `ObjectOpened`, `ObjectRead`, `ObjectStarred`, `ObjectArchived` → `activity_events` |
| **APIs** | `/api/library`, `/api/library/:id`, `/api/library/:id/state`, `/api/library/:id/tags`, `/api/topics`, `/api/collections` |
| **Jobs** | none |
| **Depends on** | Ingestion, Understanding |

### 3.5 SEARCH

| | |
|---|---|
| **Responsibility** | Hybrid retrieval. **Read-only — it never writes.** |
| **Entities** | none of its own; reads `object_chunks` + `knowledge_objects` + joins |
| **Services** | `QueryParser`, `HybridSearchService` (RRF), `FacetService` |
| **Repositories** | `searchRepo` |
| **Events** | `SearchPerformed` → `activity_events` |
| **APIs** | `GET /api/search` |
| **Jobs** | none |
| **Depends on** | Understanding (embeddings), Library (filters) |

### 3.6 IMPORT

| | |
|---|---|
| **Responsibility** | A file becomes thousands of pending objects, without blocking anything |
| **Entities** | `imports`, `import_items` |
| **Services** | `ImportParser` (per format), `ImportValidator`, `ImportEnqueuer` |
| **Repositories** | `importsRepo` |
| **Events** | `ImportStarted`, `ImportItemQueued`, `ImportCompleted` |
| **APIs** | `POST /api/import`, `GET /api/import/:id` |
| **Jobs** | `import_parse`, then N × `capture` at low priority |
| **Depends on** | Ingestion |

## Context rules

1. **Contexts communicate by event or by repository call, never by reaching into each other's tables.** Search reads `object_chunks` through `searchRepo`, not by importing Understanding's internals.
2. **Understanding is the only context that may call an LLM.** One place to meter, cache, version and fail.
3. **Ingestion never knows about AI.** It emits `ContentExtracted` and stops. That is what makes AI failures degradations rather than pipeline failures.
4. **Search never writes.** No index to maintain — indexing is a side effect of Understanding's insert (P2 §10).
---

# 4. DATABASE DESIGN

## 4.0 Conventions (inherited from the existing schema — do not change)

- IDs: prefixed `TEXT` (`obj_…`, `job_…`, `imp_…`), generated with `randomUUID()`
- Timestamps: `BIGINT` epoch-milliseconds — matches every existing table and the TypeScript model
- Tenancy: **`workspace_id TEXT NOT NULL` on every content table**, first predicate on every query
- JSON: `JSONB`
- Soft delete: `deleted_at BIGINT NULL` on user-visible aggregates only

## 4.1 Three simplifications against Phase 2's model

Phase 2 §6 designed for the full product. Three tables it specifies are **not built in the MVP**, because they would be speculative here:

| Phase 2 table | MVP decision | Reason |
|---|---|---|
| `entities` + `object_entities` | **Store entities as JSONB inside `object_intelligence`** | The understanding call produces entities, but the MVP has no entity pages, no entity filter and no graph. Two tables and a resolver would exist to serve nothing. Promote to real tables in Phase 5 when entity pages ship — the JSONB is the migration source. |
| `tags` + `object_tags` (separate from topics) | **Merged into `topics` / `object_topics` with a `source` column** | Two near-identical vocabularies, two filter UIs, two resolvers — for one user-visible concept. One vocabulary with `source ∈ {ai, user}` gives auto-topics *and* user labels. Free-form tags distinct from topics can be added later if users ask. |
| `job_events` | **Not built.** `ingestion_jobs` rows only. | `job_events` exists to stream a multi-step agent run. A 4-stage deterministic pipeline is fully described by its job rows. The client polls object status; there is nothing to stream. |

**Why `ingestion_jobs` survives** despite pg-boss having its own tables: pg-boss archives and eventually deletes completed jobs, so it cannot answer "what was our extraction failure rate by domain last month" (§19) or provide a durable traceable execution id. pg-boss owns *queueing and retry*; `ingestion_jobs` owns *durable stage history and idempotency*.

## 4.2 Modified existing tables

| Change | Detail |
|---|---|
| `organizations` → **`workspaces`** | `ALTER TABLE … RENAME`. Add `slug TEXT UNIQUE`, `plan TEXT NOT NULL DEFAULT 'free'`. All FKs follow. |
| `memberships.role` | Extend the comment enum to `owner \| admin \| member \| viewer`. No type change (already `TEXT`). |
| `users` | Add `name TEXT`, `image_url TEXT`, `email_verified_at BIGINT` (Google OAuth). `password_hash` becomes **nullable** — an OAuth-only user has none. |
| **Dropped** (gated on C12) | `workers`, `worker_versions`, `tasks`, `executions`, `execution_events`, `outputs`, `business_events`, `metrics` |
| Unchanged | `rate_limit_counters`, `audit_log` (rename `org_id` → `workspace_id`) |

## 4.3 `knowledge_objects` — the aggregate root

**Purpose:** one saved thing. Identity, provenance, metadata, per-stage pipeline state. Deliberately excludes content bytes, AI output, and per-user state.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `obj_…` |
| `workspace_id` | TEXT NOT NULL → workspaces | **tenant** |
| `created_by` | TEXT NOT NULL → users | provenance, **not** authorization |
| `kind` | TEXT NOT NULL DEFAULT `'article'` | MVP: `article` only. Column exists so adapters are additive. |
| `visibility` | TEXT NOT NULL DEFAULT `'private'` | MVP: always `private`. Column exists so Phase 10 is additive. |
| **— content identity —** | | |
| `submitted_url` | TEXT NOT NULL | exactly what the user gave us |
| `canonical_url` | TEXT NOT NULL | §4.4 |
| `resolved_url` | TEXT | final URL after redirects |
| `origin_url` | TEXT | preserved original when a real redirect occurred (Wallabag's `updateOriginUrl` logic) |
| `url_hash` | CHAR(64) NOT NULL | `sha256(canonical_url)` |
| `domain` | TEXT | host, `www.` stripped |
| **— metadata —** | | |
| `title` | TEXT | |
| `authors` | TEXT[] NOT NULL DEFAULT `'{}'` | |
| `published_at` | BIGINT | |
| `language` | TEXT | BCP-47, normalized |
| `mimetype` | TEXT | |
| `word_count` | INTEGER | |
| `reading_time_seconds` | INTEGER | |
| `preview_image_url` | TEXT | |
| `favicon_url` | TEXT | proxied at render, never hot-linked |
| `excerpt` | TEXT | extracted description, **not** the AI summary |
| `source_meta` | JSONB NOT NULL DEFAULT `'{}'` | kind-specific fields; not indexed |
| **— pipeline state —** | | |
| `pipeline_status` | TEXT NOT NULL DEFAULT `'pending'` | §6 |
| `extraction_tier` | TEXT | `site_config \| readability \| metadata_only` |
| `extractor_version` | TEXT | reproducibility |
| `http_status` | SMALLINT | |
| `failure_code` | TEXT | §6.4 vocabulary |
| `failure_message` | TEXT | user-facing plain language |
| `understood_at` | BIGINT | null = no AI yet |
| `embedded_at` | BIGINT | null = not searchable semantically |
| **— import provenance —** | | |
| `import_id` | TEXT → imports | null = saved live |
| `source_app` | TEXT | `pocket \| instapaper \| raindrop \| web \| extension \| api` |
| `original_saved_at` | BIGINT | **the date the user saved it in the OLD app** — critical: a Pocket import must not make 3,000 items look like they were all saved today |
| **— timestamps —** | | |
| `created_at`, `updated_at` | BIGINT NOT NULL | |
| `deleted_at` | BIGINT | soft delete |

**Constraints and indexes**

```
UNIQUE (workspace_id, url_hash)                        ← duplicate detection §4.5
CHECK  (pipeline_status IN (…))                        ← §6
INDEX  (workspace_id, created_at DESC)                 ← default library view
INDEX  (workspace_id, original_saved_at DESC NULLS LAST)
INDEX  (workspace_id, pipeline_status)                 ← "what's still processing"
INDEX  (workspace_id, domain)
INDEX  (workspace_id, import_id)
GIN    (authors)
GIN    (title gin_trgm_ops)                            ← typo-tolerant title match
Partial: WHERE deleted_at IS NULL on the two list indexes
```

## 4.4 URL canonicalization — specified exactly

Wallabag hashes the **raw** URL with SHA-1 and does not canonicalize, so `?utm_source=x` creates a duplicate (P1 §K14). Ours, in this order:

```
1. trim; reject non-http(s)
2. lowercase scheme and host; strip a trailing dot from the host
3. strip default ports (:80 http, :443 https)
4. strip leading "www."                    → stored in `domain`
5. remove tracking params (exact list, versioned as CANONICALIZER_VERSION):
     utm_*, fbclid, gclid, gbraid, wbraid, msclkid, mc_cid, mc_eid,
     igshid, ref, ref_src, s, si, _hsenc, _hsmi, vero_id, yclid, ttclid
6. sort remaining query params by key, then value
7. drop the fragment  — EXCEPT when it matches ^#!/ or ^#/ (hash routing),
   where it is path-bearing and must be kept
8. collapse duplicate slashes in the path; strip a trailing slash
   UNLESS the path is exactly "/"
9. percent-decode unreserved characters; normalize the rest to uppercase hex
10. NFC-normalize; IDNA-encode the host
```

`url_hash = sha256(canonical_url)`. **`CANONICALIZER_VERSION` is stored in `source_meta`** so a future rule change can be back-applied deliberately rather than silently splitting identities.

**Deliberately NOT done:** following redirects at save time (that is `capture`'s job, and it must not block the <200ms response), or removing `?page=`/`?id=`-style params (they are content-bearing).

## 4.5 Duplicate detection

Three layers, matching P2 §10:

| Layer | Mechanism | Prevents |
|---|---|---|
| **Object** | `UNIQUE (workspace_id, url_hash)`; save does a `SELECT` first and returns the existing object on a hit, with **no fetch and no cost** | Saving the same article twice |
| **Post-redirect** | After `capture` resolves redirects, re-hash the resolved URL. On collision with a *different* object, mark the new one `duplicate_of` and stop. | Two different shortlinks to the same article |
| **Job** | `ingestion_jobs.idempotency_key` UNIQUE = `sha256(object_id : stage : content_hash : prompt_version : model)` | Re-billing unchanged work |

`knowledge_objects.duplicate_of TEXT → knowledge_objects` (nullable) records layer 2. The UI shows the original.

## 4.6 `object_content`

**Purpose:** the bytes. Split out because it is large and read only in the reader and the pipeline.

| Column | Type | Notes |
|---|---|---|
| `object_id` | TEXT PK → knowledge_objects ON DELETE CASCADE | |
| `workspace_id` | TEXT NOT NULL | denormalized for RLS |
| `clean_html` | TEXT | **sanitized on write** (§21) |
| `plain_text` | TEXT | the contract every downstream stage reads |
| `raw_html_key` | TEXT | → R2 object key. **Makes re-extraction possible** — Wallabag cannot do this. |
| `content_hash` | CHAR(64) NOT NULL | `sha256(plain_text)` — the AI idempotency key |
| `extracted_at` | BIGINT NOT NULL | |
| `extractor_version` | TEXT NOT NULL | |

`INDEX (content_hash)`

## 4.7 `object_intelligence`

**Purpose:** everything the model produced. Isolated so it can be dropped and rebuilt without data loss.

| Column | Type | Notes |
|---|---|---|
| `object_id` | TEXT PK → knowledge_objects ON DELETE CASCADE | |
| `workspace_id` | TEXT NOT NULL | |
| `tldr` | TEXT | ≤ 240 chars — sized for the card |
| `summary` | TEXT | 2–4 sentences |
| `key_ideas` | JSONB | `[{text, evidence_quote}]` |
| `entities` | JSONB | `[{name, type, salience}]` — **JSONB in MVP** (§4.1) |
| `reading_difficulty` | SMALLINT | 1–5 |
| `importance_signal` | SMALLINT | 1–5, model's view of substance; used only as a small ranking input, **never shown as a score** |
| `detected_language` | TEXT | |
| `model`, `prompt_version` | TEXT NOT NULL | |
| `content_hash` | CHAR(64) NOT NULL | copied from `object_content` |
| `input_tokens`, `output_tokens`, `cached_tokens` | INTEGER | |
| `cost_usd` | DOUBLE PRECISION | nullable — **null means "unmeasured", not "free"** (existing `cost.ts` semantics) |
| `generated_at` | BIGINT NOT NULL | |

```
UNIQUE (object_id, prompt_version, content_hash)   ← never re-bill unchanged work
```

## 4.8 `object_chunks` — the retrieval unit

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `object_id` | TEXT NOT NULL → knowledge_objects ON DELETE CASCADE | |
| `workspace_id` | TEXT NOT NULL | **denormalized deliberately** — mandatory pre-filter and RLS subject; joining to discover the tenant on the hot path is both slower and a worse safety property |
| `ordinal` | INTEGER NOT NULL | |
| `text` | TEXT NOT NULL | |
| `char_start`, `char_end` | INTEGER NOT NULL | offsets into `plain_text` — the link to future highlights |
| `fts` | tsvector **GENERATED ALWAYS AS** `to_tsvector('english', text)` STORED | |
| `embedding` | `vector(1536)` | §10 |
| `embedding_model` | TEXT | per row — makes a model migration a resumable backfill |
| `embedded_at` | BIGINT | |

```
UNIQUE (object_id, ordinal)
INDEX  (workspace_id, object_id)                     ← tenant locality; every search starts here
GIN    (fts)
HNSW   (embedding vector_cosine_ops)                 ← built AFTER bulk load
```

> ⚠ **pgvector constraint:** HNSW indexes on the `vector` type support **at most 2000 dimensions**. This rules out a 3072-dim model unless `halfvec` is used. §10 selects 1536 partly for this reason.

## 4.9 `topics` and `object_topics`

**Purpose:** the single vocabulary (§4.1). Workspace-scoped — fixing Wallabag's ownerless global `tag` table (P1 §C.1).

`topics`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `workspace_id` | TEXT NOT NULL | |
| `label` | TEXT NOT NULL | display form |
| `slug` | TEXT NOT NULL | normalized: lowercase, singularized, punctuation stripped |
| `parent_id` | TEXT → topics | **nullable; MVP writes NULL** — see §12 |
| `object_count` | INTEGER NOT NULL DEFAULT 0 | denormalized counter, maintained in the same transaction |
| `is_user_renamed` | BOOLEAN NOT NULL DEFAULT false | a user rename permanently outranks the model |
| `created_at`, `updated_at` | BIGINT NOT NULL | |

```
UNIQUE (workspace_id, slug)
INDEX  (workspace_id, object_count DESC)     ← shelf ordering
```

`object_topics`

| Column | Type | Notes |
|---|---|---|
| `object_id`, `topic_id` | composite PK | |
| `workspace_id` | TEXT NOT NULL | |
| `source` | TEXT NOT NULL | `ai \| user` |
| `confidence` | REAL | null for `user` |
| `created_at` | BIGINT NOT NULL | |

```
INDEX (workspace_id, topic_id)
INDEX (object_id)
```

**Topic assignment rule:** a `user` row always wins. A re-run of understanding may add/remove `ai` rows; it must never touch a `user` row.

## 4.10 `user_object_state`

**Purpose:** P2 §8's content/state separation. Rows created **lazily** on first interaction, so the table is proportional to engagement, not library size.

| Column | Type |
|---|---|
| `user_id`, `object_id` | composite PK |
| `workspace_id` | TEXT NOT NULL |
| `is_starred` BOOLEAN NOT NULL DEFAULT false, `starred_at` BIGINT | |
| `is_archived` BOOLEAN NOT NULL DEFAULT false, `archived_at` BIGINT | |
| `reading_progress` REAL NOT NULL DEFAULT 0 | 0–1 |
| `last_opened_at` BIGINT, `opened_count` INTEGER NOT NULL DEFAULT 0 | |
| `created_at`, `updated_at` | BIGINT NOT NULL |

```
INDEX (user_id, is_starred, starred_at DESC)  WHERE is_starred
INDEX (user_id, is_archived, archived_at DESC) WHERE is_archived
```

Library list queries `LEFT JOIN` this, so an untouched object lists correctly with null state.

## 4.11 `collections` and `collection_objects` — **conditional on C4**

Built only if C4 resolves to option (b) (smart collections in MVP).

`collections`: `id`, `workspace_id`, `created_by`, `name`, `description`, `is_smart BOOLEAN NOT NULL DEFAULT true`, `rule JSONB` (the saved filter state, same shape the library API accepts), `cover_object_id`, `position INTEGER`, `created_at`, `updated_at`, `deleted_at`. `UNIQUE (workspace_id, name) WHERE deleted_at IS NULL`.

`collection_objects` (manual only, weeks 13–16): `collection_id`, `object_id`, `position`, `added_by`, `added_at`. Composite PK.

**Deletion:** deleting a collection never deletes objects. Smart collections have no membership rows at all — they are evaluated at read time.

## 4.12 `ingestion_jobs`

**Purpose:** durable stage history, idempotency, and the traceable execution id §19 requires. pg-boss owns queueing/retry; this owns the record.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `job_…` — **this is the traceable execution id** |
| `workspace_id` | TEXT NOT NULL | |
| `object_id` | TEXT → knowledge_objects ON DELETE CASCADE | null for `import_parse` |
| `import_id` | TEXT → imports | |
| `stage` | TEXT NOT NULL | `capture \| extract \| understand \| embed \| import_parse` |
| `status` | TEXT NOT NULL | `pending \| active \| completed \| failed \| blocked \| cancelled` |
| `attempt` | SMALLINT NOT NULL DEFAULT 0 | |
| `idempotency_key` | TEXT NOT NULL | |
| `pgboss_job_id` | UUID | cross-reference while the pg-boss row lives |
| `scheduled_at`, `started_at`, `finished_at` | BIGINT | |
| `duration_ms` | INTEGER | |
| `error_code`, `error_message` | TEXT | |
| `cost_usd` | DOUBLE PRECISION | |
| `created_at` | BIGINT NOT NULL | |

```
UNIQUE (idempotency_key)
INDEX  (workspace_id, stage, status)
INDEX  (object_id)
INDEX  (stage, status, created_at DESC)      ← ops: failure rate by stage
```

## 4.13 `imports` and `import_items`

`imports`: `id`, `workspace_id`, `created_by`, `source` (`pocket|instapaper|raindrop`), `filename`, `file_key` (R2), `status` (`uploaded|parsing|queued|processing|completed|failed`), `total_items`, `queued_items`, `duplicate_items`, `invalid_items`, `completed_items`, `failed_items`, `started_at`, `finished_at`, `error_message`, `created_at`.

`import_items`: `id`, `import_id`, `workspace_id`, `row_number`, `raw JSONB`, `submitted_url`, `canonical_url`, `url_hash`, `outcome` (`queued|duplicate|invalid`), `object_id`, `reason`, `created_at`. `INDEX (import_id, outcome)`.

**Why `import_items` exists:** the result report (§14) must say *which* rows were skipped and why. A counter alone cannot answer "why did 214 of my 3,000 not import", which is the first question every importing user asks.

## 4.14 `activity_events`

**Purpose:** P2 §17 — written from day one, read by nothing in the MVP. Signals cannot be backfilled.

`id`, `user_id`, `workspace_id`, `type` (`SAVED|OPENED|READ|SEARCHED|STARRED|ARCHIVED|IMPORTED`), `object_id` (null), `payload JSONB`, `occurred_at BIGINT`.

`PARTITION BY RANGE (occurred_at)`, monthly partitions, 12-month retention. `INDEX (user_id, occurred_at DESC)`, `INDEX (user_id, type, occurred_at DESC)`.

> **Search query text goes in `payload` here — never in application logs** (P2 §25).

## 4.15 `cost_ledger` and `usage_counters`

`cost_ledger`: `id`, `workspace_id`, `object_id`, `job_id`, `stage`, `provider`, `model`, `input_tokens`, `output_tokens`, `cached_tokens`, `unit_count` (embeddings/chars), `cost_usd`, `recorded_at`. `INDEX (workspace_id, recorded_at DESC)`, `INDEX (stage, recorded_at DESC)`.

`usage_counters`: `workspace_id`, `metric` (`saved_objects|ai_understanding|ai_questions|storage_bytes`), `period_start BIGINT`, `used INTEGER`, `limit_value INTEGER`. **PK `(workspace_id, metric, period_start)`.** Checked *before* spend; `cost_ledger` records actuals *after*.

## 4.16 Search fields summary

| Need | Where |
|---|---|
| Keyword | `object_chunks.fts` (GIN) + `knowledge_objects.title` (trigram) |
| Semantic | `object_chunks.embedding` (HNSW) |
| Tenant pre-filter | `object_chunks.workspace_id` (first predicate, before kNN) |
| Topic filter | `object_topics` join |
| Domain / author / date / kind | `knowledge_objects` btree + GIN |
| Reading state | `user_object_state` LEFT JOIN |
| Collection | `collections.rule` (smart, evaluated at read) |

**There is no separate search index.** Indexing is a side effect of Understanding's insert, in the same transaction (P2 §10).

## 4.17 RLS

Enabled on every workspace-scoped table, policy `USING (workspace_id = current_setting('app.workspace_id', true))`, set per connection. **Backstop only** — the repository layer's `AccessScope` predicate is the primary control. See §23 for why this is Week 7, not Week 1.

---

# 5. CONTENT INGESTION ARCHITECTURE

## 5.1 The synchronous boundary

```
╔═══════ SYNCHRONOUS — hard budget 200ms p95 ═══════════════════════╗
║ POST /api/save { url }                                             ║
║  1  requireSession() → AccessScope                                 ║
║  2  enforceRateLimit("save", workspaceId)                          ║
║  3  checkQuota(workspaceId, "saved_objects")                       ║
║  4  canonicalize(url) → canonical_url, url_hash, domain   §4.4     ║
║  5  SELECT id,pipeline_status WHERE workspace_id AND url_hash       ║
║       HIT → 200 {duplicate:true, object}  — no fetch, no cost      ║
║  6  BEGIN                                                          ║
║       INSERT knowledge_objects (pipeline_status='pending')          ║
║       INSERT ingestion_jobs   (stage='capture', status='pending')   ║
║       pgboss.send('capture', {objectId, jobId})   ← SAME TXN        ║
║     COMMIT                                                          ║
║  7  201 { id, pipelineStatus:'pending', domain, submittedUrl }      ║
╚════════════════════════════════════════════════════════════════════╝
```

**The transactional enqueue in step 6 is load-bearing.** It makes "the object exists but no job was created" structurally impossible — the single most common failure mode in ingestion systems.

## 5.2 Stage specifications

### STAGE 1 — `capture`

| | |
|---|---|
| **Input** | `{ objectId, jobId }` |
| **Output** | `resolved_url`, `origin_url`, `http_status`, raw bytes → R2 (`raw_html_key`) |
| **Service** | `SafeFetcher` |
| **Steps** | `assertSafeUrl()` → **pinned-IP fetch** → per-hop redirect re-validation (max 5) → size cap 10 MB → content-type allowlist → stream to R2 → `updateOriginUrl()` redirect-provenance diff (P1 §F.3) → re-hash resolved URL for layer-2 dedupe |
| **Event** | `CaptureCompleted` → enqueue `extract` |
| **Retry** | timeout/5xx/network: exp `2^n × 30s` ±20% jitter, max 5. 4xx (not 429): terminal. 429: honour `Retry-After`, max 8. |
| **Failure** | `unreachable`, `dns_failure`, `timeout`, `http_4xx`, `http_5xx`, `blocked_by_ssrf_guard` (terminal + audit), `too_large`, `unsupported_content_type` |
| **Idempotency** | `sha256(objectId:capture:canonical_url)`; R2 write is `PUT` to a deterministic key |

### STAGE 2 — `extract`

| | |
|---|---|
| **Input** | `{ objectId, jobId, rawHtmlKey }` |
| **Output** | `object_content` row + metadata onto `knowledge_objects`; `pipeline_status='understanding'` |
| **Service** | `ExtractionService` → sidecar → readability → metadata-only (§7) |
| **Steps** | fetch raw from R2 → sidecar `POST /extract` → **sanitize (allowlist)** → normalize (§8) → `plain_text`, `content_hash`, `word_count`, `reading_time_seconds` → write |
| **Event** | `ContentExtracted` → enqueue `understand`; **object is now READABLE** |
| **Retry** | sidecar 5xx/timeout: max 3. Parse failure: **no retry — fall to the next tier.** |
| **Failure** | `extraction_empty`, `js_required` (terminal in MVP — no headless tier), `sidecar_unavailable` (retryable), `unsupported_content_type` |
| **Idempotency** | `sha256(objectId:extract:rawHtmlKey:extractorVersion)`; write is `ON CONFLICT DO UPDATE` |

### STAGE 3 — `understand`

| | |
|---|---|
| **Input** | `{ objectId, jobId, contentHash }` |
| **Output** | `object_intelligence` + `topics`/`object_topics` + `cost_ledger`; `pipeline_status='embedding'` |
| **Service** | `UnderstandingService` — **ONE structured LLM call** (§9) |
| **Steps** | check `UNIQUE (object_id, prompt_version, content_hash)` → **hit: skip, zero cost** → `checkQuota("ai_understanding")` → truncate to budget → call → validate schema → `TopicResolver` canonicalizes and merges → write all in **one transaction** |
| **Event** | `ObjectUnderstood` → enqueue `embed` |
| **Retry** | provider 5xx/timeout: max 5. `unparseable_output`: **1 retry** with a stricter schema reminder. Rate limit: `Retry-After`, max 8. Refusal: terminal, `partial`. |
| **Failure** | `provider_error`, `rate_limited`, `context_too_large`, `unparseable_output`, `content_policy_refusal`, `budget_exceeded` (→ **blocked**, resumable), `missing_credential` (→ **blocked**) |
| **Idempotency** | the unique constraint **is** the idempotency mechanism |

### STAGE 4 — `embed`

| | |
|---|---|
| **Input** | `{ objectId, jobId, contentHash }` |
| **Output** | `object_chunks` rows with `fts` (generated) and `embedding`; `pipeline_status='ready'` |
| **Service** | `Chunker` + `EmbeddingService` |
| **Steps** | chunk `plain_text` (§10) → batch-embed → **`DELETE` existing chunks + `INSERT` new, in one transaction** → set `embedded_at` |
| **Event** | `ObjectEmbedded` → `pipeline_status='ready'`. **Searchable in the same transaction — no index to sync.** |
| **Retry** | provider 5xx/timeout/429: max 5 |
| **Failure** | `provider_error`, `rate_limited`, `budget_exceeded` (→ blocked), `dimension_mismatch` (terminal — a config error, not a transient one) |
| **Idempotency** | `sha256(objectId:embed:contentHash:embeddingModel)`; delete-then-insert in one transaction makes redelivery converge |

## 5.3 The governing principle

**Every AI stage is optional.** A failure in `understand` or `embed` degrades what the object can *do*; it never makes the object unusable or invisible. Extraction failure is the only failure that produces a stub — and even then the object is saved, visible, shows the real reason, and offers a retry.

---

# 6. INGESTION STATE MACHINE

## 6.1 Object states

The brief proposes PENDING / FETCHING / EXTRACTED / UNDERSTANDING / INDEXING / READY / FAILED. Two corrections:

- **`EXTRACTED` is not a state, it is a transition.** The object is either being extracted or has moved on to understanding. A resting state named after a completed action invites ambiguity.
- **`PARTIAL` is missing and is essential.** An object that is readable but whose AI stage failed is a *success* with reduced capability, not a failure. Without this state the UI must either lie or show a permanent error on a perfectly readable article.

```
                    ┌─────────┐
                    │ pending │  row exists, nothing has run
                    └────┬────┘
                         ▼
                   ┌──────────┐
                   │ capturing│──────────────┐
                   └────┬─────┘              │
                        ▼                    │
                  ┌────────────┐             │
                  │ extracting │─────────────┤
                  └─────┬──────┘             │
                        ▼                    ▼
              ┌───────────────┐        ┌─────────┐
              │ understanding │        │ failed  │ terminal, retryable
              └───┬───────┬───┘        └─────────┘  (extraction only)
        success   │       │  AI failure
                  ▼       └──────────┐
            ┌───────────┐            │
            │ embedding │            │
            └──┬─────┬──┘            │
       success │     │ AI failure    │
               ▼     └───────────────┤
          ┌───────┐                  ▼
          │ ready │            ┌──────────┐
          └───────┘            │ partial  │  READABLE. usable. honest.
                               └──────────┘  auto-resumes if `blocked`
```

## 6.2 Valid transitions

| From | To | Trigger |
|---|---|---|
| `pending` | `capturing` | capture job claimed |
| `capturing` | `extracting` | bytes stored |
| `capturing` | `failed` | terminal fetch failure |
| `extracting` | `understanding` | content written (**readable from here**) |
| `extracting` | `failed` | all extraction tiers exhausted |
| `understanding` | `embedding` | intelligence written |
| `understanding` | `partial` | terminal AI failure or `blocked` |
| `embedding` | `ready` | chunks written |
| `embedding` | `partial` | terminal embedding failure or `blocked` |
| `partial` | `understanding` / `embedding` | quota reset, credential fixed, or manual retry |
| `failed` | `pending` | manual retry (`POST /api/library/:id/retry`) |
| **any** | `deleted` | soft delete |

**Illegal and enforced by a CHECK plus a guarded update:** `ready → pending` without an explicit retry; `failed → ready` without re-running; any backward transition not listed.

## 6.3 Preventing duplicate processing

Four independent mechanisms — this is the part that most often goes wrong:

1. **pg-boss singleton keys.** Each job is sent with `singletonKey = "{stage}:{objectId}"`, so a second enqueue while one is active is dropped by the queue itself.
2. **`ingestion_jobs.idempotency_key` UNIQUE.** A duplicate insert fails; the worker treats that as "already done or in flight" and exits cleanly.
3. **Guarded status transitions.** Every stage begins with `UPDATE knowledge_objects SET pipeline_status = $next WHERE id = $1 AND pipeline_status = $expected RETURNING id`. **Zero rows returned means another worker already advanced it — exit without doing the work.** This is a compare-and-swap and it is the strongest of the four.
4. **Content-hash short-circuit.** `understand` and `embed` check their unique constraints before spending anything.

## 6.4 What happens when a job crashes halfway

The MVP's answer must be specific, because "crashes halfway" is the normal case at scale, not the exception.

| Crash point | What survives | Recovery |
|---|---|---|
| After fetch, before R2 write completes | nothing | pg-boss visibility timeout expires → redelivered → refetch. R2 `PUT` to a deterministic key makes a partial write harmless. |
| After R2 write, before DB update | the R2 object | Redelivered; the fetch is skipped if the key exists; DB update is `ON CONFLICT DO UPDATE`. |
| After LLM call, before DB write | **nothing — and the money is spent** | Redelivered; the call runs again and bills again. **This is the one genuinely lossy window.** Mitigation: the LLM call and its DB write are the *last two things* the stage does, with nothing between them; and the write is a single transaction. Accepted risk, measured via `attempt > 1 AND stage = 'understand'`. |
| Mid-transaction | nothing | Postgres rolls back. Redelivered. |
| Worker killed (deploy/OOM) | in-flight pg-boss jobs return to `pending` after the visibility timeout | Automatic. **Worker must handle SIGTERM: stop claiming new jobs, finish or abandon in-flight, exit within the grace period.** |
| Object stuck in a transient state | the row | **A `reaper` job runs every 5 minutes**: any object in `capturing`/`extracting`/`understanding`/`embedding` with no active pg-boss job and `updated_at` older than 15 minutes is re-enqueued (or marked `failed` after 3 reaps). Without this, a lost message means an object spins forever. |

> The reaper is not optional. It is the difference between a pipeline that self-heals and one that requires a human to notice.

---

# 7. WALLABAG EXTRACTION INTEGRATION

Implements P2 §3's sidecar decision. **Nothing here is built in Phase 4.**

## 7.1 What is copied, adapted, isolated, external

| | Detail |
|---|---|
| **COPIED** | Nothing is copied into our TypeScript codebase. |
| **VENDORED** (into the sidecar image) | `j0k3r/graby`, `j0k3r/graby-site-config`, `j0k3r/php-readability` — installed via Composer at image build, **version-pinned** so extraction output is reproducible. |
| **ADAPTED** (reimplemented in TS, ~150 lines total) | `ContentProxy::updateOriginUrl()` redirect-provenance diff; `UrlHasher` + canonicalization (upgraded to SHA-256 + real canonicalization, §4.4); `Utils::getReadingTime()`; the metadata precedence chain (site-config → OpenGraph → HTML fallback) |
| **ISOLATED** (in the sidecar, never in our app) | All PHP. All XPath evaluation. All site-config matching. `tidy`, `libxml`, `simplehtmldom`. |
| **EXTERNAL / NOT USED** | Symfony, Doctrine, Twig, Materialize, FOSUserBundle, FOSOAuthServerBundle, RulerZ, Wallabag's HTTP client (**no SSRF guard, `verify_peer:false`**), `DownloadImages`, all 64 migrations, all 24 locales |

## 7.2 The boundary

```
   NODE (our app / worker)                    PHP (sidecar container)
   ─────────────────────────                  ────────────────────────
   ✔ assertSafeUrl() BEFORE any request       ✘ never validates URLs
   ✔ fetches the bytes itself                 ✘ never makes outbound requests†
   ✔ timeouts, retries, circuit breakers      ✘ no retry logic
   ✔ sanitizes returned HTML                  ✘ cleans but does not sanitize
   ✔ all authorization and tenancy            ✘ knows nothing about users
   ✔ all persistence                          ✘ no database, stateless
   ✔ all secrets                              ✘ no secrets
                                              ✔ graby orchestration
                                              ✔ site-config XPath rules
                                              ✔ readability fallback
                                              ✔ HTML structural cleanup
```

† **The sidecar never fetches.** Node fetches (SSRF-guarded) and passes `html` + `url`. This is the decisive security property: the sidecar has no egress, so it cannot be turned into an SSRF proxy even if compromised.

## 7.3 Communication mechanism

> **DECISION** — HTTP+JSON over a private network, `POST /extract`, Node passes pre-fetched HTML.

```
POST /extract        Content-Type: application/json
{ "url": "https://…",           // for base-URL resolution and site-config lookup
  "html": "<!doctype html>…",   // ALWAYS supplied by Node
  "options": { "siteConfigOnly": false } }

200 { "title","html","text","excerpt","authors":[],"date","image",
      "language","mimetype","extractorVersion","siteConfigMatched":true,
      "tier":"site_config|readability" }
422 { "error":"extraction_empty" }        → Node falls to metadata-only
503 { "error":"unavailable" }             → Node retries, then metadata-only
```

**Alternatives rejected:** a PHP CLI subprocess per extraction (process spawn cost, no concurrency control, harder to scale independently); a message queue between them (async indirection for a request/response call that must complete inside one job); gRPC (a schema toolchain for one endpoint).

## 7.4 Container and deployment model

```
Fly.io / Railway — one app, two processes
┌──────────────────────────────────────────────────────┐
│  worker (Node)                                        │
│   pg-boss consumer · pipeline stages · reaper         │
│   calls http://graby-sidecar.internal:8080/extract    │
├──────────────────────────────────────────────────────┤
│  graby-sidecar (PHP 8.2 + FPM/Caddy)                  │
│   POST /extract · GET /healthz                        │
│   NO public ingress · NO egress · NO database         │
│   ext: dom, libxml, tidy, mbstring, iconv, intl       │
└──────────────────────────────────────────────────────┘
```

- **Sidecar image is pinned by digest.** `extractorVersion` = image digest + graby version + site-config version, recorded on every object.
- **Scaling:** independent. Extraction is CPU-bound (XPath/tidy); the worker is I/O-bound. Start 1:1, tune from `sidecar_extract_duration_ms`.
- **Never publicly reachable.** Enforced at the platform's private-networking layer, not by an application check.

## 7.5 Failure handling

| Failure | Behaviour |
|---|---|
| Sidecar 503 / connection refused | Retry ×3 with backoff → then **Node readability fallback** → then metadata-only |
| Sidecar timeout (>20s) | Same ladder |
| `422 extraction_empty` | **No retry.** Straight to metadata-only. |
| Sidecar returns HTML that fails sanitization | Log, keep `plain_text`, drop `clean_html`, mark `partial` |
| Sidecar down entirely | **The product still works** — the Node readability path handles the majority of articles. Degraded quality, not an outage. Alert on tier distribution shifting. |

**Circuit breaker:** 10 consecutive sidecar failures → open for 60s → all extraction uses the Node fallback meanwhile.

## 7.6 Local development

```
docker compose up          postgres(+pgvector) · graby-sidecar · minio(R2-compatible)
pnpm dev                   Next.js app
pnpm worker                the worker process, against the same Postgres
```

`EXTRACTION_SIDECAR_URL` unset → the extraction service **skips tier 1 and uses Node readability**, with a loud startup log line. A contributor can run the whole product without Docker; they just get slightly worse extraction, and they are told so.

**Contract tests** (§22) run against a recorded fixture corpus, so the sidecar contract is verified in CI without running PHP.

> ⚠ **Organizational risk:** once a Node-only fallback path exists and works, there is real pressure never to finish the sidecar. Counter-measure: `siteConfigMatched` rate is a tracked metric from week 3, with a target, so the gap is visible rather than comfortable.

---

# 8. CONTENT NORMALIZATION

## 8.1 The canonical Knowledge Object shape

`ExtractedContent` is what every `SourceAdapter` must produce. **Everything downstream depends only on this shape** — which is what makes adding a content type later not touch the pipeline, the AI, or the UI.

| Field | Type | M/O | Source | Fallback when absent |
|---|---|---|---|---|
| `submittedUrl` | string | **M** | user | — (fail the save) |
| `canonicalUrl` | string | **M** | computed §4.4 | — |
| `resolvedUrl` | string | O | capture | = canonicalUrl |
| `originUrl` | string | O | redirect diff | null |
| `urlHash` | string(64) | **M** | computed | — |
| `domain` | string | **M** | parsed host | — |
| `title` | string | O→**M at render** | site-config → `og:title` → `<title>` → **URL basename → host** | never null in the UI |
| `authors` | string[] | O | site-config → `og:article:author` → `<meta name=author>` → rel=author | `[]` |
| `publisher` | string | O | `og:site_name` → domain | domain |
| `publishedAt` | epoch-ms | O | site-config → `og:article:published_time` → `<time datetime>` | null — **never guessed** |
| `cleanHtml` | string | O | extraction, **post-sanitizer** | null → reader shows plain text |
| `plainText` | string | **M for AI stages** | derived from cleanHtml | empty → object is `partial`, still listed |
| `excerpt` | string | O | `og:description` → first 200 chars of plainText | derived |
| `previewImageUrl` | string | O | site-config → `og:image` → **first `<img>` in content** → null | null → gradient keyed on domain |
| `faviconUrl` | string | O | `/favicon.ico` + `<link rel=icon>` | domain-letter monogram |
| `language` | string | O | site-config → `<html lang>` → meta → detection | null; **validated as BCP-47, `-`→`_` normalized, invalid values logged and dropped, never stored raw** |
| `mimetype` | string | O | response `content-type` | `text/html` |
| `wordCount` | integer | O | count of plainText | null |
| `readingTimeSeconds` | integer | O | `wordCount / 200 wpm × 60` | null |
| `extractorVersion` | string | **M** | sidecar or fallback | — |
| `tier` | enum | **M** | which tier produced this | — |
| `sourceMeta` | object | **M** (may be `{}`) | kind-specific | `{}` |

## 8.2 Mandatory vs optional, stated as a rule

**Only five fields are truly mandatory:** `submittedUrl`, `canonicalUrl`, `urlHash`, `domain`, `extractorVersion`. Everything else may be absent, and **the UI is required to render correctly when it is** — a layout that shifts or breaks on a missing author, date or cover is a bug, not an edge case. This is stated here rather than in the frontend spec because it is a data contract, not a styling choice.

`plainText` is conditionally mandatory: without it the AI stages cannot run, so the object goes to `partial` and is still saved, listed and readable-as-a-link.

## 8.3 Normalization rules

| Concern | Rule |
|---|---|
| **Encoding** | Detect from `content-type` → `<meta charset>` → BOM → heuristic. Convert to UTF-8. **Strip invalid sequences rather than failing** (Wallabag's `sanitizeUTF8Text` lesson). |
| **Title** | Strip tags, collapse whitespace, trim, cap 500 chars. Strip a trailing `" | Site Name"` / `" - Site Name"` when it matches `publisher`. |
| **Whitespace** | Collapse runs; normalize NBSP to space; preserve paragraph breaks in `plainText` as `\n\n` |
| **Relative URLs** | Absolutise every `href`/`src` against `resolvedUrl` before sanitization |
| **Images** | `referrerpolicy="no-referrer"` + `loading="lazy"` added; MVP does **not** localise images to R2 (deferred — P3 §18) |
| **Dates** | Accept epoch seconds, ISO-8601, RFC-2822. Reject implausible values (before 1990, more than 2 days in the future). Failure is logged, field left null. |
| **Language** | Validate as a real locale; normalize `-` to `_`; drop invalid rather than store |
| **Reading time** | 200 wpm, floor 30s |

---
# 9. AI UNDERSTANDING ARCHITECTURE

## 9.1 One service, one call, zero agents

Per P2 §11 and P3 §18. Summarization, classification, entity extraction and topic extraction are **fields of one structured response**, not four services. Four calls would cost roughly 4× for no quality gain, because all four read the same text once.

```
UnderstandingService.understand(objectId) → UnderstandingResult
```

It is a **service**, not an agent: fixed input, fixed output shape, zero tool calls, one model call, unit-testable against fixtures.

## 9.2 Provider abstraction — reuse the existing seam untouched

The service calls `callLlm(input)` from `lib/agent/tools/llm.ts`. It never imports `anthropic.ts` or names a provider. Everything already built stays: `LLM_PROVIDER` dispatch, an unrecognised value being a misconfiguration rather than a silent fallback, `isDevModeAllowed()` hard-blocking the development provider in production, and `executionMode: "development"` threading through so a fixture run can never be mistaken for a real one.

**One extension required.** `LlmCallInput` is currently `{ system, prompt, maxTokens }`. Structured outputs need a schema, and cost control needs caching and effort:

```
LlmCallInput += {
  responseSchema?: JSONSchema     // → output_config.format
  cacheBreakpointAfterSystem?: boolean
  effort?: "low" | "medium" | "high"
}
LlmCallOutput += { cachedTokens?: number }
```

Additive to the interface; each provider implements what it supports and ignores the rest. **The Gemini adapter must not silently drop `responseSchema`** — if a provider cannot honour it, `isConfigured()` for the structured path returns false with a real reason.

**Model:** `claude-opus-5`, adaptive thinking, `effort: "medium"` as the starting point. The understanding stage's output quality *is* the product's quality ceiling (P2 §5) and a weak extraction is not recoverable without re-billing the whole library. Its 1M context also removes the chunk-and-merge stage entirely — a real architectural simplification, not just a quality one.

## 9.3 Prompt structure — built for cache hits

Prompt caching is the largest single cost lever (P2 §5), and it is a **prefix** match: any byte change anywhere in the prefix invalidates everything after it. So the request is ordered stable-first:

```
┌─ SYSTEM (frozen, byte-identical for every object in the product) ──┐
│  role · extraction rules · what a good tl;dr is · the fixed        │
│  category enum · constraints ("never invent a date", "topics must  │
│  be nouns", "quote key ideas verbatim from the text")              │
└────────────────────────────── ⟵ CACHE BREAKPOINT ─────────────────┘
┌─ WORKSPACE VOCABULARY (stable per workspace, changes slowly) ──────┐
│  "Existing topics in this library — REUSE these where they fit:    │
│   AI Agents, Pricing Strategy, Hiring, …" (top 60 by object_count) │
└────────────────────────────────────────────────────────────────────┘
┌─ ARTICLE (volatile, always last) ──────────────────────────────────┐
│  title · domain · publishedAt · plainText (truncated §9.6)         │
└────────────────────────────────────────────────────────────────────┘
```

**Passing the existing vocabulary is the single most important quality decision in this section.** Without it, topic labels fragment into "AI Agents" / "AI agents" / "Agentic AI" / "Agents" and the shelves — the #1 wow moment — look broken. With it, the model reuses the user's own vocabulary and the library converges instead of sprawling.

The vocabulary sits *after* the breakpoint so it does not invalidate the frozen prefix, and it changes slowly enough that it caches well per workspace in its own right.

> **Verification:** `usage.cache_read_input_tokens` must be non-zero across consecutive calls. Zero means a silent invalidator (a timestamp, a UUID, unsorted vocabulary) is in the prefix. This is a week-3 acceptance check, not a later optimisation.

## 9.4 Structured output schema

Requested via `output_config: { format: … }` — not by asking for JSON in the prompt and parsing defensively. This removes `unparseable_output` as a failure class rather than retrying around it.

```
{
  tldr:               string   ≤240 chars, one sentence, no preamble
  summary:            string   2–4 sentences
  key_ideas:          [ { text: string ≤200, evidence_quote: string } ]  1–5
  topics:             [ { label: string ≤40, confidence: 0..1,
                          category: <fixed enum §12.2> } ]              1–5
  entities:           [ { name: string, type: person|org|product|
                          place|concept|work, salience: 0..1 } ]        0–10
  reading_difficulty: integer 1..5
  importance_signal:  integer 1..5
  detected_language:  string   BCP-47
  content_warning:    null | "paywalled" | "error_page" | "login_wall"
                              | "mostly_navigation"
}
```

**`content_warning` earns its place.** Extraction cannot reliably tell a paywall stub from a short article, but a model reading the text can. It is the cheapest possible quality gate on the whole pipeline: an object flagged `paywalled` is marked `partial` with an honest message instead of being presented as a successfully-saved 80-word article.

**`importance_signal` is used only as a small ranking input and is never displayed.** Showing a model's opinion of an article's importance to the person who chose to save it is a product mistake.

## 9.5 Validation

Layered, because a schema-valid response can still be unusable:

1. **Schema** — enforced by the API; a violation is a provider bug, not an application path
2. **Semantic**
   - `tldr` non-empty, ≤240 chars, not a prefix of `summary`
   - every `key_ideas[].evidence_quote` must appear **verbatim in `plain_text`** — the cheapest available hallucination check, and it runs in microseconds
   - `topics[].label` 2–40 chars, not a stopword, not equal to the domain
   - `category` ∈ the fixed enum
   - `detected_language` parses as a locale
3. **On semantic failure** — drop the offending *field*, keep the rest, log `understanding_partial_field`. **Never discard a whole good response over one bad quote.**
4. **On total failure** — one retry with a stricter reminder, then `partial`

## 9.6 Token limits and truncation

Opus 5's 1M context means **truncation is a cost decision, not a capacity one**.

| Rule | Value |
|---|---|
| Input cap | **30,000 tokens** of article text (~22,000 words) — covers the overwhelming majority of articles whole |
| Over cap | **head 60% + tail 25%**, joined by an explicit `[…]` marker. Never a hard mid-sentence cut. The tail matters: conclusions carry the thesis. |
| Recorded | `source_meta.truncated = true`, `source_meta.original_tokens` — honest, and it explains a thin summary later |
| Output cap | `max_tokens: 4000` — the schema cannot legitimately need more |
| Floor | <100 words of `plain_text` → **skip the call entirely**, mark `partial`, `failure_code = 'content_too_short'`. Paying to summarise a 40-word stub is pure waste. |

## 9.7 Caching and idempotency

```
UNIQUE (object_id, prompt_version, content_hash)
```

Re-running `understand` on unchanged content with an unchanged prompt is a no-op that costs nothing. Bumping `PROMPT_VERSION` correctly re-runs the whole library — which is exactly what you want when the prompt improves, and exactly what must be deliberate rather than accidental.

**Cross-object cache:** two users saving the same URL produce the same `content_hash`. The MVP does **not** share intelligence across workspaces — a cross-tenant cache is a privacy question that deserves its own decision, not a silent optimisation. Noted as a Phase 8 cost lever in §27.

## 9.8 Failure handling

| Code | Status | Retry | Result |
|---|---|---|---|
| `provider_error` | failed | ×5 backoff | → `partial` |
| `rate_limited` | failed | `Retry-After`, ×8 | → `partial` |
| `unparseable_output` | failed | ×1 stricter | → `partial` |
| `content_policy_refusal` | failed | none | → `partial`, honest message |
| `context_too_large` | failed | none | truncate harder, ×1 |
| `budget_exceeded` | **blocked** | none | → `partial`, **auto-resumes on period reset** |
| `missing_credential` | **blocked** | none | → `partial`, resumes when configured |
| `content_too_short` | skipped | none | → `partial` |

`blocked` ≠ `failed`: the capability works, a condition just has to change. Vocabulary inherited from `lib/agent/types.ts`.

## 9.9 Cost measurement

Every call writes a `cost_ledger` row with real tokens from `LlmCallOutput` × the active provider's rate via the existing `lib/agent/cost.ts`. **A null `cost_usd` means unmeasured, not free** — the existing semantics, preserved. `checkQuota` runs *before* the call; the ledger records *after*.

---

# 10. EMBEDDINGS

## 10.1 What gets embedded

**Chunks of `plain_text`. Not whole documents.** Document-level embeddings dilute a 3,000-word article into an average that matches nothing well, and they make span-level citation impossible later.

| Decision | Value | Reason |
|---|---|---|
| Unit | chunk | precision + future citation |
| Strategy | structure-aware: split on paragraph boundaries, pack toward the target, never split mid-sentence | a chunk straddling two sections retrieves badly |
| Target size | 500–800 tokens | large enough to carry an idea, small enough to locate |
| Overlap | ~15% | an answer straddling a boundary stays findable |
| Context prefix | title + section heading prepended **at embed time only**, not stored | fixes chunks full of pronouns without polluting the stored text or a future cited span |
| Offsets | `char_start` / `char_end` into `plain_text` | the link to highlights in weeks 9–12 |
| Also embedded | **the `tldr` + `title` as chunk ordinal 0** | makes short queries match the document's gist, which pure body chunks often miss |

## 10.2 Abstraction

`EmbeddingProvider`, mirroring `LlmProvider` exactly — same shape, same `isConfigured()` / `notConfiguredReason()` discipline, same "unrecognised value is a misconfiguration, never a silent fallback" rule.

```
interface EmbeddingProvider {
  id: string
  displayName: string
  dimensions: number
  isConfigured(): boolean
  notConfiguredReason(): string
  embedBatch(texts: string[]): Promise<ToolActionResult<{
    vectors: number[][]; model: string; unitsBilled: number
  }>>
}
```

`EMBEDDING_PROVIDER` selects it. `embedding_model` is written on **every chunk row**, which is what makes a future model change a resumable backfill instead of an incident.

## 10.3 Dimensions — and a hard constraint

> **DECISION** — `vector(1536)`.
> **REASON** — two constraints bound this. First, **pgvector's HNSW index supports at most 2000 dimensions on the `vector` type**, which rules out 3072-dim models unless `halfvec` is adopted (extra complexity for the MVP). Second, C9 is open: there is no golden retrieval set yet to measure against, so this is a judgement call and must be labelled as one. 1536 is a widely-supported dimension across providers, indexes cleanly under the 2000 limit, and leaves room to move to 1024 later (a strictly cheaper backfill) if measurement favours it.
> **TRADE-OFF** — we are fixing a column type before we have the data to justify it. Mitigated by `embedding_model` per row and by making the golden set a week-6 deliverable rather than a later nicety.

## 10.4 Storage, indexing, updates

| Concern | Decision |
|---|---|
| Storage | `object_chunks.embedding vector(1536)`, same row as text and `fts` |
| Index | `HNSW (embedding vector_cosine_ops)`, **built after the first bulk import**, not on an empty table |
| Tuning | start at pgvector defaults; revisit `m` / `ef_construction` only if build time or recall shows a problem |
| Update | content changes → `content_hash` changes → **`DELETE` all chunks for the object + `INSERT` new, in one transaction**. Never partial updates. |
| Batching | one provider call per ≤96 chunks; typical article = 1 call |
| Idempotency | `sha256(objectId:embed:contentHash:embeddingModel)` + delete-then-insert converges on redelivery |
| Duplicates | two objects with identical `content_hash` in the same workspace cannot exist (URL dedupe). Across workspaces, embeddings are **not** shared — same privacy reasoning as §9.7. |
| Retry | provider 5xx/429/timeout ×5; `dimension_mismatch` is **terminal** (a config error, not transient) |

## 10.5 Is Postgres + pgvector sufficient for the MVP?

**Yes, comfortably, and not marginally.** A realistic MVP ceiling is ~500 users × ~3,000 objects × ~15 chunks ≈ 22M chunks in the extreme; a realistic first-90-days figure is closer to 1–3M. HNSW handles that on a single well-sized instance. More importantly, keeping vectors in Postgres means **the tenant pre-filter and the kNN are the same query** — a separate vector store turns filtered search into a cross-store join, which is both slower and the exact place cross-tenant bugs hide.

Migration triggers are already documented (P2 §14/§15): >20M chunks, HNSW maintenance affecting write latency, multi-vector retrieval becoming a requirement, or filtered-kNN recall degrading against the golden set. The `SearchProvider` seam makes that a swap.

---

# 11. SEARCH

## 11.1 The three tiers

| Tier | Budget | Mechanism | MVP |
|---|---|---|---|
| **1 · Instant** | <50ms | Trigram prefix on `title` + topic/collection label match. **No vector, no model.** | ✔ |
| **2 · Results** | <200ms p95 | Hybrid: `fts` GIN + HNSW kNN + metadata, RRF-fused | ✔ |
| **3 · Answer** | 1–2s stream | Synthesised, cited | **✘ weeks 9–12** (C7) |

Tier 1 exists so perceived latency is ~zero while tier 2 runs. The user is never looking at an empty box.

## 11.2 Query shape

```sql
WITH scope AS (SELECT $workspace_id AS ws),

kw AS (   -- keyword branch, tenant pre-filtered
  SELECT c.object_id, c.id AS chunk_id,
         ts_rank_cd(c.fts, websearch_to_tsquery('english', $q)) AS s,
         row_number() OVER (ORDER BY ts_rank_cd(...) DESC) AS rank
  FROM object_chunks c
  JOIN knowledge_objects o ON o.id = c.object_id
  WHERE c.workspace_id = $workspace_id        -- ← FIRST predicate
    AND o.deleted_at IS NULL
    AND <metadata filters>                    -- ← PRE-filter, both branches
    AND c.fts @@ websearch_to_tsquery('english', $q)
  ORDER BY s DESC LIMIT 100
),

vec AS (  -- semantic branch, tenant pre-filtered BEFORE kNN
  SELECT c.object_id, c.id AS chunk_id,
         1 - (c.embedding <=> $qvec) AS s,
         row_number() OVER (ORDER BY c.embedding <=> $qvec) AS rank
  FROM object_chunks c
  JOIN knowledge_objects o ON o.id = c.object_id
  WHERE c.workspace_id = $workspace_id        -- ← FIRST predicate
    AND o.deleted_at IS NULL
    AND <metadata filters>
  ORDER BY c.embedding <=> $qvec LIMIT 100
),

fused AS (  -- Reciprocal Rank Fusion, k = 60
  SELECT object_id, chunk_id,
         SUM(1.0 / (60 + rank)) AS rrf,
         bool_or(src='kw') AS kw_hit, bool_or(src='vec') AS vec_hit
  FROM ( SELECT *, 'kw' src FROM kw UNION ALL SELECT *, 'vec' src FROM vec ) u
  GROUP BY object_id, chunk_id
)

SELECT o.*, best.chunk_id, best.rrf,
       CASE WHEN kw_hit AND vec_hit THEN 'both'
            WHEN vec_hit THEN 'semantic' ELSE 'keyword' END AS match_type,
       final_score(...) AS score
FROM (SELECT DISTINCT ON (object_id) * FROM fused
      ORDER BY object_id, rrf DESC) best
JOIN knowledge_objects o ON o.id = best.object_id
LEFT JOIN user_object_state s ON s.object_id = o.id AND s.user_id = $user_id
ORDER BY score DESC, o.created_at DESC
LIMIT $limit OFFSET/CURSOR;
```

**The invariant that must never be relaxed:** `workspace_id` is the first predicate on *both* branches, applied **before** kNN. Post-filtering a global top-k is wrong twice — it is a privacy risk, and it is a correctness bug (a user with a small library gets few or zero results because their rows never made the global top-k).

## 11.3 Ranking

```
score =  rrf_base
      ×  recency_boost      1 + 0.15 · exp(−age_days / 180)
      ×  engagement_boost   ×1.15 opened · ×1.25 read(progress>0.7)
      ×  starred_boost      ×1.10
      ×  importance         1 + 0.03 · (importance_signal − 3)
      ×  archived_penalty   ×0.85   ← present but findable, never hidden
```

**Recency is a boost, never a filter.** The core hypothesis is finding the thing from eight months ago; a recency filter would break it. **Default range is All time**, non-negotiable.

Personal affinity (P2 §17) is **not** in the MVP — it needs `activity_events` history that does not exist yet.

## 11.4 Query parsing

Deliberately small: `websearch_to_tsquery` handles `"exact phrase"`, `OR`, `-exclusion` natively. On top of that, the parser extracts leading filter tokens (`topic:`, `domain:`, `author:`, `is:unread|starred|archived`, `after:`/`before:`) and passes the remainder as the free-text query. Trigram fallback fires when `fts` returns nothing.

**Not built:** a query DSL, boolean nesting, field-weighted scoring syntax, fuzzy operators. Over-engineering search is explicitly called out in the brief and these are the things to refuse.

## 11.5 Pagination, facets, zero results

- **Cursor-based** — `(score, object_id)` encoded opaquely. Offset pagination degrades and shifts under concurrent writes.
- **Facets** — topic, domain, author counts computed from the fused set (capped at 500) in the same round trip.
- **Zero results is a designed screen, not an error** (P3 §9): nearest-by-embedding results with the similarity shown, plus adjacent topics from the user's own library. The fallback ladder is exact → semantic → topic-adjacent → nearest neighbour. **Something useful always comes back.**

## 11.6 Performance expectations

| | Target | Guard |
|---|---|---|
| Tier 1 | <50ms p95 | trigram index only |
| Tier 2 | **<200ms p95** | `EXPLAIN` asserted in CI on a seeded 100k-chunk fixture |
| Query embedding | <100ms | cached by `sha256(query)` for 5 min — repeated/refined queries are common |
| Recall@10 | **≥0.8** on the golden set | week-6 deliverable, gates every later search change |

---

# 12. TOPIC SHELVES

**The MVP wow moment (P3 §3).** Everything here is chosen to be *reliable* rather than clever, because a shelf that is subtly wrong is worse than no shelf.

## 12.1 The two-level shape, without clustering

The brief asks for `AI → Agents / Models / Infrastructure`. Hierarchy normally requires topic embeddings plus an LLM naming pass — the Phase 8 "rich version", and too risky for week 6.

> **DECISION** — get the two-level shape from a **fixed category enum** the model classifies into, plus free-form topics. No clustering.
> **REASON** — the model already returns topics in the same call; adding `category` from a closed list costs zero extra calls and is near-deterministic. It produces exactly the shape the brief asks for, with none of the failure modes of unsupervised clustering (unstable groupings that reshuffle on every new save, and nonsense cluster names).
> **ALTERNATIVES** — embedding clustering + LLM naming (Phase 8; unstable at low volume, and the library reshuffles as it grows, which reads as broken); flat topics only (delivers the wow but not the requested shape); a fixed taxonomy for topics too (rigid, and it would not reflect *the user's* vocabulary — the thing that makes shelves feel personal).
> **TRADE-OFF** — categories are ours, not the user's. Mitigated: topics *within* a category are entirely the user's vocabulary, and the emotional beat ("these are my topics") lives at the topic level.

```
TECHNOLOGY                      ← fixed enum, 10 values
├── AI Agents (212)             ← free-form, the user's own vocabulary
├── Retrieval (48)
└── Infrastructure (31)
BUSINESS
├── Pricing Strategy (94)
└── Hiring (67)
```

**Category enum (fixed, 10):** `technology · business · science · health · culture · politics · finance · design · education · other`.

`topics.parent_id` exists and is **NULL in the MVP** — reserved for real hierarchy in Phase 8.

## 12.2 Topic assignment and naming

The model returns 1–5 topics per object, each with `label`, `confidence` and `category`, constrained by the workspace vocabulary passed in the prompt (§9.3).

**`TopicResolver` — the component that decides whether shelves look coherent or fragmented:**

```
for each returned label:
  1  slug = slugify(label)        lowercase · singularize · strip punctuation
                                  · collapse whitespace · strip leading "the"
  2  EXACT   SELECT … WHERE workspace_id AND slug = $slug          → reuse
  3  FUZZY   SELECT … WHERE workspace_id
             AND similarity(slug, $slug) > 0.85    (pg_trgm)       → reuse
  4  CREATE  only if confidence ≥ 0.6 AND label passes validation
  5  CAP     at most 2 NEW topics per object
```

Step 5 is the guard against vocabulary explosion. Without it a 3,000-item import produces ~4,000 topics and the shelves are useless.

**Naming rules:** Title Case for display; nouns or noun phrases only; 2–40 chars; reject stopwords, the domain name, generic terms (`article`, `blog`, `news`, `post`), and anything that is a full sentence.

## 12.3 Confidence, merging, duplicates, empties

| Concern | Rule |
|---|---|
| **Confidence** | Stored on `object_topics`. **Assignments below 0.5 are dropped, not shown greyed.** A shelf must not contain things that are only maybe about it. |
| **Merging** | A nightly `topic_merge` job finds pairs with `similarity(slug) > 0.9` or one label contained in the other with compatible categories, and merges the smaller into the larger. `is_user_renamed` topics are **never** auto-merged. |
| **Duplicates** | Prevented at write time by steps 2–3; the merge job catches what drifts in. |
| **Empty topics** | `object_count = 0` (last object deleted or reassigned) → deleted by the same nightly job. Never rendered. |
| **Long tail** | Shelves render only topics with `object_count ≥ 3`. Below that, objects still carry the topic and it is still filterable and searchable — it just does not get a shelf. **A shelf of one item looks like a bug.** |

## 12.4 User editing

| Action | Effect |
|---|---|
| Rename a topic | Updates `label`, sets `is_user_renamed = true` → **permanently outranks the model**, excluded from auto-merge, and the new label enters the vocabulary passed to future prompts |
| Remove a topic from an object | Deletes the `ai` assignment row and writes a tombstone in `source_meta` so re-running understanding does not re-add it |
| Add a topic to an object | Creates a `source = 'user'` row — **never touched by AI re-runs** |
| Merge two topics | Explicit user action; reassigns and deletes the source |
| Hide a topic from shelves | `object_count` preserved; a `hidden` flag suppresses the shelf only |

**The rule:** a user action always wins, permanently, and re-running understanding must never undo one.

## 12.5 Automatic vs manual

**100% automatic. Zero setup. No configuration screen.** The user does nothing and gets shelves; editing is available but never required. This is the entire point — P3 §11's product bet is a system whose value does not depend on discipline.

## 12.6 Rendering

`GET /api/topics` returns categories → topics → counts → 3 cover images. Shelves are ordered by `object_count DESC` within a category; categories by total count. **Shelves only render once the library has ≥50 objects** — below that the grid is a better view and shelves of 2 look broken.

---

# 13. COLLECTIONS

**Conditional on C4.** Specified assuming C4 option (b): **smart collections only in the MVP.**

## 13.1 Rationale

P3 §11 concluded hybrid-with-automatic-leading. In an 8-week build:
- **Automatic** is delivered by Topic Shelves (§12) — already the wow moment
- **Smart collections** = "Save this view", ~2 days, and it makes the Collections nav item honest
- **Manual** collections wait for weeks 13–16

## 13.2 Smart collections

A named, saved filter state. `is_smart = true`, `rule JSONB` holding **exactly the query shape `GET /api/library` accepts** — so there is one filter vocabulary in the entire product, not two.

```json
{ "q": null, "topics": ["ai-agents","retrieval"], "domains": [],
  "authors": [], "isUnread": true, "isStarred": null,
  "savedAfter": 1704067200000, "sort": "recent" }
```

Evaluated at read time. Always current, never stale, no membership rows, no sync job. Creating one is a single insert from the current library filter state.

## 13.3 Membership, ordering, visibility, deletion

| Concern | MVP |
|---|---|
| Membership | Smart: computed. Manual: `collection_objects` (table specified, unused in MVP). |
| Ordering | Collections by `position` then `created_at`. Objects inside inherit the library sort. |
| Visibility | Column exists, **always `private`**. Sharing is Phase 10. |
| Deletion | Soft-delete the collection. **Never touches objects.** A "delete collection" that deletes content would be catastrophic and users fear it — the confirmation copy must say so explicitly. |
| Cover | `cover_object_id`, else a 2×2 mosaic of the first four covers |

---

# 14. IMPORT

**Non-negotiable for the MVP** (P3 §18): it solves cold start, it is the reason the wow moment lands in minute three rather than week three, and Pocket's 2025 shutdown created a displaced population actively looking for a destination.

## 14.1 Formats

| Source | Format | Fields available | Priority |
|---|---|---|---|
| **Pocket** | CSV export (`url,title,time_added,tags,status`) and the legacy HTML `<ul><li><a>` list | url, title, saved-at, tags, archived | **1** |
| **Instapaper** | CSV (`URL,Title,Selection,Folder,Timestamp`) | url, title, folder, saved-at | **2** |
| **Raindrop** | CSV (`url,folder,title,note,tags,created`) | url, title, folder, tags, note, created | **3** ⚠ C3 |
| Wallabag | JSON array | full metadata incl. content | ⚠ C3 alternative |

**Generic fallback:** any CSV with a detectable URL column, and Netscape bookmark HTML. Cheap, and it catches the long tail of "my other app exports something weird" without writing another parser.

**Imported fields map to:** `submitted_url`, `title` (overwritten by extraction if better), `original_saved_at` ← the export's timestamp, `source_app`, folders/tags → **`source = 'user'` topic assignments** (a user's existing organisation is real signal and must not be discarded), `status=archive` → `user_object_state.is_archived`.

> `original_saved_at` matters more than it looks: without it, a 3,000-item Pocket import makes every article look saved today, which destroys the library's sense of history and makes the "one from the archive" moment impossible later.

## 14.2 Upload flow — never block the request

```
1  POST /api/import/upload-url  → presigned R2 PUT (server-side, scoped)
2  Browser uploads directly to R2               ← the file never touches
                                                   a Next.js function
3  POST /api/import { source, fileKey, filename }
     · validate size (≤50 MB) and declared source
     · INSERT imports (status='uploaded')
     · pgboss.send('import_parse', …)   ← same transaction
     · 202 { importId, status:'uploaded' }
4  GET /api/import/:id  → poll for progress
```

**Direct-to-R2 upload is the decision that makes large imports possible at all.** A 50 MB file through a serverless function is a memory and timeout problem that has no good solution.

## 14.3 The `import_parse` job

```
stream-parse the file  (never load 3,000 rows into memory at once)
   ↓  per row
   validate URL syntax          → invalid  → import_items(outcome='invalid')
   canonicalize + hash §4.4
   ↓  batches of 500
   SELECT existing url_hash for the batch  (one query per batch)
   partition into: duplicates / new
   ↓  one transaction per batch
   INSERT knowledge_objects (pipeline_status='pending', import_id, source_app,
                             original_saved_at)  ON CONFLICT DO NOTHING
   INSERT import_items (outcome, object_id, reason)
   INSERT ingestion_jobs (stage='capture', status='pending')
   pgboss.sendBatch('capture', …, { priority: LOW })
   UPDATE imports SET queued_items = queued_items + n
   ↓
mark imports.status='processing'; the pipeline takes over
```

**Batching in 500s bounds both memory and transaction size.** A single transaction for 3,000 rows would hold locks far too long.

## 14.4 Not starving live saves

The single most important operational property of import. Four mechanisms:

| Mechanism | Detail |
|---|---|
| **Priority** | Import-sourced capture jobs are enqueued at **LOW**; live saves are NORMAL. pg-boss serves higher priority first. |
| **Per-workspace concurrency cap** | At most **5** concurrent import-sourced pipeline jobs per workspace, regardless of queue depth. One user's 3,000-item import cannot consume the pool. |
| **Separate queue name** | `capture` vs `capture_import` — separate concurrency settings and separate metrics, so "is import slow" and "is saving slow" are different questions with different answers. |
| **Understanding via Batch API** | Import-sourced `understand` jobs go through the provider's batch endpoint at **50% cost** (P2 §5). No latency requirement, half the price. |

## 14.5 Progress, partial failure, retry, report

**Progress** — `GET /api/import/:id` returns counters from a single `GROUP BY` over `import_items` plus the objects' `pipeline_status`. The UI polls every 2s while active. **Real cards appear in the library as they complete** — the progress bar is not the primary feedback, the filling library is (P3 §4).

**Partial failure is the normal case.** A 3,000-item import will contain dead links, paywalls and blocked domains. `imports.status = 'completed'` when every item reaches a terminal state, **even if many failed** — the import succeeded, some articles did not.

**Retry** — `POST /api/import/:id/retry-failed` re-enqueues only items whose objects are `failed` with a retryable code. Per-item retry from the library card also works.

**The report** — this is what makes the feature trustworthy:

```
Imported from Pocket
  2,847 rows
  2,591  saved and ready
     94  couldn't be read       → list, with the real reason per item
    148  already in your library
     14  invalid URLs           → list
  [ Retry the 94 ]   [ Download report CSV ]
```

Every skipped row is explainable, because `import_items` stores the reason per row. "Why did 214 of my 3,000 not import" is the first question every importing user asks, and a counter alone cannot answer it.

## 14.6 Scale expectations

| | Target |
|---|---|
| File size | ≤50 MB, ≤50,000 rows |
| Parse + enqueue 3,000 rows | **<60s** |
| First cards visible | **<10s** after parse starts |
| Full pipeline, 3,000 items | 20–60 min at the concurrency cap |
| Live save latency during an import | **unchanged** — the acceptance test for §14.4 |

---
# 15. API CONTRACTS

**Naming note:** Phase 2 §28 used `/api/objects`; this brief specifies `/api/library`. **`/api/library` wins** — it is the later instruction and it reads better from the client. Phase 2 §28's paths are superseded.

## 15.0 Conventions

Applied to every endpoint below, stated once:

| Concern | Rule |
|---|---|
| **Auth** | `requireSession()` → `AccessScope { userId, workspaceId, role }`. 401 if absent. |
| **Tenancy** | `workspace_id` from the **verified session only** — never a request field. Cross-tenant id → **404, never 403** (existing `withApiHandler` behaviour). |
| **Errors** | `{ error: string, code?: string, requestId: string }`. Codes from the existing map: 400 validation · 401 unauthenticated · 404 not-found-or-cross-tenant · 409 conflict · 429 rate-limited/quota · 503 db-not-configured · 500 unhandled. |
| **Pagination** | Cursor only. `?cursor=&limit=` (default 24, max 100) → `{ items, nextCursor }`. Never offset. |
| **Idempotency** | Mutating endpoints accept an optional `Idempotency-Key` header. |
| **Rate limits** | Per `(scope, workspaceId)` via the existing `checkRateLimit`. |

## 15.1 Endpoint table

| Method · Path | Auth | Input | Output | Errors | Rate limit | Tenancy |
|---|---|---|---|---|---|---|
| **POST `/api/save`** | ✔ | `{ url, source?: "web"\|"extension"\|"api" }` | `201 { id, pipelineStatus, submittedUrl, domain, faviconUrl }` · `200 { duplicate:true, object }` | 400 invalid url · 429 rate/quota | **30/min** | insert scoped |
| **GET `/api/library`** | ✔ | `?filter=all\|unread\|starred\|archived` `&topic=&domain=&author=&kind=&savedAfter=&savedBefore=&sort=recent\|saved\|title\|reading_time&view=&cursor=&limit=` | `{ items: LibraryCard[], nextCursor, total?, facets? }` | 400 bad filter | 120/min | `workspace_id` predicate |
| **GET `/api/library/:id`** | ✔ | — | `{ object, content:{cleanHtml,plainText?}, intelligence, topics[], userState }` | 404 | 240/min | scoped |
| **PATCH `/api/library/:id`** | ✔ | `{ title? }` | `{ object }` | 400 · 404 | 60/min | scoped |
| **DELETE `/api/library/:id`** | ✔ | — | `204` | 404 | 60/min | scoped, soft-delete |
| **POST `/api/library/:id/state`** | ✔ | `{ isStarred?, isArchived?, readingProgress? }` | `{ userState }` | 400 · 404 | **600/min** (progress is chatty) | `(user_id, object_id)` |
| **POST `/api/library/:id/topics`** | ✔ | `{ add?: string[], remove?: string[] }` | `{ topics[] }` | 400 · 404 | 60/min | scoped |
| **POST `/api/library/:id/retry`** | ✔ | `{ stage?: "capture"\|"understand"\|"embed" }` | `202 { jobId, pipelineStatus }` | 404 · 409 not-retryable | 10/min | scoped |
| **GET `/api/processing/:id`** | ✔ | — | `{ objectId, pipelineStatus, stages:[{stage,status,attempt,errorCode,startedAt,finishedAt}], failureCode, failureMessage }` | 404 | 600/min | scoped |
| **GET `/api/search`** | ✔ | `?q=&topic=&domain=&author=&filter=&savedAfter=&savedBefore=&cursor=&limit=` | `{ results:[{ ...LibraryCard, score, matchType, matchedSpans:[{text,chunkId,charStart,charEnd}] }], facets, nextCursor, fallback? }` | 400 empty q | **60/min** | pre-filter both branches |
| **GET `/api/search/instant`** | ✔ | `?q=` (≥2 chars) | `{ titles[], topics[], collections[] }` | — | 600/min | scoped |
| **GET `/api/topics`** | ✔ | `?minCount=3` | `{ categories:[{ category, topics:[{id,label,slug,objectCount,covers[3]}] }], totalObjects }` | — | 120/min | scoped |
| **PATCH `/api/topics/:id`** | ✔ | `{ label?, hidden? }` | `{ topic }` | 400 · 404 · 409 dup slug | 30/min | scoped, sets `is_user_renamed` |
| **POST `/api/topics/merge`** | ✔ | `{ sourceId, targetId }` | `{ topic }` | 400 · 404 | 10/min | scoped |
| **GET `/api/collections`** | ✔ | — | `{ collections:[{id,name,description,isSmart,objectCount,cover}] }` | — | 120/min | scoped |
| **POST `/api/collections`** | ✔ | `{ name, description?, rule }` | `201 { collection }` | 400 · 409 dup name | 30/min | scoped |
| **GET `/api/collections/:id`** | ✔ | `+ library params` | `{ collection, items[], nextCursor }` | 404 | 120/min | scoped |
| **PATCH `/api/collections/:id`** | ✔ | `{ name?, description?, rule?, position? }` | `{ collection }` | 400 · 404 | 60/min | scoped |
| **DELETE `/api/collections/:id`** | ✔ | — | `204` | 404 | 30/min | soft-delete, **objects untouched** |
| **POST `/api/import/upload-url`** | ✔ | `{ filename, sizeBytes, source }` | `{ uploadUrl, fileKey, expiresAt }` | 400 too large · 415 bad source | 10/hr | key namespaced by workspace |
| **POST `/api/import`** | ✔ | `{ source, fileKey, filename }` | `202 { importId, status }` | 400 · 409 concurrent import | **3/hr** | scoped |
| **GET `/api/import/:id`** | ✔ | — | `{ id, source, status, counts:{total,queued,duplicate,invalid,completed,failed}, startedAt, finishedAt }` | 404 | 600/min | scoped |
| **GET `/api/import/:id/items`** | ✔ | `?outcome=&cursor=` | `{ items:[{rowNumber,submittedUrl,outcome,reason,objectId}], nextCursor }` | 404 | 60/min | scoped |
| **POST `/api/import/:id/retry-failed`** | ✔ | — | `202 { requeued }` | 404 · 409 | 5/hr | scoped |
| **GET `/api/usage`** | ✔ | — | `{ plan, metrics:[{metric,used,limit,periodEnd}] }` | — | 60/min | scoped |
| **GET `/api/me`** | ✔ | — | `{ user, workspace }` | — | 120/min | self |
| `/api/auth/*` | — | Auth.js | — | — | 20/min signup | — |

## 15.2 Shared shapes

```
LibraryCard {
  id, title|null, domain, faviconUrl|null, previewImageUrl|null,
  authors[], publishedAt|null, readingTimeSeconds|null, excerpt|null,
  tldr|null,                                   // from object_intelligence
  topics: [{ id, label, category }],           // ≤3 for the card
  pipelineStatus, failureCode|null, failureMessage|null,
  userState: { isStarred, isArchived, readingProgress } | null,
  createdAt, originalSavedAt|null, sourceApp|null
}
```

**`tldr` and `userState` are nullable on purpose.** A card in `pending` has no TL;DR, and an untouched object has no state row. **Every consumer must render correctly with both null** — this is the data contract, not a styling preference (§8.2).

## 15.3 Deliberately not built

`POST /api/library/:id/ask` (C7, weeks 9–12) · annotations (weeks 9–12) · `/api/export` (weeks 13–16) · any share endpoint (Phase 10) · webhooks · a public API · a Wallabag-compatible v1 shim (P2 §3 notes it as a cheap distribution lever — **out of MVP scope**).

---

# 16. FRONTEND CONTRACTS

Backend contracts per screen. **No visual design.** Every screen specifies four states, because P3 §28's rule is that *empty* means two different things and conflating them is a common, costly mistake.

## 16.1 Onboarding — `/welcome`

| | |
|---|---|
| **Data** | `GET /api/me` → `{ user, workspace }`; `GET /api/library?limit=1` → is the library empty? |
| **Calls** | `POST /api/save` (paste path) · `POST /api/import/upload-url` → R2 PUT → `POST /api/import` (import path) |
| **Loading** | Skeleton on the two doors; never a full-page spinner |
| **Empty** | *This screen is the empty state.* Two doors: paste a link, or import. Extension prompt below. |
| **Error** | Import upload failure → inline retry, file kept selected. Save failure → inline, URL preserved in the field. |
| **Optimistic** | On paste+Enter, navigate to `/library` immediately and show the pending card there. Do not wait for 201. |
| **Realtime** | Import: poll `GET /api/import/:id` every **2s** while `status ∈ {uploaded,parsing,processing}` |

## 16.2 Save — global (`⌘K` and header button)

| | |
|---|---|
| **Data** | none |
| **Calls** | `POST /api/save` |
| **Loading** | Button spinner ≤200ms only; beyond that the card is already in the list |
| **Empty** | n/a |
| **Error** | 400 → inline "that doesn't look like a URL". 429 → "you've hit your limit" + plan link. Network → **queue locally and retry**; show "will save when you're back online". |
| **Optimistic** | **Insert a pending card into the list immediately**, before the response. Reconcile on 201; remove and toast on failure. |
| **Realtime** | The new card subscribes to `GET /api/processing/:id` |

## 16.3 Library — `/library`

| | |
|---|---|
| **Data** | `GET /api/library` → `{ items, nextCursor, facets }`; `GET /api/topics` when shelves render |
| **Calls** | list · `POST /api/library/:id/state` (star/archive) · `DELETE` · infinite scroll on `nextCursor` |
| **Loading** | **Skeleton cards at the real column count** — never a centred spinner (causes layout shift on arrival). Subsequent pages append skeletons. |
| **Empty A — no objects at all** | The onboarding component, inline |
| **Empty B — filter matches nothing** | *"No results for this filter"* + one-click clear. **Must be visually distinct from A.** |
| **Error** | Inline retry banner; **already-loaded cards stay on screen** |
| **Optimistic** | Star/archive flip instantly, roll back and toast on failure. Delete removes with an Undo toast (5s) before the request fires. |
| **Realtime** | Any card with `pipelineStatus ∉ {ready,partial,failed}` polls `GET /api/processing/:id` every **3s**, backing off to 10s after 60s. Stops on terminal state. Cap: 10 concurrent pollers; beyond that, poll `GET /api/library` for the whole page. |

## 16.4 Article card — component contract

| | |
|---|---|
| **Data** | one `LibraryCard` |
| **Calls** | `POST /api/library/:id/state` |
| **Four required visual states** | **processing** (skeleton + **real domain and favicon already shown**) · **ready** · **partial** (full card + a quiet "summary unavailable") · **failed** (plain-language reason + Retry + original link) |
| **Must render correctly when null** | `title` (→ domain), `previewImageUrl` (→ gradient keyed on domain), `tldr` (→ `excerpt` → nothing), `authors` (→ omit), `publishedAt` (→ omit), `readingTimeSeconds` (→ omit), `userState` (→ defaults) |
| **Never** | A broken-image icon · a spinner with no context · a layout that shifts when a field is absent |

## 16.5 Reader — `/reader/[id]`

| | |
|---|---|
| **Data** | `GET /api/library/:id` |
| **Calls** | `POST /api/library/:id/state` (progress, **debounced 2s**, and on unload) · star/archive · `POST /api/library/:id/topics` |
| **Loading** | Header renders instantly from the list cache (title, domain, cover); body streams |
| **Empty** | `pipelineStatus = 'failed'` → the real reason in plain language + Retry + original link. **Never a blank reader.** `partial` with no `cleanHtml` → show `plainText`; if neither, show metadata + link out. |
| **Error** | Content fetch failure → offer the source URL |
| **Optimistic** | Progress and star are local-first |
| **Realtime** | If `understanding`/`embedding`, poll `GET /api/processing/:id` every 3s so the TL;DR appears without a reload |

## 16.6 Topic shelves — `/library` (shelf mode)

| | |
|---|---|
| **Data** | `GET /api/topics` → categories → topics → counts → 3 covers |
| **Calls** | tap a topic → `GET /api/library?topic=slug` · rename → `PATCH /api/topics/:id` |
| **Loading** | Skeleton shelf rows |
| **Empty** | **<50 objects → shelves do not render at all**; the grid shows instead (§12.6). This is a mode switch, not an empty state. |
| **Error** | Fall back to the grid silently; log |
| **Optimistic** | Rename updates locally, rolls back on 409 |
| **Realtime** | Refetch `/api/topics` when an import completes or after ~10 new objects |

## 16.7 Search — `/search` and the header input

| | |
|---|---|
| **Data** | `GET /api/search/instant` (per keystroke, ≥2 chars) · `GET /api/search` (debounced **250ms**) |
| **Calls** | both; infinite scroll on `nextCursor` |
| **Loading** | **Previous results stay visible and dimmed** — never flash to empty. Instant tier fills the gap. |
| **Empty** | The designed zero-result screen (§11.5): nearest-by-meaning with similarity shown + adjacent topics. **Never a bare "no results".** |
| **Error** | Vector branch failure → **degrade to keyword-only and say so** in a small notice |
| **Optimistic** | n/a |
| **Realtime** | none. Cancel in-flight requests on new input. |

## 16.8 Import — `/settings/import`

| | |
|---|---|
| **Data** | `GET /api/import/:id`; `GET /api/import/:id/items?outcome=invalid\|duplicate` for the report |
| **Calls** | upload-url → R2 PUT (with browser progress) → `POST /api/import` → poll → `retry-failed` |
| **Loading** | Two distinct bars: **upload %** (browser) then **processed n/total** (server) |
| **Empty** | Format picker + drop zone + a line on where to find each app's export |
| **Error** | Upload failure → retry with the file retained. Parse failure → the real reason ("no URL column found") + a format guide link. |
| **Optimistic** | none — import is too consequential to fake |
| **Realtime** | Poll every **2s** while active, 10s after 5 min. Stop on terminal. **The library fills visibly in the background — that is the real feedback.** |

## 16.9 Processing and error states — cross-cutting

| Surface | Contract |
|---|---|
| Card | four states (§16.4) |
| Reader | never blank; always a reason and a way forward |
| Search | degrade to keyword, say so |
| Global | Rate limit 429 → a non-blocking toast with the retry window. **Never a modal.** (P3 §6) |
| Global | Quota 429 → contextual upsell at the point of need, **never a banner above the fold** |
| Offline | Saves queue locally; a small persistent indicator; flush on reconnect |

---

# 17. V0 HANDOFF CONTRACT

**Purpose:** v0 can build the entire UI without inventing product behaviour. Everything below is decided; nothing is left to interpretation.

## 17.1 Routes

| Route | Auth | Purpose | Phase |
|---|---|---|---|
| `/` | — | Marketing; redirects to `/library` when signed in | W8 |
| `/login`, `/signup` | — | Auth.js (Google + email/password per C5) | W1 |
| `/welcome` | ✔ | Onboarding (§16.1) | W4 |
| **`/library`** | ✔ | **The product.** Grid/List, filters, shelves | W4 |
| `/reader/[id]` | ✔ | Reader | W4 |
| `/search` | ✔ | Full search results | W7 |
| `/collections` · `/collections/[id]` | ✔ | Smart collections (C4) | W7 |
| `/settings` · `/settings/import` · `/settings/usage` | ✔ | Account, import, usage | W6 |

**Not built:** `/ai`, `/research`, `/audio`, any `/s/*` share route.

## 17.2 Component inventory

| Component | Required states | Notes |
|---|---|---|
| `AppShell` | — | Header (logo · Library · Collections · search input · Save · avatar). **No badges, no counts** (P3 §6). |
| `SaveInput` | idle · submitting · success · error · offline-queued | Header + `⌘K` |
| `CommandPalette` | closed · open · searching · empty | Save · search · jump · filter · settings |
| **`ArticleCard`** | **processing · ready · partial · failed** | + hover, selected, focus-visible. **The most important component in the product.** |
| `CardGrid` | loading · loaded · empty-A · empty-B · error · loading-more | Virtualised past 100 |
| `CardList` | same | Dense; `j`/`k` keyboard nav |
| `FilterBar` | default · active-filters · overflow | Chips are removable |
| `TopicShelf` | loading · loaded · empty | Horizontal scroll, snap, keyboard-reachable |
| `TopicShelvesSection` | hidden(<50 objects) · loading · loaded | |
| `ReaderHeader` | — | Back · star · archive · type controls · more |
| `ReaderBody` | loading · loaded · failed · partial-no-html | Measure ~68ch |
| `TldrPanel` | expanded · collapsed · absent | Expanded on first view, collapsed on return |
| `KeyIdeasList` | collapsed · expanded · absent | |
| `ReadingProgressBar` | — | Hairline; no percentage number |
| `TypographyControls` | — | Font, size, measure, line-height, theme; persisted |
| `SearchResults` | idle · instant · loading(dimmed) · loaded · zero · error-degraded | Zero state is designed, not generic |
| `SearchResultItem` | keyword · semantic · both | Shows the matched span |
| `ImportWizard` | pick · uploading · parsing · processing · report · error | Two progress bars |
| `ImportReport` | — | Counts + per-reason drill-down + Retry |
| `EmptyState` | no-content · no-results · error | **Three distinct variants — never one generic** |
| `Toast` | info · success · error · undo | Undo for delete |
| `UpgradePrompt` | — | Contextual only; never above the fold |

## 17.3 Interaction states — required on every interactive element

`default · hover · active · focus-visible · disabled · loading`. Focus-visible must be a real visible ring — keyboard navigation is a stated requirement of `CardList`.

## 17.4 Responsive requirements

| Breakpoint | Grid | Nav | Notes |
|---|---|---|---|
| <640 | **1 column** | bottom tabs (Library · Search · Profile) | **Never a 2-col grid** — titles become unreadable and the TL;DR does not fit (P3 §14) |
| 640–1024 | 2 col | top bar, collapsed | |
| 1024–1440 | 3 col | full | |
| >1440 | 4 col | full | Content max-width capped; the grid does not sprawl |

Reader measure stays ~68ch at every breakpoint.

## 17.5 Rules v0 must not violate

1. **Never invent an API field.** All shapes come from §15.2. If something is needed and missing, request it — do not mock it.
2. **Every list has three empty states**, not one.
3. **Null-tolerant rendering** — the seven nullable fields in §16.4 must not shift or break the layout.
4. **No unread badge, no streak, no upgrade banner above the fold, no modal on load.** (P3 §6)
5. **No masonry, no timeline view.** (P3 §7)
6. **Grid is the default; List is a toggle.**
7. **Optimistic where specified, never elsewhere** — import and save-to-server are never faked.
8. **Dark and light both required**, driven by the existing `app/globals.css` token set — which already exists and should be extended, not replaced.

## 17.6 Fixtures

Claude Code delivers `lib/contracts/` (types) + `lib/contracts/fixtures.ts` before v0 builds each screen (P2 §29). Fixtures must include: a `ready` card with everything populated; one with **every nullable field null**; one `processing`; one `partial`; one `failed` with a real `failureCode`; an empty library; a library of 200; a zero-result search; an import mid-progress; and an import report with all four outcomes.

**The all-nulls fixture is the important one** — it is what proves rule 3 before it reaches production.

---

# 18. BACKGROUND JOBS

Six jobs. All on pg-boss, all in the worker container.

| | `capture` | `extract` | `understand` | `embed` | `import_parse` | `reaper` |
|---|---|---|---|---|---|---|
| **Trigger** | save / import | `CaptureCompleted` | `ContentExtracted` | `ObjectUnderstood` | `POST /api/import` | **cron 5 min** |
| **Input** | `{objectId, jobId}` | `{objectId, jobId, rawHtmlKey}` | `{objectId, jobId, contentHash}` | `{objectId, jobId, contentHash}` | `{importId, fileKey, source}` | — |
| **Output** | R2 key + resolved URL | `object_content` + metadata | `object_intelligence` + topics + cost | `object_chunks` | N objects + N jobs | re-enqueued/failed objects |
| **Depends on** | — | capture | extract | understand | — | — |
| **Retries** | 5 exp+jitter | 3 (sidecar only) | 5 / 8 on 429 | 5 | 2 | 0 |
| **Timeout** | 60s | 45s | **180s** | 120s | **900s** | 60s |
| **Concurrency** | 20 normal / **5 per-ws import** | 10 | 8 | 8 | 1 per workspace | 1 |
| **Idempotency** | `sha256(objId:capture:canonicalUrl)` | `…:extract:rawKey:version` | **unique (objId, promptVer, contentHash)** | `…:embed:contentHash:model` | `sha256(importId)` | n/a |
| **Priority** | NORMAL / **LOW** for import | NORMAL | NORMAL / **batch** for import | NORMAL | LOW | HIGH |
| **Observability** | duration, tier, http status, per-domain success | tier distribution, `siteConfigMatched` rate | latency, tokens, **cache hit rate**, schema validity, cost | latency, chunks, units billed | rows/s, outcome split | objects reaped |

**Queue names:** `capture`, `capture_import`, `extract`, `understand`, `understand_batch`, `embed`, `import_parse`, `reaper`. Splitting the import variants is what makes "is saving slow" and "is import slow" separately answerable (§14.4).

**Every job:**
- writes an `ingestion_jobs` row before doing work — **`ingestion_jobs.id` is the traceable execution id** (§19)
- begins with the compare-and-swap status guard (§6.3)
- logs `job_started` / `job_completed` / `job_failed` with `{ jobId, objectId, workspaceId, stage, attempt, durationMs, errorCode }`
- **never logs content, prompts, completions or search queries** (§19.2)

**Worker lifecycle:** on `SIGTERM`, stop claiming, let in-flight jobs finish within the grace period, then exit. Anything abandoned is recovered by pg-boss's visibility timeout and, failing that, by the reaper.

---
# 19. OBSERVABILITY

## 19.1 The traceable execution id

**`ingestion_jobs.id` is the execution id.** Every background operation has one, it is durable (unlike pg-boss's archived rows), and it appears in every log line, every `cost_ledger` row, and the `GET /api/processing/:id` response. One id traces a save from HTTP request to searchable object.

`LogContext` (existing) is renamed: `organizationId → workspaceId`, `workerId → objectId`, `executionId → jobId`. `requestId` stays. Every log line carries `{ requestId?, jobId?, objectId?, workspaceId, userId?, stage? }`.

## 19.2 Metrics

| Domain | Metric | Source | Alert |
|---|---|---|---|
| **Ingestion** | saves/min, dedupe hit rate, **save→card p95** | API | p95 >200ms |
| | **time-to-readable p95** (save → `extracting` done) | jobs | >60s |
| **Extraction** | **success rate by domain** | `ingestion_jobs` × `knowledge_objects.domain` | **<85% on a top-50 domain** — the leading indicator that a publisher changed markup |
| | tier distribution; **`siteConfigMatched` rate** | jobs | sidecar value is invisible without it (§7.6) |
| | `failure_code` histogram, sidecar duration, circuit-breaker state | | |
| **AI** | latency p50/p95, input/output/**cached** tokens, **cache hit rate**, schema-validity rate, refusal rate, retry rate | `cost_ledger` + jobs | **cache hit rate <50%** = a silent prefix invalidator |
| | **`attempt > 1 AND stage='understand'`** | jobs | the double-billing window (§6.4) |
| **Embedding** | latency, chunks/object, units billed, failure rate | jobs | |
| **Cost** | **cost per saved object** (7-day rolling), cost/workspace/day, cost by stage | `cost_ledger` | **>2× the 7-day baseline** |
| **Import** | rows/s, outcome split, time-to-first-card, **live-save latency during import** | imports | live-save p95 degrading = §14.4 has failed |
| **Search** | p95 by branch (keyword/vector/fusion), zero-result rate, **recall@10 on the golden set per deploy** | API + CI | p95 >200ms; recall <0.8 |
| **Queue** | depth and **oldest-job age** per queue, worker utilisation | pg-boss | **oldest-job age >15 min** — the pipeline is stalled |
| **DB** | slow queries, HNSW build time, **pool saturation** | pg | pool exhaustion (§2.3 `max:5`) |
| **Tenant** | **synthetic cross-tenant canary — must always return 0 rows** | scheduled | **any non-zero result stops everything** |

Queue *age* matters more than depth: a deep queue draining fast is healthy; a shallow queue that is not moving is an outage.

## 19.3 Never logged

Non-negotiable, from P2 §25:

| Never | Why |
|---|---|
| `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `DATABASE_URL`, any provider key | trivially leaked via error serialisation |
| Password hashes, session JWTs | credential-equivalent |
| **Article body, `plain_text`, chunk text** | the user's private library. Log `objectId` and lengths. |
| **Full prompts and completions** | they contain the article. Log `prompt_version`, token counts, outcome. |
| **Search query strings** | deeply revealing. They belong in `activity_events`, user-scoped, retained on a schedule, deletable — **not in an ops log stream**. |
| Email addresses in ops logs | `userId` only |
| Full request/response bodies | blanket rule; catches the above by accident |

## 19.4 MVP tooling

stdout JSON (existing logger) → the platform's log aggregation. **No APM vendor in the MVP.** A `/api/internal/metrics` endpoint (admin-scoped) exposes the counters above from SQL. Alerts start as scheduled queries. Add a vendor when the queries stop being enough — not before.

---

# 20. COST CONTROLS

**Metering exists from week 4, not from a future billing phase** (P2 §23). Unit economics discovered at launch is a crisis; discovered in week 4 it is a design input.

## 20.1 Per-operation cost

| Operation | Unit | Recorded |
|---|---|---|
| Extraction | compute only | duration; **no `cost_usd`** — it is not metered spend |
| **Understanding** | input + output + cached tokens × active provider rate | `cost_ledger` + `object_intelligence` |
| **Embedding** | units billed × rate | `cost_ledger` |
| Storage | R2 bytes | `usage_counters.storage_bytes`, nightly |
| Audio / Ask | — | **columns exist, unused in MVP** — `stage` is an open enum so adding them later is additive |

`cost_usd` null = **unmeasured**, not free (existing `lib/agent/cost.ts` semantics, preserved).

## 20.2 The two-sided mechanism

```
BEFORE spend:  checkQuota(workspaceId, metric) → allow | soft | blocked
AFTER  spend:  cost_ledger row with real tokens × real rate
NIGHTLY:       reconcile ledger ↔ counters; alert on divergence >5%
```

| Metric | Free | Reset |
|---|---|---|
| `saved_objects` | 100 | never (a total, not a period) |
| `ai_understanding` | 100/mo | monthly |
| `storage_bytes` | 1 GB | never |

## 20.3 Degradation, never denial

Hitting an AI ceiling **never breaks saving**. The object still saves, extracts, and is keyword-searchable; only `understand`/`embed` enter **`blocked`** — a resumable state that auto-resumes when the period rolls over or the plan changes. A user who hits a limit feels a ceiling, not a wall (P2 §23, P3 §16).

## 20.4 Ready for billing without building it

`workspaces.plan` · `usage_counters` with per-plan limits · `cost_ledger` for COGS per workspace · `audit_log` for plan changes. **No Stripe, no webhooks, no checkout, no invoices.** Adding billing later reads counters that already exist and have real history — which is the whole point of building the meter early.

## 20.5 The number that decides the business

**Cost per saved object**, tracked from week 4. It determines the free-tier limit, whether understanding stays automatic, and the effort level. If it comes in high, the levers in order (P2 §5) are: verify cache hit rate → route imports through batch → lower `effort` → tighten truncation → *then* reconsider the model.

---

# 21. SECURITY

## 21.1 SSRF — the top risk

The existing `assertSafeUrl()` (§2.10) is the foundation and is genuinely good. **Four gaps must close before any user-submitted URL is fetched:**

| # | Gap | Fix |
|---|---|---|
| **1** | **TOCTOU.** The guard resolves DNS; `fetch()` resolves again. A hostile DNS server can return public then private. | **Pin the validated IP**: resolve → validate → connect to the *address* with the original `Host` header (custom agent / `lookup` override). |
| **2** | **Redirects rejected, not validated.** `redirect: "error"` is safe but breaks legitimate shorteners and CDNs, which matters for a save-anything product. | `redirect: "manual"` + **re-run `assertSafeUrl()` on every hop**, max 5, each with IP pinning. |
| **3** | **No response size limit.** | Stream with a **10 MB** cap; abort and fail `too_large`. |
| **4** | **No content-type restriction.** | Allowlist `text/html`, `application/xhtml+xml`, `text/plain`; reject the rest as `unsupported_content_type`. |

**Full policy:** protocols `http`/`https` only · blocked: loopback, `10/8`, `172.16/12`, `192.168/16`, `169.254/16` (incl. `169.254.169.254`), `0/8`, `::1`, `::`, `fe80::/10`, `fc00::/7`, IPv4-mapped equivalents, `localhost`, `metadata.google.internal` · connect timeout 10s, total 30s · max 5 redirects · 10 MB · content-type allowlist · **network-layer egress policy on the worker as defence in depth** · every block writes `audit_log`.

**Applies to:** `capture`, the image path when it lands, and any future agent `fetch_url`. **The sidecar never fetches** (§7.2) — it has no egress, so it cannot be turned into a proxy even if compromised.

## 21.2 XSS

**graby cleans; it does not sanitize.** An allowlist sanitizer runs in `extract`, **on write** — nothing unsafe is ever stored, so a rendering mistake later cannot expose stored payloads.

| | |
|---|---|
| **Allow** | `p h1-h6 ul ol li blockquote pre code em strong a img figure figcaption table thead tbody tr td th br hr span div` |
| **Attributes** | `href` (http/https/mailto only) · `src` (http/https only) · `alt title width height` · `class` on a fixed allowlist |
| **Strip entirely** | `script style iframe object embed form input svg math link meta base` · **all `on*` handlers** · `javascript:` / `data:` / `vbscript:` URLs · CSS `expression()` and `url()` |
| **Force** | `rel="noopener noreferrer nofollow"` and `target="_blank"` on links · `referrerpolicy="no-referrer"` and `loading="lazy"` on images |
| **Plus** | Strict CSP with nonces (no `unsafe-inline`) · `title` is stored `striptags`'d, never rendered raw · a Phase 10 note that article HTML should move to a separate origin when public sharing lands |

Wallabag renders `{{ entry.content|raw }}` with no allowlist and no CSP (P1 §J.2). We do neither.

## 21.3 AI prompt injection

Saved content is **fully attacker-controlled** and will be fed to a model. The boundary is architectural, not prompt-level:

1. **Structural separation.** The article arrives in a distinct, clearly delimited content block, always **after** the system prompt and never merged into it. The system prompt states that the content block is data to be described, never instructions to follow.
2. **The MVP understanding call has no tools.** It cannot search, fetch, or write. **The strongest control available is simply that there is nothing to hijack** — this is a concrete benefit of the zero-agent MVP.
3. **Constrained output.** A structured schema means the model's output is a fixed set of typed fields. An injected instruction cannot produce a tool call or an unexpected shape.
4. **Output is data, never instruction.** `tldr`, `summary`, topics are stored and rendered as text, never evaluated, never used to build a query.
5. **Semantic validation** (§9.5): `evidence_quote` must appear verbatim in the source.
6. **Adversarial corpus in CI from week 7** — real saved pages attempting scope escape and instruction hijack, asserted to produce a normal summary.

**Explicitly rejected as a control:** "instruct the model to ignore injected instructions." That is a mitigation, not a boundary, and it fails under a sufficiently creative payload.

## 21.4 Tenant isolation

Three layers (P2 §9):

1. **Type-level** — every repository function touching a workspace-scoped table **requires an `AccessScope`**. No signature can omit it; the compiler enforces it. *(This is why `typescript.ignoreBuildErrors` must be turned off in week 1 — it currently disables this entire layer.)*
2. **Query-level** — `workspace_id` is the first predicate, including **before kNN** on both search branches.
3. **RLS** — policy on every workspace-scoped table, backstop only.

Plus: cross-tenant → **404, never 403** (existing behaviour). A **synthetic canary** query runs on a schedule and must always return zero rows.

## 21.5 Everything else

| Threat | Control |
|---|---|
| AuthN | Auth.js v5, bcrypt 12, JWT. Add Google. Track the `5.0.0-beta.32` pin. |
| CSRF | Auth.js CSRF + `SameSite=Lax`. **All state-changing endpoints are POST/PATCH/DELETE** — no state-changing GET (Wallabag's bookmarklet mistake). |
| Rate limiting | Existing Postgres counters, per workspace **and** per user. Tightest on `save`, `import`, `search`. |
| File upload | Import files go **direct to R2**, never through a function. Size cap, declared-source validation, parse in the worker, `text/csv`/`text/html`/`application/json` only. |
| Secrets | Server-side env only. Never `NEXT_PUBLIC_*`, never logged, never returned. |
| Extraction abuse | Per-domain circuit breakers, per-workspace fetch quotas, honest UA, `robots.txt` respect. |
| Sub-processors | Documented list; a workspace-level provider setting is a Phase 8 item, noted now. |

---

# 22. TESTING STRATEGY

**The repository has zero tests today.** This is the largest process risk in the plan (P2 §31), so the highest-risk paths are specified first and are non-negotiable scope, not stretch goals.

## 22.1 Priority 1 — must exist before launch

| Area | Tests |
|---|---|
| **Tenant isolation** | For **every** repository function: a foreign `workspace_id` returns nothing / 404. A parameterised test over the exported repo surface so a new function without scoping fails automatically. **Plus the cross-tenant canary as an integration test.** |
| **SSRF guard** | Table-driven: IPv4 private ranges, IPv6 (`::1`, `fe80::`, `fc00::`), IPv4-mapped, bracketed literals, `localhost`, `metadata.google.internal`, malformed URLs, non-http schemes, **DNS rebinding** (a hostname resolving to a private IP), **redirect-to-private on hop 2**, size cap, content-type rejection. |
| **URL canonicalization** | Table-driven over the §4.4 rules; **the same article via 12 tracking-param variants must produce one `url_hash`**. |
| **Idempotency** | Double save → one object. Double job → one execution. `understand` re-run with unchanged `content_hash` → zero cost. Prompt-version bump → re-runs. |
| **State machine** | Every legal transition; every illegal one rejected. Concurrent stage claim → exactly one wins (the compare-and-swap). |
| **HTML sanitizer** | An XSS payload corpus: `onerror`, `javascript:`, `<svg><script>`, `<iframe srcdoc>`, `data:` URLs, CSS `expression()`, mutation-XSS cases. |

## 22.2 Priority 2 — before launch

| Area | Tests |
|---|---|
| **Extraction contract** | A **200-URL fixture corpus** across publisher types with a quality floor (title present, text length within a band, no nav residue). Runs against recorded HTML — no network, no PHP needed in CI. |
| **AI contract** | Recorded provider responses: schema validation, semantic validation, `evidence_quote` verbatim check, partial-field degradation, each failure code → the right terminal state. **Zero live API calls in CI.** |
| **Search** | **The golden retrieval set** (~50 queries → expected objects), recall@10 ≥0.8, MRR tracked. `EXPLAIN` asserted on a seeded 100k-chunk fixture. **Both branches assert the tenant pre-filter.** |
| **Import** | Real export fixtures per format; malformed CSV, wrong columns, 10k rows, duplicates within one file, unicode/emoji titles, invalid URLs. |
| **API** | Every endpoint: auth required, tenancy enforced, validation, error codes, cursor stability under concurrent writes. |
| **Migrations** | Apply from empty; apply twice (idempotent); rollback where specified. |

## 22.3 Priority 3 — nice to have at launch

Unit tests for chunking, reading time, topic slugification and the topic resolver. Two **E2E** flows only: *signup → save → wait for ready → search → find it*, and *signup → import 50 → shelves appear*. Load: 3,000-item import while measuring live-save p95 (the §14.4 acceptance test).

## 22.4 Tooling and gates

Vitest (unit/integration) + Playwright (two E2E). Testcontainers or a disposable Neon branch for a real Postgres with pgvector — **never a mocked database for repository tests**, since the things being tested are SQL predicates.

**CI gates:** typecheck (with `ignoreBuildErrors: false`) · lint · Priority 1 green · Priority 2 green · golden-set recall ≥0.8 · no `console.log` of forbidden fields (a lint rule).

---

# 23. MIGRATION STRATEGY

## 23.1 There is no data migration

The existing tables hold demo/development data for a product being retired. **Nothing is migrated.** ⚠ Gated on **C12** and on P2 §32 Q10 (is anything in `workers`/`executions` worth keeping?). Until both are answered, migration `0005` is not written.

## 23.2 Order

| # | Migration | Contents | Reversible |
|---|---|---|---|
| **0002** | `extensions` | `CREATE EXTENSION vector, pg_trgm, unaccent` | yes |
| **0003** | `workspaces_rename` | `organizations → workspaces` + `slug`, `plan`; `audit_log.org_id → workspace_id`; `users` gains `name`, `image_url`, `email_verified_at`; `password_hash` → nullable | **yes** — pure rename/add |
| **0004** | `knowledge_core` | `knowledge_objects`, `object_content`, `ingestion_jobs` + indexes | yes (drop) |
| **0005** | `retire_workforce` | **DROP** `workers`, `worker_versions`, `tasks`, `executions`, `execution_events`, `outputs`, `business_events`, `metrics` ⚠ **C12** | **NO — destructive** |
| **0006** | `understanding` | `object_intelligence`, `topics`, `object_topics` | yes |
| **0007** | `chunks` | `object_chunks` (**no HNSW index yet**) | yes |
| **0008** | `library` | `user_object_state`, `activity_events` (partitioned) | yes |
| **0009** | `import` | `imports`, `import_items` | yes |
| **0010** | `cost` | `cost_ledger`, `usage_counters` | yes |
| **0011** | `collections` | `collections`, `collection_objects` ⚠ **C4** | yes |
| **0012** | `search_indexes` | **GIN on `fts`, HNSW on `embedding`** — after data exists | yes |
| **0013** | `rls` | Enable RLS + policies | yes |

## 23.3 Sequencing rules

- **0005 is the only destructive migration** and it is deliberately separate, so everything before it is safe to apply and roll back freely. It ships only after C12 is answered.
- **0012 is last on purpose.** Building HNSW on an empty table then bulk-loading is far slower than the reverse, and the index is useless until chunks exist.
- **0013 is week 7, not week 1.** RLS is a backstop; the primary control is the repo-layer `AccessScope`. Enabling RLS on day one while the schema is still moving generates policy churn and confusing failures. **This is a deliberate sequencing choice, not a de-prioritisation** — RLS ships before launch.
- **0003 keeps `organizations` as a view for one release** if anything still references it, dropped in 0005.

## 23.4 Backwards compatibility, rollback, seeds

Migrations 0002–0004 and 0006–0013 are additive or reversible. **0005 is a one-way door**, taken deliberately with a database snapshot immediately before. Rollback for the rest is a matching `DOWN` file (the existing runner applies forward only; a `migrations/down/` directory holds them for manual use).

**Seeds:** none in production. Development fixtures via `pnpm seed`: one workspace, one user, 50 objects across pipeline states (including `failed` and `partial`), 12 topics in 4 categories, one completed import with all four outcomes. **The fixture set doubles as the v0 fixture source (§17.6)** — one source of truth for both.

## 23.5 Two connection-pool changes

1. **The worker needs its own pool config.** `lib/db/client.ts` uses `max: 5`, correct for serverless, wrong for a long-running batch worker. Parameterise via `PG_POOL_MAX` (worker ~20).
2. **Serverless should use a pooled endpoint** (Neon's pooler). Each function instance opens its own pool; the total budget is finite.

---

# 24. 8-WEEK EXECUTION PLAN

## 24.1 Challenging the proposed schedules

Two schedules are on the table and **neither is adopted**:

| | Brief's §24 | Phase 3 §18 |
|---|---|---|
| W1 | Foundation | Foundation |
| W2 | Save + ingestion | Foundation |
| W3 | AI understanding | Capture + library |
| W4 | Library + shelves | Capture + library |
| W5 | Search | **Import** |
| W6 | **Import** | AI understanding |
| W7 | Polish | Search |
| W8 | QA | Harden |

**Problem with the brief's order:** import at W6 means shelves (W4) and search (W5) are developed against a hand-made dev corpus of a few dozen articles. Topic resolution, shelf thresholds and search ranking are all things that only reveal their problems at 3,000 items. Discovering in W7 that the resolver produces 4,000 topics is fatal.

**Problem with Phase 3's order:** import at W5 *before* understanding at W6 is better, but both leave search at W7 — one week of buffer for the most complex component and the second wow moment.

**Problem with both:** they are sequential, and the work parallelises across three engineers.

> **REVISION** — a three-track plan. **Import lands in week 4** so that shelves and search are built against a real corpus from week 5 onward.

## 24.2 Critical path

```
Foundation ──► Extraction ──► Understanding ──► Embedding ──► Search
   W1            W2-W3            W4              W5-W6        W6-W7
                                   │
                                   └──► Topic Shelves (W5)
```

Five links, seven weeks, one week of buffer. **There is no slack on this chain** — anything that slips here slips the launch. Import, the library UI and the reader are *off* the critical path and can absorb delay.

## 24.3 The plan (3 engineers + v0)

| Wk | **Track A — Pipeline** (critical path) | **Track B — Product surface** | **Track C — Infra & Import** |
|---|---|---|---|
| **1** | *All three together:* retire workforce (⚠C12) · **`ignoreBuildErrors: false` and fix the fallout** · migrations 0002–0004 · repos + `AccessScope` · pg-boss + worker skeleton · `lib/contracts/` v1 | | |
| **2** | `capture`: SSRF hardening (all 4 gaps) · IP pinning · redirect validation · R2 archive · dedupe L2 | `GET /api/library` + `POST /api/save` · fixtures for v0 · **v0 starts** | Worker + sidecar deploy pipeline · R2 buckets · `docker compose` dev |
| **3** | `extract`: Node readability · sanitizer · normalization · state machine · **reaper** | v0 integration: grid, list, card 4 states, filters | **graby sidecar container** · tier ladder · circuit breaker |
| **4** | **`understand`**: prompt, schema, validation, `cost_ledger`, quotas | Reader · processing states · onboarding | **Import**: parsers, upload→R2, `import_parse`, progress, report |
| **5** | `TopicResolver` · `/api/topics` · nightly merge job | **Topic shelves UI** · shelf mode switch | Import polish · batch-API routing · concurrency caps · **run a real 3,000-item import** |
| **6** | Chunking · `EmbeddingService` · `embed` job · HNSW (0012) | Search UI · instant tier · zero-result screen | **Golden retrieval set** (50 queries) · usage counters |
| **7** | **Hybrid search + RRF + ranking** · facets · cursor | Search polish · collections (⚠C4) · settings | **RLS (0013)** · security pass · adversarial corpus · perf tuning |
| **8** | *All three:* E2E · load test (import + live-save p95) · Priority-1&2 tests green · onboarding polish · alerts · **launch to 20 external users** | | |

## 24.4 De-risking week 1–2

Week 1 is the densest and it is on the critical path. Three mitigations:

1. **Extraction starts with Node readability, not the sidecar.** Gets an end-to-end save working in week 2 with one new deployment target instead of two; the sidecar lands in week 3 as an upgrade behind the existing tier ladder. ⚠ *Organizational risk: once Node-only works, pressure to skip the sidecar is real. Counter-measure: `siteConfigMatched` rate is a tracked metric with a target from week 3 (§7.6).*
2. **RLS moves to week 7.** A backstop, not the primary control (§23.3).
3. **`ignoreBuildErrors: false` is a week-1 task with an explicit timebox.** If it exceeds two days, the overflow is quarantined with targeted `@ts-expect-error` comments carrying a tracking issue — **never by turning the flag back on**.

## 24.5 Scaling and cut order

| Team | Realistic duration |
|---|---|
| 2 engineers | **~11 weeks** — tracks B and C serialise |
| **3 engineers** | **8 weeks, zero slack** |
| 4 engineers | ~7 weeks; the 4th takes testing + observability from week 3 |

⚠ **C13 is unanswered.** If the team is 2, the honest answer is that this is an 11-week plan, and committing to 8 would mean cutting scope rather than working faster.

**Cut order if week 4 slips** (cut in this order, do not improvise):
1. Collections (C4) — the nav becomes two destinations
2. List view — grid only
3. Instant search tier — accept 200ms perceived latency
4. Import formats 2 and 3 — **Pocket only** *(Pocket alone still solves cold start)*
5. Topic shelf editing — read-only shelves

**Never cut:** import entirely · semantic search · the SSRF hardening · Priority-1 tests · the reaper.

---

# 25. DEFINITION OF DONE

| # | The user can… | Measurable acceptance criteria |
|---|---|---|
| **1** | **Create an account** | Google OAuth and email/password both work. Workspace auto-created. Session survives refresh and 7 days. Signup → library <15s. Duplicate email → clear error, no partial account. |
| **2** | **Save a URL** | `POST /api/save` returns **201 in <200ms p95**. Card visible immediately. Duplicate returns the existing object with **no fetch and no LLM cost**. Rate limit and quota enforced. Extension saves in <500ms. Invalid URL → clear inline error. Offline → queued and flushed. |
| **3** | **Have content extracted** | **≥90% success across the top 50 domains** on the fixture corpus. Time-to-readable **<60s p95**. `origin_url` correct on redirects. Raw HTML archived to R2. Failure → object saved with a plain-language reason + working Retry. Sanitizer passes the XSS corpus. |
| **4** | **See processing status** | Card shows the correct one of four states at all times. `GET /api/processing/:id` returns per-stage detail. Transitions appear within 3s without a reload. **No object is ever stuck >15 min** (reaper verified by killing a worker mid-job). |
| **5** | **Receive AI understanding** | TL;DR ≤240 chars, non-empty, on **≥95%** of successfully-extracted objects. Every `evidence_quote` verbatim in source. **Schema validity ≥99%.** Cost recorded per object. **Cache hit rate ≥50%.** Re-running unchanged content costs **zero**. Failure → `partial`, object still readable and keyword-searchable. |
| **6** | **See automatic topics** | 1–5 topics per object, ≥0.5 confidence. Shelves render at ≥50 objects, grouped by the 10 fixed categories. **A 3,000-item import produces <300 topics** (resolver working). No shelf with <3 items. Rename persists, survives re-runs, and is excluded from auto-merge. |
| **7** | **Browse a visual library** | Grid default, List toggle. First paint **<400ms**. Cursor pagination stable under concurrent writes. Filters compose. Star/archive optimistic with rollback. **Renders correctly with every nullable field null.** Three distinct empty states. Virtualised past 100 items. |
| **8** | **Search semantically** | p95 **<200ms**. **Recall@10 ≥0.8** on the golden set. A query sharing no keywords with the target still finds it. Matched span shown. `matchType` labelled. Tenant pre-filter asserted on **both** branches. Zero results never bare. Vector failure degrades to keyword with a notice. |
| **9** | **Import an existing library** | Pocket + Instapaper (+ third per C3). 3,000 rows parsed and queued **<60s**. First cards **<10s**. **Live-save p95 unchanged during import** ← the §14.4 test. `original_saved_at` preserved. Duplicates detected. Per-row report with reasons. Retry-failed works. 50 MB file never touches a function. |
| **10** | **Retrieve previously saved knowledge** | ★ **The hypothesis.** From a 3,000-item imported library, a user finds a specific article by describing its *concept* rather than its keywords, in **<3 attempts**, in **<30 seconds**. Verified with 10 real users against their own imported libraries in week 8. |

**Launch gate:** all ten green + Priority-1 and Priority-2 tests passing + the four alerts wired + cost per saved object known and within budget.

---

# 26. OUT OF SCOPE

Protected. Adding any of these requires an explicit decision to move the launch date.

| Out | Phase | One-line reason |
|---|---|---|
| **Audio / AI podcast** | 7 | Largest line item, least acquisition leverage — a retention feature |
| **Ask My Library** | 6 | Genuinely agentic; a wrong answer across 3,000 docs costs trust permanently |
| **Ask This Article** | ⚠ C7 | Cut with a pre-agreed trigger to pull it into W8 |
| **Highlights / notes** | 9–12 | Offset re-anchoring is fiddly; losing highlights is unforgivable |
| **Mobile app / PWA share sheet** | 9–12 | The most costly accepted gap (P3 §19) |
| **Sharing / public collections** | 10 | Largest new privacy surface; needs a settled model |
| **Knowledge graph + contradictions** | 5 | Best differentiator; needs a populated library |
| **Related content** | 5 | Cheap (kNN) but needs UI |
| **Daily/weekly/monthly briefs** | 8 | Needs `activity_events` history |
| **Recommendations / personalization** | 8 | Same |
| **Research agent** | 9 | Most expensive operation |
| **Content creation** | 10 | |
| **Team collaboration** | 10 | Schema supports it; no MVP demand |
| **Complex agent orchestration** | — | **Zero agents in the MVP.** Non-negotiable. |
| **PDF / video / podcast / posts** | 6–10 | Adapters are cheap *because* of §7's abstraction — that is why they wait |
| **Masonry / timeline views** | never / sort | P3 §7 |
| **Entity pages, `entities` tables** | 5 | JSONB now; promote when there is UI |
| **Image localisation to R2** | 6 | Remote images with `no-referrer` for now |
| **Headless browser tier** | 6 | `js_required` is an honest terminal state in the MVP |
| **Export** | 13–16 | Must ship before any paid tier |
| **Wallabag-compatible API shim** | later | Cheap distribution lever, not MVP |
| **Billing / Stripe** | 11 | Meter now, bill later |
| **Redis, APM vendor, dedicated vector DB, search cluster** | when measured | Add on evidence, never on anticipation |

---

# 27. RISKS

## 27.1 Discovered in Phase 4 (new since Phase 3)

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| **R1** | **`typescript.ignoreBuildErrors: true` disables the primary tenant-isolation control.** §21.4 layer 1 is "the compiler requires an `AccessScope`" — which does nothing while type errors are ignored. | **Critical** | Week-1 task with a timebox; never re-enabled |
| **R2** | **`max: 5` pool is wrong for a worker.** A batch worker will exhaust it or starve serverless. | High | Parameterise `PG_POOL_MAX`; serverless on a pooled endpoint (§23.5) |
| **R3** | **The double-billing window.** A crash after the LLM call but before the DB write bills twice on redelivery. | Medium | Call and write adjacent, single transaction; monitor `attempt>1 AND stage='understand'` |
| **R4** | **Topic fragmentation would break the #1 wow moment.** Without the resolver + vocabulary-in-prompt, 3,000 items → ~4,000 topics and shelves look broken. | **High** | §12.2 resolver, ≤2 new topics/object, DoD #6 asserts <300 topics |
| **R5** | **Node-readability fallback may cannibalise the sidecar.** Once it works, finishing the PHP sidecar feels optional. | Medium | `siteConfigMatched` tracked with a target from week 3 |
| **R6** | **Prompt-cache invalidation is silent.** A varying prefix costs ~10× with no error. | High | Cache hit rate is a week-3 acceptance check and an alert |
| **R7** | **A lost queue message strands an object forever** without a reaper. | High | The reaper is non-cuttable scope (§6.4, §24.5) |
| **R8** | **Import starving live saves** would make the product feel broken during onboarding. | High | Four mechanisms (§14.4); live-save p95 during import is a DoD criterion |
| **R9** | **The embedding dimension is fixed before there is evidence** (C9). | Medium | 1536 within the HNSW 2000-dim limit; `embedding_model` per row makes a change a backfill |
| **R10** | **Zero slack on the critical path.** Any slip on Foundation→Extract→Understand→Embed→Search slips launch. | High | Track plan, week-1 de-risking, a pre-agreed cut order |

## 27.2 Carried forward

SSRF (mitigated, §21.1) · prompt injection (mitigated by the zero-tool MVP, §21.3) · cross-tenant vector leak (mitigated by pre-filtering, §11.2) · AI cost per object (metered from W4) · extraction quality vs Wallabag (fixture corpus with a floor) · publishers blocking the crawler · cold start (import is non-cuttable) · scope explosion (§26).

## 27.3 Unresolved questions

**Blocking:** C12 (retire the workforce product?) · C13 (team size?)
**Needed by week 4:** C3 (third import format) · P2 §32 Q5 (acceptable cost per object)
**Needed by week 6:** C9 (embedding provider) · C4 (collections in MVP)
**Needed by week 7:** C7 (pull Ask forward?)
**Also open:** C5 (auth — recommendation: keep Credentials, add Google) · P2 §32 Q3 (self-hosting), Q7 (retention policy), Q8 (brand direction for v0), Q10 (keep any existing data?)

---

# 28. ARCHITECTURAL DECISIONS AND SELF-REVIEW

Full records in **`docs/PHASE-4-DECISIONS.md`** (24 decisions, each with DECISION / REASON / ALTERNATIVES / TRADE-OFF / CONSEQUENCE).

## 28.1 Self-review — challenging this design

| Question | Honest answer |
|---|---|
| **Are we over-engineering?** | In three places, now removed: `entities` tables (→ JSONB), separate `tags` (→ merged into topics), `job_events` (→ dropped). Each existed only because Phase 2 designed for the full product. **Net: 3 fewer tables.** |
| **Unnecessary services?** | Nine bounded contexts were proposed; **six** survive. Content, Topics and Collections had no lifecycle of their own. |
| **Unnecessary agents?** | **Zero agents.** Understanding is one call with no tools. This is also the strongest prompt-injection control we have (§21.3). |
| **Duplicating existing infrastructure?** | Deliberately not: session, auth, error mapping, rate limiting, logging, SSRF guard, LLM seam, cost calc, migration runner, transaction helper are all reused. ~60% of backend infra. The one *addition* is pg-boss, and only because the pipeline cannot run in a 60s function. |
| **Coupling frontend and backend?** | Mitigated by generated `lib/contracts/` + fixtures (§17.6). The all-nulls fixture is the specific defence against a UI that assumes populated data. |
| **Premature abstractions?** | Two challenged and kept: `EmbeddingProvider` (mirrors a proven seam; models turn over every 12–24 months) and `SourceAdapter` (one implementation today, but it is the property that keeps future content types from touching the pipeline). Two challenged and **cut**: a `SearchProvider` interface (P2 wanted it; **not built in the MVP** — one implementation, extract it when a second exists) and a `StorageProvider` abstraction (R2 is S3-compatible; the SDK *is* the abstraction). |
| **Could something simpler work?** | Considered and rejected: **(a)** skip pg-boss, poll a Postgres table — plausible, but reimplements visibility timeouts, backoff and priority badly; **(b)** skip chunking, embed whole documents — simpler and materially worse retrieval, and it forecloses citations; **(c)** skip the sidecar entirely, Node readability only — genuinely tempting and it is the week-1–2 fallback, but it discards the single asset Phase 1 identified as irreplaceable. |
| **Highest technical risk?** | **The critical path has zero slack** (R10), with topic fragmentation (R4) as the highest-consequence single failure — it breaks the wow moment the whole MVP is organised around. |
| **Highest product risk?** | Unchanged from P3: **users save and never retrieve.** DoD #10 is the only criterion that tests it, and it is tested with real users on their own imported libraries — not synthetically. |

## 28.2 Simplifications made in this phase

1. Nine bounded contexts → **six**
2. Three tables removed (`entities`, `object_entities`, separate tags, `job_events`) → **JSONB and one merged vocabulary**
3. Topic hierarchy via a **fixed category enum instead of clustering** — the brief's requested shape, none of the clustering risk
4. `SearchProvider` and `StorageProvider` abstractions **not built**
5. Search query parsing kept deliberately minimal — no DSL
6. **No Redis, no APM vendor, no vector DB, no search cluster**
7. Manual collections deferred; smart collections are a saved query with no membership rows
8. Extraction starts on Node readability; the sidecar is an upgrade, not a week-1 blocker

---

*End of Phase 4. No application code, migrations, components, dependencies or configuration were changed.*
