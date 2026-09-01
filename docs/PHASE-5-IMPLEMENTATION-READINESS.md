# Phase 5 — Implementation Readiness

**Status:** Architecture resolved, implementation not started. No production code, no migrations, no UI, no application changes.
**Date:** 2026-09-01
**Companion:** `docs/PHASE-5-RESOLUTIONS.md` (16 contradiction resolutions)
**Assumptions set by this phase:** Workforce/Studio continues to exist · 2 engineers

---

# 1. FINAL BOUNDED CONTEXTS

Phase 4 defined six. Under R1 (Workforce coexists) there are now **two products** in one repository, and the shared layer between them becomes a first-class concern.

```
┌─────────────────────────────────────────────────────────────────────┐
│  PRODUCT A — AGENT WORKFORCE / STUDIO          (exists · frozen)    │
│  Workers · Skills · Tools · Executions · Studio · Factory · Outputs │
│  Owns: workers, worker_versions, tasks, executions,                 │
│        execution_events, outputs, business_events, metrics          │
│  Routes: / /studio /factory /workforce /library /outputs /evolve    │
│          /observatory /outcomes /insights /integrations /products   │
│          /approvals                                                  │
│  Code:  lib/workforce* lib/character lib/library lib/products       │
│         lib/insights lib/worker* lib/agent/skills lib/fabric-graph  │
│         lib/simulation · components/* (88)                          │
└─────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ both depend on ↓ only
┌─────────────────────────────────────────────────────────────────────┐
│  SHARED PLATFORM  (lib/platform — see §3)                           │
│  db client · session/auth · api-error · rate-limit · logger ·       │
│  ssrf-guard · llm provider seam · cost · runtime-mode · utils       │
│  Tables: organizations · users · memberships · audit_log ·          │
│          rate_limit_counters                                         │
└─────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │
┌─────────────────────────────────────────────────────────────────────┐
│  PRODUCT B — AI KNOWLEDGE LIBRARY               (new · additive)    │
│                                                                      │
│   ingestion ──► content ──► understanding ──► topics                │
│                    │              │             │                    │
│                    └──────────────┴─────────────┴──► reading        │
│                                   │                   (read model +  │
│                              search                    user state)   │
│                                   │                                  │
│                                import                                │
│                                                                      │
│  Owns: knowledge_objects · knowledge_content · knowledge_jobs · …    │
│  Routes: /knowledge/**  ·  API: /api/knowledge/**                    │
│  Code:  lib/knowledge/**  ·  components/knowledge/**                 │
└─────────────────────────────────────────────────────────────────────┘
```

## The seven Knowledge Library contexts

Phase 4's six, with **`access`** added — because a shared tenant table (R4) means the `organizationId → workspaceId` mapping needs exactly one home.

| Context | Path | Responsibility | Milestone 1? |
|---|---|---|---|
| **access** | `lib/knowledge/access` | `AccessScope`; maps the session's `organizationId` to `workspaceId`; the only place that adaptation happens | ✔ |
| **ingestion** | `lib/knowledge/ingestion` | URL → durable normalized content. Canonicalisation, safe fetch, extraction, sanitisation, the job pipeline | ✔ |
| **content** | `lib/knowledge/content` | The Knowledge Object shape and its persistence | ✔ |
| **understanding** | `lib/knowledge/understanding` | One LLM call → structured intelligence. **The only context permitted to call an LLM.** | ✘ M3 |
| **topics** | `lib/knowledge/topics` | Canonical vocabulary, aliases, assignment, shelves | ✘ M3 |
| **search** | `lib/knowledge/search` | Hybrid retrieval. Read-only, never writes. | ✘ M4 |
| **import** | `lib/knowledge/import` | File → many pending objects, with backpressure | ✘ M2 |
| **reading** | `lib/knowledge/reading` | Library read model, user state, saved views | ✔ (list only) |

> **Naming hazard, stated explicitly:** `lib/library/` is Workforce's *worker* library. `lib/knowledge/reading/` is the Knowledge Library's read model. They are unrelated. The word "library" alone is ambiguous in this repository and should never be used unqualified in code, comments or commit messages.

---

# 2. WORKFORCE COEXISTENCE STRATEGY

## Options evaluated

| | Approach | Regression risk | Coupling | Migration risk | Deploy risk | Independence |
|---|---|---|---|---|---|---|
| **A** | Same app, separate routes | Low | **High** — nothing prevents drift | Low | Low | Low |
| **B** | Same repo, separate app modules (pnpm workspace monorepo) | **High** — restructuring a working app | Low | Medium | Medium | High |
| **C** | Same repo, one app, **enforced bounded contexts** | **Low** | **Low** | Low | Medium | **High** |
| **D** | Separate applications sharing infrastructure | Low | Low | **High** — split auth/session | **High** — two deploys | High |
| **E** | Other | — | — | — | — | — |

## DECISION — C: same repository, one Next.js application, enforced bounded contexts

**REASON**

*Why not B (monorepo).* Converting a working single-app repository into a pnpm workspace means moving every file, rewriting every import path, and reconfiguring the build — a large refactor of a product with **zero tests**, which is precisely the regression risk this phase exists to minimise. And it buys little: the property we actually need is "no cross-context imports", which a lint rule delivers without moving a single existing file.

*Why not D (separate applications).* Two deployments means either a shared session cookie across origins or two logins. `lib/session.ts` and the JWT with `organizationId` are the most security-sensitive code in the repository, and splitting them across two apps doubles the surface for the exact bug class we care most about. Two deploys, two env sets, two log streams — for a team of two.

*Why not A alone.* "Separate routes" with no enforcement is C without the guardrail. It works for a fortnight, then someone imports `lib/workforce/model` from Knowledge code because a type looked convenient, and the contexts fuse. Under R1 the Workforce is *frozen*, which makes an accidental dependency on it especially bad: the Knowledge Library would be coupled to code nobody is allowed to change.

*Why C.* One app, one deploy, one session, one database, zero existing files moved. The boundary is enforced by three cheap mechanisms (§4) rather than by structure. The Knowledge Library is **purely additive**: new directories, new routes, new tables. Every existing file stays exactly where it is.

**TRADE-OFF — stated plainly.** One deployment means a Knowledge Library build failure blocks a Workforce deploy. This is the single real cost of C over D. It is mitigated, not eliminated:

- CI runs typecheck + lint + the boundary rule on every PR (§6 makes this possible today — there are zero type errors)
- A Workforce smoke test suite is part of Milestone 1's Definition of Done (§15, criterion 11)
- The Knowledge Library adds no dependency to `package.json` in Milestone 1, so it cannot break the Workforce build through the dependency tree
- Until Milestone 1's UI ships, every Knowledge file is unreachable from any Workforce route — dead code cannot cause a runtime regression

## Coexistence mechanics

| Concern | Decision |
|---|---|
| **Routes** | Workforce keeps every current route unchanged. Knowledge lives under `/knowledge/**` (R3). No route is moved, renamed or redirected. |
| **Layout** | `app/layout.tsx` hard-codes `colorScheme: 'dark'`, a Workforce title and a Workforce description. **It is not modified.** Knowledge pages use a nested layout at `app/(knowledge)/layout.tsx` that overrides metadata and theme for its subtree. The route group `(knowledge)` affects file organisation only, not URLs. |
| **Database** | One database, one `organizations` table, shared (R4). Knowledge tables are new and prefixed `knowledge_`. **No migration alters a Workforce table.** |
| **Auth/session** | Entirely shared and unchanged (R8). A user is one account across both products. |
| **Worker process** | New, separate process. It does not import Workforce code and does not touch Workforce tables. It cannot affect the Workforce runtime. |
| **Navigation between products** | None in Milestone 1. Knowledge is reachable by URL only. A product switcher is a later, deliberate decision — not something to improvise. |
| **package.json** | Milestone 1 adds **zero** runtime dependencies. `pg-boss` and the worker arrive in Milestone 2 with an explicit review. |

---

# 3. REPOSITORY BOUNDARIES

## Directory map

```
app/
  (existing Workforce routes — UNCHANGED)
  library/            ← Workforce "worker library" · DO NOT TOUCH
  studio/ factory/ workforce/ outputs/ …
  api/
    (existing — UNCHANGED)
    knowledge/                        ← NEW
      save/route.ts
      items/route.ts
      items/[id]/route.ts
      items/[id]/state/route.ts
      processing/[id]/route.ts
  (knowledge)/                        ← NEW route group (no URL effect)
    layout.tsx                        ← own metadata + theme
    knowledge/page.tsx                ← the Library view
    knowledge/read/[id]/page.tsx      ← the Reader

lib/
  platform/                           ← NEW: the explicit shared layer (§4)
    db.ts        → re-exports lib/db/client
    session.ts   → re-exports lib/session
    errors.ts    → re-exports lib/api-error
    logger.ts    → re-exports lib/observability/logger
    ratelimit.ts → re-exports lib/rate-limit
    security.ts  → re-exports lib/security/ssrf-guard
    llm.ts       → re-exports lib/agent/tools/llm + cost + runtime-mode
    index.ts

  knowledge/                          ← NEW: Product B
    access/     ingestion/   content/
    understanding/  topics/  search/  import/  reading/
    contracts/                        ← types + fixtures shared with the UI

  (existing Workforce lib/* — UNCHANGED)
  workforce/ workforce-demo/ character/ library/ products/ insights/
  worker.ts worker/ agent/ fabric-graph.ts simulation.ts

  db/ session.ts api-error.ts rate-limit.ts observability/ security/
                                      ← physical home of shared code, unchanged

components/
  knowledge/                          ← NEW
  (existing 88 — UNCHANGED)

worker/                               ← NEW (Milestone 2): the job process
```

## Why `lib/platform/` is a thin re-export layer, not a move

Moving `lib/session.ts` to `lib/platform/session.ts` would rewrite imports in 11 Workforce files. Under R1 that is a change to a frozen product for a cosmetic gain.

Instead `lib/platform/*` re-exports the existing modules from their current locations. Knowledge code imports **only** from `@/lib/platform/*`. This gives:

- **A single, greppable list of what is shared** — `lib/platform/index.ts` *is* the contract
- **Zero changes to Workforce files**
- **A lint-enforceable rule** — Knowledge may import `@/lib/platform` and `@/lib/knowledge`, nothing else from `lib/`
- **A future migration path** — if the shared code ever moves for real, only `lib/platform/*` changes

**Cost:** one indirection. Worth it.

---

# 4. DEPENDENCY RULES

## The rules

```
1.  WORKFORCE       ✘ MUST NOT import  lib/knowledge/**  or  components/knowledge/**
2.  KNOWLEDGE       ✘ MUST NOT import  lib/workforce**, lib/character/**,
                                       lib/library/**, lib/products/**,
                                       lib/insights/**, lib/worker*,
                                       lib/agent/skills/**, lib/fabric-graph,
                                       lib/simulation, components/** (except
                                       components/knowledge/** and components/ui/**)
3.  KNOWLEDGE       ✔ MAY import       lib/platform/**  (the only shared entry point)
4.  BOTH            ✔ MAY import       components/ui/**  (design primitives)
5.  PLATFORM        ✘ MUST NOT import  lib/knowledge/**  or any Workforce module
6.  Within KNOWLEDGE, contexts follow the dependency order below; no cycles.
```

## Allowed shared layer — the exact list

| Module | Re-exports | Why shared |
|---|---|---|
| `platform/db` | `lib/db/client` — `query`, `queryOne`, `withTransaction`, `getPool`, `DatabaseNotConfiguredError` | One pool, one connection budget |
| `platform/session` | `lib/session` — `requireSession`, `RequestSession`, the two error types | One identity across both products |
| `platform/errors` | `lib/api-error` — `withApiHandler`, `NotFoundError`, `ValidationError`, `RateLimitedError` | One error→HTTP mapping |
| `platform/logger` | `lib/observability/logger` — `logger`, `newRequestId` | One log format |
| `platform/ratelimit` | `lib/rate-limit` + `checkRateLimit` | One limiter, one counter table |
| `platform/security` | `lib/security/ssrf-guard` — `assertSafeUrl`, `UnsafeUrlError` | Security code must have exactly one implementation |
| `platform/llm` | `lib/agent/tools/llm`, `lib/agent/cost`, `lib/runtime-mode` | One provider seam, one cost calculation, one dev-mode block |
| `platform/utils` | `lib/utils` — `cn` | Trivial |

**Explicitly NOT shared:** `lib/db/repo.ts` (Workforce domain repository — Knowledge writes its own), `lib/agent/types.ts` (Workforce runtime vocabulary — Knowledge defines its own error types with the same *shape*, copied deliberately rather than imported), `lib/agent/runtime.ts`, `lib/agent/skills/**`, `lib/agent/tools/**` except `llm`.

> `lib/agent/types.ts` is the interesting case. Its `ExecutionReasonCode` vocabulary (`missing_credential | invalid_credential | provider_error | execution_error`) is exactly right for the ingestion pipeline. **Copy it, do not import it** — importing would couple the Knowledge pipeline to the Workforce runtime's evolution, and the type is twelve lines.

## Internal dependency order

```
access  ←  (everything)
content ←  ingestion, understanding, reading, search, import
ingestion ← import
understanding ← topics
reading ←  (nothing)
search  ←  content, topics, reading      (read-only)
```

No context may import a context to its right. `search` writes nothing.

## Enforcement — three mechanisms, cheapest first

1. **ESLint `no-restricted-imports`**, scoped by path override, encoding rules 1–5 directly. Fails CI. This is the primary mechanism and it costs one config block.
2. **A CI path check**: any PR touching both `lib/knowledge/**` and Workforce paths is flagged for explicit review — not blocked, but never silent.
3. **Code review convention**: `lib/platform/index.ts` is the shared contract; growing it requires a reviewer to agree it is genuinely shared.

**Not used:** TypeScript project references (would require restructuring), a monorepo (rejected in §2), or a custom AST checker (over-engineering for two products).

---

# 5. SECURITY BOUNDARIES

## 5.1 URL → SERVER (the ingestion boundary)

The existing `assertSafeUrl()` is genuinely good (Phase 4 §2.10) and is the foundation. **Four gaps close before any user URL is fetched:**

| Gap | Current | Required |
|---|---|---|
| **TOCTOU** | Guard resolves DNS; `fetch()` resolves again — a hostile resolver can answer public then private | **Pin the validated IP.** Resolve → validate → connect to the address with the original `Host` header. |
| **Redirects** | `redirect: "error"` — safe, but breaks shorteners and CDNs, which matters for save-anything | `redirect: "manual"` + **re-validate every hop**, max 5, each IP-pinned |
| **Response size** | unbounded | Stream with a **10 MB** cap; abort → `too_large` |
| **Content type** | unrestricted | Allowlist `text/html`, `application/xhtml+xml`, `text/plain` |

**Full policy:** `http`/`https` only · blocked: loopback, `10/8`, `172.16/12`, `192.168/16`, `169.254/16` (incl. `169.254.169.254`), `0/8`, `::1`, `::`, `fe80::/10`, `fc00::/7`, IPv4-mapped forms, `localhost`, `metadata.google.internal` · connect 10s, total 30s · max 5 redirects · 10 MB · content-type allowlist · **network-layer egress policy on the worker** as defence in depth · every block writes `audit_log`.

**Where it applies:** the ingestion fetcher, every image fetch when that lands, and any future agent fetch tool. The extraction sidecar has **no egress at all** (§13), so it cannot be turned into a proxy even if compromised.

## 5.2 HTML boundary

**Sanitise on write, never on render.** Nothing unsafe is ever stored, so a rendering mistake later cannot expose a stored payload.

Allowlist: `p h1-h6 ul ol li blockquote pre code em strong a img figure figcaption table thead tbody tr td th br hr span div`. Attributes: `href` (http/https/mailto), `src` (http/https), `alt title width height`, `class` from a fixed list. Stripped entirely: `script style iframe object embed form input svg math link meta base`, **all `on*` handlers**, `javascript:`/`data:`/`vbscript:` URLs, CSS `expression()` and `url()`. Forced: `rel="noopener noreferrer nofollow"`, `referrerpolicy="no-referrer"`, `loading="lazy"`.

Plus a strict CSP with nonces on Knowledge routes, and `title` stored `striptags`'d.

## 5.3 WEBPAGE → LLM (untrusted data boundary)

**Every saved page is hostile input.** The boundary is architectural, not a prompt instruction:

1. **Structural separation.** Article content occupies a distinct, delimited block placed **after** the system prompt, never merged into it. The system prompt states that the block is data to describe, never instructions to follow.
2. **No tools on the understanding call.** It cannot search, fetch, or write. **There is nothing to hijack** — the strongest available control, and a direct benefit of the zero-agent design.
3. **Constrained output.** A structured schema means an injected instruction cannot produce a tool call or an unexpected shape.
4. **Output is data, never instruction.** Summaries and topics are stored and rendered as text — never evaluated, never used to construct a query or a path.
5. **Semantic validation.** Every `evidence_quote` must appear verbatim in `plain_text`.
6. **Adversarial corpus in CI** from the milestone that introduces AI.

**Explicitly rejected:** "instruct the model to ignore injected instructions." That is a mitigation, not a boundary.

## 5.4 Remaining boundaries

| Boundary | Control |
|---|---|
| **AI output → storage** | Treated as untrusted text: length-capped, schema-validated, HTML-escaped at render. Never used to build SQL, paths or URLs. |
| **User data** | Annotations, notes and reading state are per-user, never visible to other members even within a workspace. |
| **Workspace data** | §6. |
| **Background jobs** | A job carries `orgId` in its payload and **re-derives scope from the database**, never trusting the payload alone. Jobs never run "as" a user; they run against a workspace. |
| **Imports** | Uploads go **direct to object storage**, never through a route handler. Size cap, declared-source validation, parse in the worker, content-type allowlist. |
| **Secrets** | Server-side env only, never `NEXT_PUBLIC_*`, never logged, never returned. |

---

# 6. TENANT ISOLATION REMEDIATION

## 6.1 Audit result — all 32 exported functions in `lib/db/repo.ts`

| Category | Count | Status |
|---|---|---|
| Take `orgId` and filter on it | **26** | ✔ correct |
| Identity functions, tenancy N/A by design (`getUserByEmail`, `getUserById`, `createUserWithOrganization`, `getPrimaryOrgForUser`, `userBelongsToOrg`) | 5 | ✔ correct |
| Infrastructure, not tenant data (`checkRateLimit`, `pruneExpiredRateLimits`, `recordAudit`) | 3 | ✔ correct |
| **Write functions with NO tenant scope** | **3** | ⚠ **latent defect** |

```
updateTaskStatus(id, status)        UPDATE tasks      SET status=$1 WHERE id=$2
updateExecutionStatus(id, status)   UPDATE executions SET status=$1 WHERE id=$2
finalizeExecution(id, patch)        UPDATE executions SET …        WHERE id=$11
```

**Exploitability — verified, not assumed.** All 8 call sites are in `lib/agent/runtime.ts`; every id is a `randomUUID()` generated moments earlier in the same execution. No client-supplied id reaches any of them. `app/api/executions/[id]/route.ts`, which *does* accept a client id, correctly passes `organizationId` to both functions it calls.

**Conclusion: a latent defect in an otherwise sound pattern, not a live vulnerability.** Phase 2 §2's and Phase 4 §2.7's claim that *every* function is scoped is corrected in R6.

## 6.2 API boundary audit

All 12 route handlers checked. **All 10 non-auth routes call `requireSession()`** and pass `organizationId` to every repository call. `withApiHandler` returns **404, not 403**, for cross-tenant access, so another tenant's resources are never confirmed to exist. **No API-layer defects found.**

## 6.3 Server-only boundary

`import "server-only"` is present on `lib/db/client.ts`, `lib/db/repo.ts`, `lib/session.ts`, `lib/auth.ts`, `lib/auth-password.ts`, `lib/api-error.ts`, `lib/rate-limit.ts`, `lib/security/ssrf-guard.ts`, `lib/runtime-mode.ts` and every API route. **Correct.** `lib/auth.config.ts` deliberately omits it because middleware runs on the Edge runtime — also correct.

## 6.4 Background job boundary

**No defects — because no background jobs exist yet.** This is where the rule must be set before the code:

> A job payload carries `orgId`, but the worker **re-derives the scope from the database** (`SELECT org_id FROM knowledge_objects WHERE id = $1`) and asserts it matches. A queue payload is not an authorization token.

## 6.5 Minimum changes before the Knowledge Library MVP can launch

| # | Change | Effort | Touches Workforce? |
|---|---|---|---|
| **1** | **Remove `typescript.ignoreBuildErrors`** and add a CI typecheck gate | **~15 min** | config only |
| **2** | Add `orgId` to the three unscoped functions + `AND org_id = $n` | ~30 min | **yes — needs approval** |
| **3** | Define `AccessScope` in `lib/knowledge/access` and require it in every Knowledge repository signature | design | no |
| **4** | A test asserting every exported Knowledge repository function takes a scope parameter | ~1h | no |
| **5** | A cross-tenant integration test per Knowledge repository function | ongoing | no |
| **6** | The background-job scope rule (§6.4) | design | no |
| **7** | RLS on `knowledge_*` tables only — **never** on `organizations`, `users`, `memberships` or any Workforce table (R9) | later milestone | no |
| **8** | A synthetic cross-tenant canary that must always return zero rows | ~1h | no |

**Only #2 touches Workforce code.** It is behaviour-preserving (the ids already belong to the caller's org), but under R1 it still requires explicit approval. **None of these are implemented in this phase.**

## 6.6 The TypeScript remediation plan (Phase 5 §6)

**Why the flag exists:** the repository was generated through v0 (`README.md`, `"generator": "v0.app"` in `app/layout.tsx` metadata, 50 `v0/*` merge commits). `ignoreBuildErrors: true` is a v0 scaffold default that lets a preview deploy succeed while code is being generated iteratively. There is no evidence it was added to suppress a specific error.

**How many errors exist — measured, not estimated:**

```
./node_modules/.bin/tsc --noEmit --pretty false          → exit 0   ZERO errors
npx next build                                            → exit 0   succeeds
tsc re-run after .next/types route generation             → exit 0   ZERO errors
tsconfig.json                                             → "strict": true already
```

**Are the errors real or configuration-related?** Neither — **there are none.** `strict` is already on and the codebase satisfies it.

**Which errors affect tenancy/security?** None exist today. The risk is entirely **prospective**: with the flag on, the *next* type error ships silently, and the Knowledge Library's first isolation layer is "the compiler requires an `AccessScope`" — which only works if the compiler is actually consulted.

**What must be fixed:** nothing. **Can the flag be removed immediately? Yes.**

**Remediation plan:**

1. Its **own PR**, touching only `next.config.mjs` and the CI workflow. Nothing else.
2. Remove `typescript.ignoreBuildErrors`. **Leave `images.unoptimized` alone** — that is a separate concern and changing it in the same PR would conflate two risks.
3. Add a CI step: `tsc --noEmit` on every PR, required to pass.
4. Verify `next build` still succeeds (it does).
5. **Timebox: 1 hour.** If the CI environment surfaces anything the local run did not, revert the config change, keep the CI step as non-blocking, and open a tracked issue. **Do not restore the flag and walk away** — a non-blocking CI step still makes new errors visible.

**No `@ts-expect-error` quarantine is needed.** Phase 4 §24.4's escape hatch is withdrawn (R5).
---

# 7. DATABASE CONNECTION POOL STRATEGY

## 7.1 The current state and why `max: 5` is only half wrong

`lib/db/client.ts` opens one `Pool({ max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 })` per process, cached on `globalThis` across warm serverless invocations.

**For serverless this is correct**, and deliberately so — each function instance gets its own pool, and Postgres has a finite total connection budget across all instances. Five is a sane per-instance number.

**For a long-running worker it is wrong**, but not for the reason it first appears. The failure mode is not "5 is too few for 46 concurrent jobs" — it is that a worker holding connections across network calls would exhaust *any* pool.

## 7.2 The rule that makes pool sizing almost irrelevant

> **Never hold a database connection across a network call.**

A pipeline stage is: read state (ms) → **fetch a URL or call an LLM (seconds to minutes)** → write result (ms). If the connection is acquired before the network call and released after, a job holds a connection for 30+ seconds and 12 concurrent jobs exhaust a pool of 12. If the connection is acquired only for the two short database operations, the same 12 jobs need perhaps 2–3 connections in practice.

Every stage is therefore structured as:

```
1. acquire → compare-and-swap status → release        (~2ms)
2. do the slow work — NO connection held              (seconds)
3. acquire → write result in one transaction → release (~5ms)
```

This is a **code rule enforced in review and by a lint rule against `withTransaction` bodies containing `await fetch` or `await callLlm`**, and it matters far more than any pool number.

## 7.3 Recommended values

| Process | Endpoint | `max` | idle | connect timeout | Reason |
|---|---|---|---|---|---|
| **Next.js serverless** | **pooled** (PgBouncer / Neon pooler, transaction mode) | **5** (unchanged) | 10s | 10s | Many short-lived instances; the pooler multiplexes. Current value is correct. |
| **Worker — job processing** | **direct** (session mode) | **10** | 30s | 10s | With §7.2 held, 10 covers the full stage concurrency with headroom |
| **Worker — pg-boss internal** | **direct** (session mode) | **2** | — | — | pg-boss maintains its own pool; it uses `LISTEN/NOTIFY`, which **transaction pooling breaks** |

**Total steady-state budget:** ~12 from the worker + (instances × 5) from serverless, and the pooler caps the serverless side. On a small managed Postgres (typically 100–500 connections) this leaves ample headroom.

**Implementation:** parameterise the existing client rather than fork it —

```
PG_POOL_MAX          default 5      worker sets 10
PG_IDLE_TIMEOUT_MS   default 10000  worker sets 30000
DATABASE_URL                        serverless → pooled endpoint
DATABASE_URL_DIRECT                 worker + migrations → direct endpoint
```

`scripts/migrate.mjs` must use the **direct** endpoint — DDL and advisory locks do not survive transaction pooling.

## 7.4 Backpressure lives in job concurrency, not pool size

Pool exhaustion is a *symptom*; the control is the per-stage concurrency cap:

| Stage | Concurrency | Holds a connection during slow work? |
|---|---|---|
| `capture` | 20 (live) / **5 per workspace** (import) | no — HTTP fetch |
| `extract` | 10 | no — sidecar HTTP |
| `understand` | 8 | no — LLM call |
| `embed` | 8 | no — provider call |
| `import_parse` | 1 per workspace | no — streams from object storage |
| `dispatcher`, `reaper` | 1 each | no |

**Do not raise pool `max` to fix a throughput problem.** If jobs are queuing, either the concurrency cap is right and the queue is doing its job, or the cap should rise — the pool follows, it does not lead.

## 7.5 Not doing yet

No read replicas, no separate analytics pool, no per-tenant pooling, no connection multiplexing beyond the managed pooler. Revisit when pool saturation actually appears in metrics (§16).

---

# 8. IMPORT SCALING STRATEGY

## 8.1 Validation against the four scales

| Scale | Parse + insert | Queue behaviour | DB pressure | Extraction | AI cost (at $0.01/object) | Verdict |
|---|---|---|---|---|---|---|
| **100** | <2s | trivial | negligible | ~1 min | ~$1 | ✔ trivial |
| **1,000** | ~10s | fine | 2 batched inserts/s | ~10 min | ~$10 | ✔ fine |
| **10,000** | ~90s | **needs dispatcher** | 20 batches | ~2 h | **~$100** | ⚠ needs §8.2 + §8.4 |
| **100,000** | ~15 min | **breaks without dispatcher** | 200 batches | **~20 h** | **~$1,000** | ⚠ needs §8.2 + §8.4 + confirmation |

**Phase 4's design breaks between 10k and 100k**, for two reasons (R10):

1. **Queue volume.** Enqueuing every object at parse time creates 100,000 queue rows in one pass, and the queue becomes a second copy of the backlog with no ability to pause.
2. **Uncontrolled commitment.** The moment the jobs exist, the full extraction and AI cost is committed. A concurrency cap limits *rate*, not *total spend*.

## 8.2 The fix — a pull-based dispatcher

> **The objects table is the backlog. The queue holds only what is actively being worked.**

```
import_parse                                    (once per import)
  stream the file → validate → canonicalise → dedupe
  INSERT knowledge_objects (status='pending', import_id)  in batches of 500
  ✘ enqueue NOTHING
  → imports.status = 'processing'

import_dispatcher                               (scheduled, every 30s)
  for each workspace with pending import objects:
     in_flight = COUNT(jobs WHERE workspace=w AND stage='capture' AND status IN (pending,active))
     headroom  = min(PER_WORKSPACE_CAP - in_flight, GLOBAL_HEADROOM)
     if headroom > 0:
        claim `headroom` pending objects (FOR UPDATE SKIP LOCKED, oldest first)
        enqueue capture jobs for exactly those
```

**Properties this buys:**

| Property | How |
|---|---|
| Bounded queue depth | Never exceeds the concurrency cap, regardless of import size |
| **Pausable** | `UPDATE imports SET status='paused'` — the dispatcher skips it. Nothing to drain. |
| **Cancellable** | Mark remaining objects `cancelled`; no orphaned queue entries |
| Fair across workspaces | The dispatcher round-robins; one 100k import cannot starve another user |
| Cost controllable | Spend is committed per wave, not per import |
| Resumable | A worker restart loses nothing — the backlog is table rows |

## 8.3 Backpressure, top to bottom

```
GLOBAL          total in-flight capture jobs ≤ 100
                → dispatcher stops enqueuing entirely
   ↓
PER WORKSPACE   import-sourced in-flight ≤ 5
                → live saves always have headroom (separate queue, NORMAL priority)
   ↓
PER STAGE       capture 20 · extract 10 · understand 8 · embed 8
   ↓
PER DOMAIN      circuit breaker: 5 consecutive failures → 15 min open
                → one dead publisher cannot consume the pool
   ↓
PER PROVIDER    429 → honour Retry-After; repeated 429 → halve stage concurrency
                for 5 minutes (adaptive), restore gradually
   ↓
PER BUDGET      workspace monthly AI ceiling → understand/embed enter `blocked`
                → extraction continues; AI resumes when the ceiling lifts
```

**The invariant:** an import can be arbitrarily large and slow, and it must never make a live save slow. Live-save p95 during an active import is a Definition-of-Done criterion, not merely a metric.

## 8.4 Large-import policy — extraction first, AI on demand

Above **2,000 objects in one import**, AI understanding is **not** run automatically:

```
1. All objects are extracted (cheap, no per-object provider cost)
   → the library is browsable, readable and keyword-searchable immediately
2. AI understanding runs for:
     · the 200 most recently saved (by original_saved_at) — the ones the
       user is most likely to open
     · any object the user actually opens (on-demand, ~2s)
3. The rest is offered explicitly:
     "Understand all 2,847 articles?  Estimated: ~$28.  [ Start ]"
```

**Reason.** A 100,000-item import is a ~$1,000 decision. Making that decision silently, on the user's behalf, in their first session, is indefensible — for the business and for the user. Extraction alone already delivers a browsable, searchable library, so the product is useful before the expensive step is authorised.

**Consequence.** Topic shelves — the wow moment — need AI. For a very large import the shelves populate progressively as the first 200 complete, and fully once the user authorises the rest. **The estimate screen becomes part of the onboarding flow at scale**, and it must be honest about both cost and value.

## 8.5 Bottlenecks in order

| Rank | Bottleneck | Mitigation |
|---|---|---|
| 1 | **AI cost** | §8.4 policy + per-workspace budget + batch API |
| 2 | **Extraction throughput** (external sites, per-domain limits) | Concurrency caps, circuit breakers, honest UA, `robots.txt` |
| 3 | **Provider rate limits** | Adaptive concurrency on 429 |
| 4 | Queue volume | §8.2 dispatcher |
| 5 | DB write throughput | Batched inserts (500), short transactions |
| 6 | Object-storage writes | Naturally parallel |
| 7 | Pool contention | §7.2 rule makes this a non-issue |

---

# 9. TOPIC CANONICALIZATION

## 9.1 The problem, stated precisely

These six labels must collapse to **two** topics, not six:

```
AI                              ┐
Artificial Intelligence         ├─►  ai
Artificial-Intelligence         ┘

AI Tools                        ┐
AI Tooling                      ├─►  ai-tool
Artificial Intelligence Tools   ┘
```

`AI` and `AI Tools` are genuinely different topics and must stay separate. Collapsing everything is as wrong as collapsing nothing.

## 9.2 The pipeline

```
raw label  "Artificial Intelligence Tools"
   │
1. LOWERCASE + UNICODE NFC                    → "artificial intelligence tools"
2. STRIP PUNCTUATION, hyphens → spaces        → "artificial intelligence tools"
3. COLLAPSE WHITESPACE, trim
4. STRIP leading articles (the/a/an)
5. ALIAS EXPANSION  (longest match first)     → "ai tools"
      artificial intelligence → ai
      machine learning        → ml
      large language model    → llm
      … curated dictionary, §9.3
6. SINGULARIZE each token (simple stemmer)    → "ai tool"
7. STRIP domain stopwords
      article blog post news guide tutorial overview introduction
      thing stuff update
8. SLUGIFY (spaces → hyphens)                 → "ai-tool"
   │
   ▼
9. RESOLVE against the workspace vocabulary:
      a) EXACT slug match                              → reuse
      b) ALIAS table hit  (workspace + global)         → reuse
      c) TRIGRAM similarity > 0.85 (pg_trgm)           → reuse + record alias
      d) confidence ≥ 0.6 AND ≤2 new topics this object → CREATE
      e) otherwise                                      → DROP the assignment
```

Tracing the six examples: `AI`/`Artificial Intelligence`/`Artificial-Intelligence` → all `ai`. `AI Tools`/`AI Tooling`/`Artificial Intelligence Tools` → all `ai-tool` (step 5 normalises the third, step 6 collapses tools/tooling). **Two topics. Correct.**

## 9.3 The alias dictionary

Two tiers:

| Tier | Storage | Source | Purpose |
|---|---|---|---|
| **Global seed** | shipped as data, ~300 pairs | curated | Day-one quality. Tech/business/science abbreviations and their expansions: `ai↔artificial intelligence`, `ml↔machine learning`, `llm↔large language model`, `rag↔retrieval augmented generation`, `k8s↔kubernetes`, `saas↔software as a service`, `seo↔search engine optimization`, `ux↔user experience`, `vc↔venture capital`, `ipo↔initial public offering` … |
| **Learned per workspace** | `knowledge_topic_aliases` | written when step 9c fires, or on a user merge | The user's own vocabulary converges over time |

```
knowledge_topic_aliases (
  org_id, alias_slug, topic_id, source ('global'|'trigram'|'user'), created_at,
  PRIMARY KEY (org_id, alias_slug)
)
```

A **global** alias is a lookup with `org_id IS NULL`. A workspace alias always wins over a global one.

## 9.4 The controlled vocabulary — how the model is steered

Canonicalisation is the safety net. The **primary** mechanism is prompting: the workspace's top 60 topics by object count are passed with the article, after the cache breakpoint, with an instruction to reuse them where they fit (Phase 4 §9.3).

Without this, the resolver is repairing damage. With it, the model mostly emits labels that already exist and the resolver handles the residue. **This is the single most important quality decision in the topic system** — Phase 4 R4 correctly rated topic fragmentation as the highest-consequence single failure in the MVP, because it breaks the wow moment.

## 9.5 Confidence, deduplication, overrides

| Concern | Rule |
|---|---|
| **Confidence** | Stored per assignment. **< 0.5 → dropped, not shown greyed.** A shelf must not contain maybes. |
| **New topic gate** | Created only at confidence ≥ 0.6, **max 2 new per object**. This is the guard against vocabulary explosion — without it a 3,000-item import yields ~4,000 topics. |
| **Nightly dedup** | Merge pairs where `similarity(slug) > 0.9`, or one slug contains the other with a compatible category. Smaller merges into larger; an alias row records it. **Never merges a `is_user_renamed` topic.** |
| **Empty topics** | `object_count = 0` → deleted nightly. Never rendered. |
| **Long tail** | Shelves render only `object_count ≥ 3`. Below that the topic still filters and searches — it just gets no shelf. **A shelf of one looks like a bug.** |
| **User rename** | Sets `is_user_renamed = true` → permanently outranks the model, excluded from auto-merge, and the new label enters the prompt vocabulary |
| **User remove** | Deletes the `ai` assignment and writes a tombstone, so re-running understanding does not re-add it |
| **User add** | Creates a `source='user'` assignment — **never touched by AI re-runs** |
| **User merge** | Explicit; reassigns, deletes the source, writes an alias |

**The invariant: a user action always wins, permanently, and re-running understanding never undoes one.**

## 9.6 Measurement

Fragmentation is measurable, so it is measured: **topics per 1,000 objects**. Target **< 100**. A 3,000-item import producing more than ~300 topics means the resolver is failing and is a release blocker.

---

# 10. AI COST CONTROLS

## 10.1 The consolidated call — validated

**One structured LLM call** produces summary, TL;DR, key ideas, topics, entities and importance. Not five calls.

**Validated with two changes** (R11): `reading_difficulty` and `detected_language` are **removed from the model's job** and computed deterministically — Flesch–Kincaid from `plain_text`, and a language-detection library with the extracted `<html lang>` as a prior. Both are free, reproducible, independently testable, and — critically — they are computed in `extract`, so **they exist before AI runs and survive an AI failure.**

Final schema, seven fields:

```
tldr               string ≤240
summary            string 2–4 sentences
key_ideas          [{ text ≤200, evidence_quote }]  1–5
topics             [{ label ≤40, confidence, category<enum> }]  1–5
entities           [{ name, type, salience }]  0–10
importance_signal  integer 1–5     (ranking input only, never displayed)
content_warning    null | paywalled | error_page | login_wall | mostly_navigation
```

Everything else is derived deterministically: word count, reading time, difficulty, language, domain, favicon, excerpt.

## 10.2 Controls

| Control | Value / rule |
|---|---|
| **Input hashing** | `content_hash = sha256(plain_text)` |
| **Cache key** | `UNIQUE (object_id, prompt_version, schema_version, model, content_hash)` — a hit means **zero cost** |
| **Prompt caching** | Frozen system block first, cache breakpoint, then workspace vocabulary, then the article. **`cache_read_input_tokens` must be non-zero across consecutive calls** — asserted in CI, alerted in production. Zero means a silent invalidator, costing ~10×. |
| **Batch API** | All import-sourced understanding at 50% cost |
| **Max content length** | **30,000 tokens**; over → head 60% + tail 25% with an explicit marker; `truncated` recorded |
| **Minimum content** | **<100 words → skip the call entirely**, mark `partial`, `content_too_short`. Paying to summarise a stub is pure waste. |
| **Output cap** | `max_tokens: 4000` — the schema cannot legitimately need more |
| **Effort** | start `medium`; tune on measured quality, not assumption |
| **Per-workspace budget** | `checkQuota` **before** the call; exceeded → `blocked`, resumable, extraction unaffected |
| **Large imports** | §8.4 — not automatic above 2,000 objects |
| **Cost ledger** | Real tokens × real rate, per call. `null` = **unmeasured**, not free. |
| **North-star metric** | **cost per saved object**, 7-day rolling. Alert at >2× baseline. |

## 10.3 Retry

| Code | Retry | Terminal state |
|---|---|---|
| `provider_error`, timeout | ×5, exp + jitter | `partial` |
| `rate_limited` | honour `Retry-After`, ×8, **halve stage concurrency for 5 min** | `partial` |
| `unparseable_output` | ×1 with a stricter reminder | `partial` |
| `content_policy_refusal` | none | `partial`, honest message |
| `context_too_large` | ×1 after harder truncation | `partial` |
| `budget_exceeded`, `missing_credential` | none | **`blocked`** — resumable, auto-resumes |

`blocked ≠ failed`: the capability works, a condition must change.

---

# 11. PROMPT VERSIONING

## 11.1 Provenance — every AI output is fully traceable

Recorded on every intelligence row:

| Field | Example | Why |
|---|---|---|
| `prompt_version` | `understand@7` | which prompt text |
| `prompt_hash` | `sha256` of the rendered system block | catches an edit that forgot to bump the version |
| `schema_version` | `understand-schema@3` | output shape |
| `model` | `claude-opus-5` | which model |
| `model_config_hash` | `sha256(effort, max_tokens, thinking)` | configuration is part of reproducibility |
| `content_hash` | `sha256(plain_text)` | which input |
| `generated_at` | epoch ms | when |
| `provider` | `anthropic` | cost attribution |

`prompt_hash` is the interesting one: it makes "someone edited the prompt without bumping the version" a **detectable** condition rather than a silent one.

## 11.2 The rule that prevents accidental mass reprocessing

> **A prompt version change never triggers reprocessing. It only affects objects processed after the change.**

Phase 4 conflated two questions (R12): *"would this produce a different result?"* is a cache-key question; *"should we recompute it now?"* is a budget decision. They are separated:

- `prompt_version` participates in the **cache key**, so an object being processed anyway uses the current prompt
- Nothing **scans for** stale rows and re-runs them
- A library with mixed versions is normal, visible and queryable

## 11.3 Reprocessing is explicit, scoped and costed

```
Admin → Reprocess
  scope:      one workspace · one import · objects matching a filter
  target:     prompt_version / model
  ESTIMATE SHOWN BEFORE ANYTHING RUNS:
     "4,182 objects · ~12.5M input tokens · estimated $41.20
      [ Cancel ]  [ Start ]"
  → dispatched through the SAME pull-based dispatcher as import (§8.2)
     — pausable, cancellable, rate-limited, budget-capped
```

Never global, never automatic, never without an estimate.

## 11.4 When reprocessing is actually warranted

| Change | Reprocess? |
|---|---|
| Typo or wording fix, same schema | **No.** Cost without benefit. |
| Materially better extraction quality | **Optional**, user- or admin-initiated, per workspace |
| **Schema adds a field** | **No** — backfill just that field with a cheaper targeted call if it matters |
| **Schema removes/renames a field** | **No** — read-side compatibility handles it |
| Model change | **No** for existing objects; new objects use the new model |
| **Bug producing wrong output** (e.g. topics leaking into summaries) | **Yes** — scoped to affected objects, identified by `prompt_version` |
| Content re-extracted (`content_hash` changed) | **Yes, automatically** — this is a genuine input change, and it is the one automatic case |

---

# 12. IDEMPOTENCY AND THE DOUBLE-BILLING RISK

## 12.1 The scenario

```
LLM call succeeds → process crashes → DB never records it
→ job redelivered → LLM called again → billed twice
```

## 12.2 Design — reservation before spend

Phase 5 explicitly allows imperfection here if perfection is disproportionate. It is. The design **minimises duplicates, makes them measurable, and never corrupts state.**

```
STEP 1  RESERVE  (short transaction, no network held)
   INSERT INTO knowledge_ai_reservations
     (idempotency_key, object_id, org_id, stage, status, attempt,
      started_at, prompt_version, model, content_hash)
   VALUES (…, 'in_flight', …)
   ON CONFLICT (idempotency_key) DO NOTHING
   RETURNING id

   0 rows → someone else holds it:
       · status='in_flight' AND age < 10 min  → EXIT quietly (no duplicate)
       · status='completed'                    → EXIT, already done
       · status='in_flight' AND age ≥ 10 min   → AMBIGUOUS (§12.3)

STEP 2  SPEND     the LLM call. NO database connection held. (§7.2)

STEP 3  COMMIT    (one transaction, immediately after — nothing between)
   UPDATE reservation SET status='completed', finished_at, tokens, cost
   INSERT object_intelligence …
   INSERT topics / assignments …
   INSERT cost_ledger …
   UPDATE knowledge_objects SET pipeline_status='ready'
```

`idempotency_key = sha256(object_id : stage : content_hash : prompt_version : schema_version : model)`

## 12.3 The ambiguous case, handled honestly

A reservation stuck `in_flight` past 10 minutes means the worker died. **We cannot know whether the provider call completed.** Rather than guess:

```
reaper marks it status='abandoned', increments duplicate_risk_count,
and permits exactly ONE retry (attempt 2).
If attempt 2 also abandons → status='failed', object → partial.
NEVER an unbounded retry loop on a paid operation.
```

**`duplicate_risk_count` is the measurement.** Summed per day it is the honest upper bound on money lost to this window — not an estimate, a count. It is on the cost dashboard.

## 12.4 Why not stronger guarantees

| Alternative | Rejected because |
|---|---|
| Two-phase commit with the provider | Not offered by any provider. Impossible. |
| Provider-side idempotency keys | Not uniformly available; and it does not help when we never see the response |
| Write the response to durable storage before parsing | Halves the window, doubles the writes on every call, and still has a window |
| Accept and do nothing | Fails "make duplicates measurable" |

## 12.5 What this guarantees

| Property | Guaranteed? |
|---|---|
| Zero duplicate AI calls | **No** — and that is stated, not implied |
| Duplicates only on genuine process death | **Yes** |
| Duplicates measurable | **Yes** — `duplicate_risk_count` |
| State never corrupted | **Yes** — step 3 is one transaction; partial writes are impossible |
| Deterministic re-derivation | **Partial** — same inputs and prompt give similar but not byte-identical output. Recorded provenance (§11.1) makes any difference explainable. |
| Bounded retries on paid operations | **Yes** — max 2 attempts, ever |

---

# 13. CONTENT EXTRACTION BOUNDARY

## 13.1 The interface — the application never sees Wallabag

```
lib/knowledge/ingestion/extraction/
  types.ts        ExtractionRequest · ExtractionResult · ExtractionError
  extractor.ts    ContentExtractor interface
  tiers.ts        the fallback ladder
  providers/
    graby.ts      HTTP client for the sidecar          (tier 1)
    readability.ts  Node implementation                 (tier 2)
    metadata.ts   OpenGraph/meta only                   (tier 3)
```

```typescript
interface ContentExtractor {
  readonly id: string          // "graby" | "readability" | "metadata"
  readonly version: string     // participates in extractor_version
  isAvailable(): Promise<boolean>
  extract(req: ExtractionRequest): Promise<ExtractionResult>
}

interface ExtractionRequest {
  url: string            // for base-URL resolution and site-config lookup
  html: string           // ALWAYS supplied by Node — the sidecar never fetches
  contentType?: string
  timeoutMs: number
}

interface ExtractionResult {
  title: string | null
  cleanHtml: string | null      // NOT yet sanitised — the caller sanitises
  plainText: string
  excerpt: string | null
  authors: string[]
  publishedAt: number | null
  previewImageUrl: string | null
  language: string | null
  extractorId: string
  extractorVersion: string
  siteConfigMatched: boolean    // the metric that proves tier 1 earns its keep
}

type ExtractionError =
  | { code: "empty";        retryable: false }
  | { code: "js_required";  retryable: false }
  | { code: "unavailable";  retryable: true  }
  | { code: "timeout";      retryable: true  }
  | { code: "malformed";    retryable: false }
```

**Nothing Wallabag-specific crosses this boundary.** No graby types, no PHP concepts, no site-config structures. Replacing graby means writing one `ContentExtractor` — no caller changes.

## 13.2 Wire protocol

```
POST http://graby-sidecar.internal:8080/extract
{ "url": "...", "html": "...", "options": { "siteConfigOnly": false } }

200  { title, html, text, excerpt, authors[], date, image, language,
       extractorVersion, siteConfigMatched, tier }
422  { "error": "extraction_empty" }        → tier 2
503  { "error": "unavailable" }             → retry, then tier 2
```

## 13.3 Tiers, timeouts, retries

| Tier | Extractor | Timeout | Retry | On failure |
|---|---|---|---|---|
| 1 | graby sidecar | 20s | ×3 (5xx/timeout only) | → tier 2 |
| 2 | Node readability | 10s | none | → tier 3 |
| 3 | metadata-only | 2s | none | `pipeline_status='partial'`, object still saved and visible |

**`422 empty` never retries** — it is a determinate answer. **Circuit breaker:** 10 consecutive sidecar failures → open 60s → all extraction uses tier 2 meanwhile. **The product keeps working with the sidecar entirely down**, at reduced quality.

## 13.4 Versioning

`extractor_version = "{extractorId}@{version}+{siteConfigVersion}"`, recorded on every object. A change does **not** trigger reprocessing (same rule as §11.2) but makes a targeted re-extract possible, and `raw_html_key` in object storage makes it *possible at all* — which Wallabag cannot do.

## 13.5 Isolation guarantees

| Property | Guarantee |
|---|---|
| No egress | The sidecar container has **no outbound network access**. It cannot be an SSRF proxy even if compromised. |
| No database | Stateless. No credentials. |
| No public ingress | Private networking only, enforced at the platform layer. |
| Not on the critical path | Tier 2 covers most articles. Sidecar down ≠ product down. |
| Not in Milestone 1 | Milestone 1 ships tiers 2 and 3 only (§14). The sidecar is Milestone 2. |

> ⚠ **Standing organizational risk:** once tier 2 works acceptably, finishing tier 1 feels optional, and the loss is invisible. **`siteConfigMatched` rate is tracked with a target from the moment tier 1 ships**, so the gap is visible rather than comfortable.

---
# 14. FIRST IMPLEMENTATION MILESTONE

## 14.1 Scope — a thin vertical slice, no AI

```
USER  →  SAVE URL  →  SSRF VALIDATION  →  INGESTION RECORD
      →  EXTRACTION (async)  →  CONTENT PERSISTENCE  →  LIBRARY VIEW
```

**Goal: prove the new bounded context works end-to-end inside the existing application, without touching the Workforce.**

**In scope**

| # | Item |
|---|---|
| 1 | `lib/platform/*` shared-layer re-exports + the ESLint boundary rule |
| 2 | Remove `typescript.ignoreBuildErrors` + a CI typecheck gate (§6.6) |
| 3 | Migrations: `knowledge_objects`, `knowledge_content`, `knowledge_jobs` — **purely additive**, no Workforce table touched |
| 4 | `lib/knowledge/access` — `AccessScope`, `organizationId → workspaceId` mapping |
| 5 | URL canonicalisation + `url_hash` + duplicate detection |
| 6 | Hardened fetcher: the four SSRF gaps closed (§5.1) |
| 7 | Extraction tiers **2 and 3 only** (Node readability + metadata) |
| 8 | HTML sanitiser (allowlist, on write) |
| 9 | Job runner + the four-state machine + reaper |
| 10 | `POST /api/knowledge/save`, `GET /api/knowledge/items`, `GET /api/knowledge/items/[id]`, `GET /api/knowledge/processing/[id]` |
| 11 | `/knowledge` — a plain card list with the four card states; `/knowledge/read/[id]` — a basic reader |
| 12 | The Priority-1 test suite (§16) |
| 13 | A Workforce smoke test suite |

**Explicitly out**

AI of any kind · embeddings · search · topics · shelves · collections · import · the graby sidecar · object storage for raw HTML · highlights · audio · sharing · Google OAuth · RLS · masonry · saved views.

> **Why no AI.** Milestone 1 exists to prove the *boundary* — that a new bounded context can live beside a frozen product, share the tenant safely, and run asynchronous work. Adding AI would put the entire critical-path chain Phase 4 §24.2 flagged as zero-slack into the first milestone, and it would make every failure ambiguous between "the architecture is wrong" and "the prompt is wrong."

## 14.2 Job runner — the one deliberate deferral

Milestone 1 does **not** add `pg-boss` or a worker container.

```
Milestone 1:  a `knowledge_jobs` table + a claim loop driven by
              an authenticated internal route, invoked on a schedule.
              Compare-and-swap claiming, real retry, real backoff,
              real reaper — the SAME semantics pg-boss will provide.

Milestone 2:  swap the claim loop for pg-boss + a worker container.
              The stage functions do not change.
```

**Reason.** It adds **zero dependencies** to `package.json` and **zero new deployment targets** in the first milestone, which is what makes the Knowledge Library provably unable to break the Workforce build or deploy. Job *semantics* — idempotency, compare-and-swap, backoff, the reaper — are built correctly from day one; only the *transport* is temporary.

**Trade-off, stated honestly.** A route-driven claim loop is bounded by the function time limit, so Milestone 1 handles one object per invocation and is unsuitable for import. That is fine — import is Milestone 2, arriving with pg-boss.

## 14.3 Two-engineer workstreams

| | **Engineer A — Ingestion core** | **Engineer B — Surface & safety** |
|---|---|---|
| **Owns** | `lib/knowledge/{access,content,ingestion}`, migrations, the job runner | `lib/platform`, API routes, `app/(knowledge)`, `components/knowledge`, CI |
| **Day 1–2** | Schema design + migrations + `AccessScope` + repository skeleton | Remove the TS flag + CI gate · `lib/platform/*` · ESLint boundary rule · Workforce smoke tests |
| **Day 3–5** | URL canonicalisation + dedupe · hardened fetcher (4 SSRF gaps) | `lib/knowledge/contracts` types + **fixtures** · `POST /save` + `GET /items` against fixtures |
| **Week 2** | Extraction tiers 2–3 · sanitiser · normalisation | `/knowledge` list view · card four states · `/knowledge/read/[id]` |
| **Week 3** | Job runner · state machine · reaper · retry classification | `GET /processing/[id]` · live status polling · empty/error states |
| **Week 4** | Priority-1 tests: SSRF, canonicalisation, idempotency, state machine | Priority-1 tests: tenant isolation, API auth · integration · DoD verification |

**Dependencies and integration points**

```
DAY 1-2   A: migration + repo signatures  ──┐
          B: lib/platform + CI              │  ← independent, no blocking
                                            │
DAY 3     A delivers lib/knowledge/contracts (types + fixtures)  ★ THE INTEGRATION POINT
                                            │
          B builds every route and screen against FIXTURES,
          never waiting for A's implementation
                                            │
WEEK 3    A's real pipeline replaces the fixture responses
          — B's code does not change, because the contract did not
```

**The contract-and-fixtures handoff on day 3 is what makes two engineers parallel rather than serial.** It is the same mechanism Phase 2 §29 specified for the v0 workflow, applied to a human pair.

**Critical path:** `schema → repositories → save endpoint → job claim → extraction → content persisted → list endpoint → list renders`. Everything on it is Engineer A's except the two endpoints. Engineer B's UI work is entirely off the critical path because of the fixtures.

**Where a third engineer would help** — in priority order:

1. **The graby sidecar (Milestone 2 work, pulled forward).** Fully parallel, zero shared files, and it removes the largest schedule risk from Milestone 2.
2. **Test infrastructure** — Testcontainers/Neon-branch harness, the extraction fixture corpus, CI wiring. Currently split across both engineers and it is the thing that gets cut under pressure.
3. **Google OAuth + account recovery** — genuinely independent (§16, R8).

A third engineer does **not** meaningfully compress Milestone 1's critical path, because that path is one sequential chain. It compresses Milestone 2 substantially.

---

# 15. MILESTONE 1 ACCEPTANCE CRITERIA

Every criterion is testable. Criterion 11 is the one that protects the Workforce.

| # | Criterion | How it is verified |
|---|---|---|
| **1** | **A user can authenticate** | Existing email/password login works unchanged. Session carries `organizationId`. Survives refresh. *Regression test — this is existing behaviour that must not break.* |
| **2** | **A user can open the Library** | `/knowledge` renders for an authenticated user; redirects to `/login` when not. Empty state shows on a new account. |
| **3** | **A user can paste a URL** | The save input accepts a URL; client-side format validation only. |
| **4** | **A user can submit a URL** | `POST /api/knowledge/save` returns **201 in <500ms p95** (Milestone 1 target; <200ms once pg-boss lands). Returns `{ id, pipelineStatus:'pending' }`. Invalid URL → 400 with a plain-language message. A duplicate returns the existing object with `duplicate:true` and **performs no fetch**. |
| **5** | **A user sees processing state** | The card renders `processing` immediately with the real domain visible. `GET /api/knowledge/processing/[id]` returns per-stage detail. The card transitions to `ready` within 3s of completion without a manual reload. |
| **6** | **Extraction happens asynchronously** | The save response returns **before** any fetch begins — asserted by a test that stubs a 10s fetch and still sees a <500ms response. |
| **7** | **The extracted article is persisted** | `knowledge_content` holds `plain_text`, sanitised `clean_html` and `content_hash`. Title, author, published date, language, word count and reading time are populated where present in the source. Verified against a **50-URL fixture corpus with ≥85% title-and-body success**. |
| **8** | **The article appears in the Library** | It is in `GET /api/knowledge/items` within 60s of saving, and the reader at `/knowledge/read/[id]` renders it. |
| **9** | **Failures are visible** | A blocked, dead or oversized URL produces a `failed` card showing the **real reason in plain language** plus a working Retry and the original link. **Never a blank card, never an endless spinner.** Verified for: SSRF block, 404, timeout, oversized response, disallowed content type, empty extraction. |
| **10** | **User A cannot access user B's article** | For every Knowledge repository function, a foreign `org_id` returns nothing. `GET /api/knowledge/items/[id]` with another workspace's id returns **404, not 403**. A synthetic cross-tenant canary returns zero rows. *Parameterised over the exported repository surface, so a new unscoped function fails automatically.* |
| **11** | **The Workforce still works** | A smoke suite covering: login · `/studio` renders · list workers · create a worker · build · release · run (dev-mode LLM) · `/outputs` renders · `/library` (the **worker** library) renders. **Plus: `git diff` shows no changes to any Workforce file except the two approved in §6.5.** |
| **12** | **The boundary holds** | ESLint fails on a cross-context import (verified with a deliberate violation in a test fixture). `tsc --noEmit` passes in CI. `next build` succeeds. |
| **13** | **A crashed job recovers** | Kill the process mid-extraction; the reaper re-enqueues within 15 minutes and the object reaches a terminal state. No object is ever permanently stuck. |
| **14** | **No duplicate work** | Saving the same URL twice → one object. A job redelivered → one execution (compare-and-swap verified under concurrency). |

**Launch gate for Milestone 1:** criteria 1–14 green, Priority-1 tests passing, and no unapproved diff in Workforce files.

---

# 16. TESTING STRATEGY FOR MILESTONE 1

The repository has **zero tests today**. Milestone 1 establishes the harness and the highest-risk coverage. This is scope, not a stretch goal.

## 16.1 Priority 1 — blocks the milestone

| Area | Tests |
|---|---|
| **Tenant isolation** | Parameterised over every exported Knowledge repository function: a foreign `org_id` returns nothing. A new function without a scope parameter **fails the suite automatically**. Cross-tenant API access → 404. Canary returns zero. |
| **SSRF** | Table-driven: IPv4 private ranges · IPv6 (`::1`, `fe80::`, `fc00::`) · IPv4-mapped · bracketed literals · `localhost` · `metadata.google.internal` · non-http schemes · malformed URLs · **DNS rebinding** (public hostname → private IP) · **redirect-to-private on hop 2** · size cap exceeded · disallowed content type. Each asserts a *block*, not merely an error. |
| **URL validation & canonicalisation** | The same article via 12 tracking-parameter variants → **one `url_hash`**. Trailing slash, case, port, fragment, hash-routing, IDN, percent-encoding. |
| **Ingestion + persistence** | Save → job → extraction → content row. Metadata mapping. `content_hash` stability. |
| **Duplicate URLs** | Same URL twice → one object, no second fetch. Concurrent identical saves → one object (unique constraint holds). |
| **Failed extraction** | Each failure code → the correct terminal state, a user-facing message, and a retryable/non-retryable classification. |
| **Retry** | Retryable codes retry with backoff; non-retryable do not. Attempt cap enforced. |
| **Concurrent jobs** | Two workers claiming the same job → **exactly one** proceeds (compare-and-swap under real concurrency, not mocked). |
| **Authentication** | Unauthenticated → 401 on every Knowledge route. Session with a stale org → 404/401. Existing Workforce login unaffected. |
| **Sanitiser** | XSS corpus: `onerror`, `javascript:`, `<svg><script>`, `<iframe srcdoc>`, `data:` URLs, CSS `expression()`, mutation-XSS. |
| **Workforce regression** | The §15 criterion-11 smoke suite. |

## 16.2 Priority 2 — before the milestone is called done

Extraction quality against the 50-URL fixture corpus with a floor · API contract tests (auth, validation, error codes, cursor stability) · migration apply-from-empty and apply-twice · the boundary lint rule verified against a deliberate violation · reaper recovery after a killed process.

## 16.3 Tooling

**Vitest** for unit and integration. **A real Postgres** — Testcontainers locally, a disposable Neon branch in CI. **Never a mocked database for repository tests**: the thing under test *is* the SQL predicate, and mocking it tests nothing. **No live network in CI** — extraction runs against recorded HTML fixtures; no provider calls at all (there is no AI in Milestone 1).

**One Playwright E2E:** sign in → save a URL → see the processing card → see it become ready → open the reader.

## 16.4 CI gates

```
tsc --noEmit                          required   (possible today — zero errors)
eslint (incl. the boundary rule)      required
Priority-1 suite                      required
Priority-2 suite                      required
next build                            required
Workforce smoke suite                 required
no-forbidden-field logging lint       required
```

## 16.5 The minimum bar before AI may be added

AI does not start until: **Priority-1 green**, the extraction corpus at ≥85%, the reaper verified by an actual process kill, the cross-tenant canary running on a schedule, and cost-ledger plumbing in place (even with nothing to record yet). **Adding a paid, non-deterministic operation to an unverified pipeline is how cost incidents happen.**

---

# 17. BRANCH STRATEGY

## 17.1 Current state

`claude/wallabag-repository-audit-hw1jsv` holds five phase documents and **nothing else** — no code, no config, no migrations. Its name is stale: it describes Phase 1's audit, not five phases of architecture.

## 17.2 Recommended sequence

```
STEP 1  ── Merge the documentation, alone ─────────────────────────
   Open a PR from claude/wallabag-repository-audit-hw1jsv → main
   Title: "docs: architecture phases 1-5"
   Contents: docs/ only. Zero risk — nothing executable changes.
   Reviewer confirms: no application file is touched.
   ⚠ DO NOT MERGE AUTOMATICALLY — this is the human's call.

STEP 2  ── Safety hardening, its own small PR ─────────────────────
   Branch:  chore/typecheck-and-tenant-hardening   (from main)
   Contents:
     · remove typescript.ignoreBuildErrors        (§6.6)
     · add the CI typecheck gate
     · add orgId to the 3 unscoped repo functions (§6.5 #2)  ⚠ needs approval
     · add the Workforce smoke suite
   Small, independently reviewable, independently revertable.
   Merge before any Knowledge Library work begins.

STEP 3  ── The implementation branch ──────────────────────────────
   Branch:  feat/knowledge-library-m1              (from main, after step 2)
   Contents: Milestone 1 only.
   Two engineers work on short-lived branches off it:
     feat/knowledge-library-m1-ingestion   (Engineer A)
     feat/knowledge-library-m1-surface     (Engineer B)
   integrating into feat/knowledge-library-m1 at least daily.

STEP 4  ── Merge Milestone 1 ──────────────────────────────────────
   PR → main once all 14 acceptance criteria are green.
```

## 17.3 Reasoning

| Decision | Why |
|---|---|
| **Merge docs first, alone** | Zero-risk and it makes the architecture the shared reference before anyone writes code. It also unblocks the branch, whose name no longer describes its contents. |
| **A separate hardening PR** | It is the only PR that touches Workforce files. Isolating it makes the diff trivially reviewable and trivially revertable — which is exactly what you want for a change to a frozen product. |
| **Do not continue on the audit branch** | Its name is stale, and mixing five phase documents with implementation makes both harder to review. |
| **A shared integration branch, not straight to main** | Milestone 1 is only meaningful complete. A half-built bounded context on `main` is dead code that still has to build. |
| **Daily integration between the two engineers** | The contract-and-fixtures handoff (§14.3) only works if drift is caught in hours. |

**Not recommended:** long-lived feature branches beyond one milestone · trunk-based commits of a partial context to `main` · a `develop` branch (unnecessary ceremony for two people) · rebasing shared branches.

---

# 18. REMAINING RISKS

| # | Risk | Severity | Mitigation | Owner decision needed |
|---|---|---|---|---|
| **1** | **One deployment: a Knowledge build failure blocks Workforce deploys** | **High** | The accepted cost of §2's option C. Mitigated by CI gates, zero new dependencies in M1, and Knowledge code being unreachable from Workforce routes until M1 ships. | Accept, or reconsider option D later |
| **2** | **Workforce has no tests and is frozen** | **High** | The smoke suite in M1 (criterion 11) is the first coverage it has ever had. It is thin by necessity. | — |
| **3** | **Two engineers, no slack** | **High** | Milestone-based delivery instead of a fixed 8-week date. M1 has no AI, so the zero-slack chain is removed. | Accept milestone dates as estimates, not commitments |
| **4** | **Shared tenant table couples the products** | Medium | Required (R4). One mapping point in `lib/knowledge/access`. RLS never applied to shared tables (R9). | — |
| **5** | **Topic fragmentation breaks the wow moment** | **High** (later milestone) | §9's full canonicalisation pipeline + vocabulary-in-prompt + a measured target of <100 topics per 1,000 objects | — |
| **6** | **Large-import AI cost** | **High** (later milestone) | §8.4: extraction-first, AI on demand above 2,000 objects, with an explicit cost estimate | Approve the 2,000 threshold and the estimate UX |
| **7** | **Double billing on crash** | Medium | §12: reservation-before-spend, max 2 attempts, `duplicate_risk_count` measured | Accept that it is minimised, not eliminated |
| **8** | **The sidecar never gets finished** because tier 2 is good enough | Medium | `siteConfigMatched` tracked with a target from the moment tier 1 ships | — |
| **9** | **Account recovery does not exist.** There is no password-reset flow. | **Medium — and currently unowned** | Not a Milestone 1 blocker (test accounts), but it **must** ship before real users. Google OAuth partially sidesteps it. | **Schedule it explicitly** |
| **10** | **`app/layout.tsx` hard-codes dark mode and Workforce branding** | Low | A nested `app/(knowledge)/layout.tsx` overrides metadata and theme without touching the root | — |
| **11** | **No object storage in M1** — raw HTML is not archived, so re-extraction is impossible for M1-era objects | Low | Accepted for M1. Arrives in M2. M1 objects can be re-fetched from their URL if needed. | — |
| **12** | **v0 is not yet in the loop** | Medium | M1's UI is deliberately plain. The `lib/knowledge/contracts` + fixtures handoff (§14.3) is the same mechanism v0 will use later. | Decide when v0 joins |

---

# 19. REMAINING QUESTIONS

## 19.1 Closed by this phase

| Ref | Question | Answer |
|---|---|---|
| C12 / R1 | Retire the Workforce? | **No — it coexists.** Directed. |
| C13 / R2 | Team size? | **Two.** Directed. Milestone-based delivery. |
| C4 / R7 | Collections in the MVP? | **No.** Removed from nav; saved views live in Library. |
| C5 / R8 | Auth strategy? | **Keep Credentials, add Google.** |
| C3 / R14 | Third import format? | **Pocket + generic CSV.** No third parser. |
| C7 / R15 | Ask-This-Article? | **Deferred past Milestone 3.** |
| C9 / R16 | Embedding provider and dimension? | **Deferred to the search milestone**, decided against a golden set. |
| — / R5 | How many TypeScript errors? | **Zero.** Remove the flag now. |
| — / R6 | Is every repository function tenant-scoped? | **No — three are not.** Latent, not exploitable. |

## 19.2 Open — needed before or during Milestone 1

| # | Question | Needed by | Why it matters |
|---|---|---|---|
| **1** | **Approve the two Workforce-touching changes?** (remove the TS flag · scope the three repository functions) | **Before step 2** | Both are behaviour-preserving, but R1 says do not modify the Workforce without approval. Blocks the hardening PR. |
| **2** | **Is `/knowledge` an acceptable URL**, given the label stays "Library"? | Before M1 UI | `/library` is taken (R3). If a different path is preferred, decide now — changing it later means redirects. |
| **3** | **Which Postgres endpoint pair is available?** (pooled + direct) | Before M2 | §7.3 assumes both. Neon provides them; another host may not, which changes the pool plan. |
| **4** | **Is a container platform available** for the worker and sidecar? | Before M2 | M1 deliberately avoids needing one. M2 requires it. |
| **5** | **When does v0 join?** | Before M2 | M1's UI is plain by design. The contracts handoff is ready whenever v0 is. |
| **6** | **Who owns account recovery, and when?** | Before real users | Risk 9. Currently unowned. |

## 19.3 Open — needed later

Object-storage provider (M2) · acceptable AI cost per saved object (M3) · the 2,000-object large-import threshold and its estimate UX (M2) · data-retention and deletion policy · self-hosting requirement · sub-processor disclosure · whether a product switcher between Workforce and Knowledge is ever wanted.

---

*End of Phase 5. No production code, no migrations, no application changes, no UI. Workforce untouched.*
