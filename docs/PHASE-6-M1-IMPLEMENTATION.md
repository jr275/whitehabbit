# Phase 6 — Milestone 1 Implementation

**Scope:** SAVE → SSRF VALIDATION → INGESTION RECORD → ASYNC EXTRACTION → PERSISTENCE → KNOWLEDGE LIBRARY VIEW
**Date:** 2026-09-01
**Branch:** `feat/knowledge-library-m1`
**Not implemented:** AI of any kind, embeddings, semantic search, agents, knowledge graph, audio, research, sharing.

---

# 1. WHAT CHANGED

Two hardening changes to existing code (both pre-approved), and a new
bounded context added alongside the Workforce product.

| | |
|---|---|
| **Hardening** | Removed `typescript.ignoreBuildErrors`; scoped three Workforce repository writes by org |
| **New product** | The Knowledge Library at `/knowledge`, with its own domain, API, jobs and UI |
| **Workforce** | Unchanged in behaviour. `/library`, `lib/library/`, `components/library/` untouched. |
| **Dependencies added** | **Zero** |
| **AI providers called** | **None** |

## The Workforce diff, in full

Only three Workforce files changed, and the behaviour diff is nine lines:

```
lib/db/repo.ts        3 functions gained an orgId parameter and an
                      "AND org_id = $n" predicate
lib/agent/runtime.ts  8 call sites pass run.orgId, which was already
                      in scope
next.config.mjs       typescript.ignoreBuildErrors removed
```

**This is behaviour-preserving.** Every id passed to those three
functions is a `randomUUID()` generated moments earlier in the same
execution and already belongs to the caller's org, so adding the
predicate cannot change any existing outcome. `tests/workforce/
repo-scope.test.ts` pins both halves: a foreign org is now a no-op,
and the owning org still works exactly as before.

---

# 2. FILES

## Created

```
migrations/
  0002_knowledge_m1.sql            4 tables, purely additive

lib/platform/                      the ONLY shared boundary for Knowledge
  index.ts db.ts session.ts errors.ts logger.ts
  ratelimit.ts security.ts runtime.ts utils.ts

lib/knowledge/
  access/scope.ts                  AccessScope; the org->workspace mapping
  content/types.ts                 the Knowledge Object shape
  content/repo.ts                  every function requires an AccessScope
  api/contracts.ts                 wire DTOs (narrower than the domain)
  ratelimit.ts                     Knowledge's own rate-limit scopes
  ingestion/
    url.ts                         canonicalization + sha256
    safe-fetch.ts                  the SSRF boundary
    state.ts                       both state machines + retry policy
    jobs.ts                        CAS claiming, backoff, reaper
    pipeline.ts                    one job end to end
    runner.ts                      queue drain
    extraction/
      types.ts                     ContentExtractor interface
      sanitize.ts                  allowlist sanitizer, on write
      metadata.ts                  OpenGraph/meta precedence chain
      readability.ts               content-density heuristic
      index.ts                     the tier ladder

app/api/knowledge/
  save/route.ts  items/route.ts  items/[id]/route.ts
  items/[id]/retry/route.ts  processing/[id]/route.ts  tick/route.ts

app/(knowledge)/
  layout.tsx  knowledge/page.tsx  knowledge/read/[id]/page.tsx

components/knowledge/
  library.tsx  item-card.tsx  save-form.tsx

scripts/check-boundaries.mjs       bounded-context enforcement

tests/
  helpers/db.ts  helpers/alias-hooks.mjs  helpers/register-alias.mjs
  workforce/repo-scope.test.ts
  knowledge/url.test.ts  ssrf.test.ts  extraction.test.ts
  knowledge/state.test.ts  ingestion.test.ts
```

## Modified

| File | Change |
|---|---|
| `next.config.mjs` | removed `typescript.ignoreBuildErrors` (`images.unoptimized` deliberately left alone — separate concern) |
| `lib/db/repo.ts` | 3 functions org-scoped |
| `lib/agent/runtime.ts` | 8 call sites pass `run.orgId` |
| `package.json` | added `typecheck`, `test`, `boundaries`, `verify` scripts. **No dependencies.** |
| `tsconfig.json` | `allowImportingTsExtensions` — tests need explicit `.ts` for Node ESM |
| `.env.example` | documents `KNOWLEDGE_TICK_SECRET` |

## NOT modified

`app/library/**` · `lib/library/**` · `components/library/**` · `app/layout.tsx` ·
`app/studio` `app/factory` `app/workforce` `app/outputs` `app/evolve` `app/observatory`
`app/outcomes` `app/insights` `app/integrations` `app/products` `app/approvals` ·
`lib/workforce*` `lib/character` `lib/products` `lib/insights` `lib/worker*`
`lib/agent/skills` `lib/agent/tools` `lib/fabric-graph` `lib/simulation` ·
`lib/session.ts` `lib/auth*.ts` `lib/api-error.ts` `lib/rate-limit.ts`
`lib/security/ssrf-guard.ts` `lib/observability/logger.ts` `lib/db/client.ts` ·
`migrations/0001_init.sql` · all 88 existing components.

---

# 3. ARCHITECTURE

```
  app/(knowledge)/knowledge/**        app/library/**   ← Workforce, untouched
  components/knowledge/**             components/**
  app/api/knowledge/**                app/api/workers/**
           │                                   │
           ▼                                   ▼
  lib/knowledge/**                     lib/workforce/**, lib/agent/**, …
           │                                   │
           └──────────► lib/platform/* ◄───────┘
                        (re-exports only)
                               │
                   lib/db/client · lib/session · lib/api-error
                   lib/security/ssrf-guard · lib/observability
                               │
                          PostgreSQL
                   organizations (SHARED tenant table)
                   knowledge_*  ·  workers/executions/…
```

**Enforcement.** `scripts/check-boundaries.mjs` fails if Knowledge
imports Workforce internals, if Workforce imports Knowledge, or if
`lib/platform` depends on either domain. Verified against a deliberate
violation. ESLint is not a dependency and this milestone is
zero-new-dependencies, so the rule is a plain Node script over import
specifiers.

**`lib/platform` re-exports rather than moves.** Relocating
`lib/session.ts` would rewrite imports across ~14 Workforce files for a
cosmetic gain, and the Workforce is frozen. The directory is the shared
contract: if it is not exported there, Knowledge does not get to use it.
It is split into focused modules because the barrel pulls `next/server`
via `errors.ts`, which a fetcher has no business depending on.

**Tenancy.** `organizations` stays the physical tenant table and is
shared. It is **not** renamed to `workspaces` — that would touch every
Workforce repository function. Knowledge calls it `workspaceId` and maps
it in exactly one place: `lib/knowledge/access/scope.ts`.

---

# 4. DATA MODEL

Four tables, all new, `migrations/0002_knowledge_m1.sql`. No existing
table is altered.

| Table | Purpose |
|---|---|
| `knowledge_objects` | The aggregate root. Owned by the **organization**, not a user. |
| `knowledge_content` | The bytes. Split out: large, and read only in the reader and pipeline. |
| `knowledge_jobs` | The queue. CAS claiming, attempt counter, `run_after` backoff, stale-lock reaper. |
| `knowledge_user_state` | A person's relationship with an object. |

## Content vs user state

Content is stored **once per workspace** and never duplicated per user.
Anything specific to one person lives in `knowledge_user_state`, keyed
`(user_id, object_id)`, created lazily on first interaction so the table
is proportional to engagement rather than library size.

Milestone 1 writes only the two columns it actually uses
(`last_opened_at`, `opened_count`) — no speculative starred/archived/
progress columns. The point is that **the seam exists**, so adding them
later never has to touch `knowledge_objects`.

## Identity and duplicate detection

`UNIQUE (org_id, url_hash)` where `url_hash = sha256(canonical_url)`.
`submitted_url` is preserved verbatim, always.

## Deliberately absent

Embeddings, vector columns, chunks, topics, entities, collections, graph
edges, recommendations, audio, research, agent tables. The shape admits
each later without altering these tables.

---

# 5. INGESTION STATE MACHINE

Two machines, deliberately separate.

```
OBJECT (what the user sees)

     pending ──► fetching ──► extracting ──► completed
        ▲           │             │
        │           ▼             ▼
        │        failed ◄─────────┘
        └───────────┘   explicit retry re-arms a failed object

  fetching/extracting ──► pending   is the reaper recovering a job
                                    whose runner died mid-flight

JOB (what the runner sees)

     pending ──► active ──► completed
        ▲          │
        └──────────┘  retry with backoff, or reaped
                   └──► failed
```

**`RETRYING` was evaluated and rejected as an object state.** Retry is a
property of the *work*, not of the article: it lives on the job as
`attempt` + `run_after`. An object showing "retrying" tells the user
nothing they can act on, and duplicating job state in a second place
creates ambiguity about which is authoritative.

## Preventing duplicate processing — four layers

1. **`UNIQUE (org_id, url_hash)`** — the same URL saved twice is one object.
2. **`UNIQUE (idempotency_key)`** on jobs — one live job per (object, kind).
3. **Compare-and-swap claiming** — `FOR UPDATE SKIP LOCKED` plus a
   `status = 'pending'` predicate. Two runners racing produce exactly
   one winner; the loser gets the next row rather than blocking.
4. **CAS on every status transition** — each stage begins with
   `UPDATE … WHERE status = $expected`. Zero rows means another runner
   already advanced it, and this one exits without doing the work.

## Crash recovery

A runner that dies mid-flight leaves the job `active` with a stale lock.
`reapStaleJobs()` reclaims anything locked longer than 5 minutes: back
to `pending` if attempts remain, terminal `failed` if not — and it
returns the object to `pending` too, so nothing is left stuck in
`fetching`. Reclaimed jobs keep their attempt count, so a job that
repeatedly kills its runner still terminates rather than looping.

**Without the reaper, a single killed process strands an object forever
with no error and no alert.** It is not optional.

---

# 6. SSRF STRATEGY

The system accepts arbitrary internet URLs, so this is the most
security-sensitive module in the product.

The shared guard (`lib/security/ssrf-guard.ts`) already validates
scheme, blocked hostnames, IP literals, and every address a hostname
resolves to. `safe-fetch.ts` closes the four gaps around it:

| Gap | Fix |
|---|---|
| **TOCTOU** | The guard resolves DNS, then `fetch()` resolves **again** — a hostile resolver can answer public, then private. Fixed by **pinning**: resolve once, validate, then force the socket to that exact address via `node:http`'s `lookup` hook while keeping the real `Host` header. DNS is never consulted twice. |
| **Redirects** | Validated **per hop**, max 5. `redirect: "error"` would be safe but breaks shorteners and CDNs, which matters for a save-anything product. |
| **Response size** | 10 MB, enforced from `content-length` **and again while streaming**, because the header may lie. |
| **Content type** | Allowlist: `text/html`, `application/xhtml+xml`, `text/plain`. |

**Range checks are not reimplemented.** Each resolved address is handed
back to the shared guard as an IP-literal URL, so there is exactly one
implementation of "is this address private" in the repository.

**Blocked:** loopback (v4/v6), `10/8`, `172.16/12`, `192.168/16`,
`169.254/16` (including `169.254.169.254`), `0/8`, `::1`, `::`,
`fe80::/10`, `fc00::/7`, IPv4-mapped forms, `localhost`,
`metadata.google.internal`, and every non-http(s) scheme.

**Timeouts:** 10s connect, 30s total.

**Internal content is never surfaced.** Callers get a typed failure code
and a plain-language message — never a body or a header from a blocked
host. Asserted in the test suite.

---

# 7. ASYNC STRATEGY

**Zero new dependencies.** No Redis, no pg-boss, no external queue. The
`knowledge_jobs` table *is* the queue.

Work is driven from two places:

1. **`after()` on the save request.** Next.js keeps the work alive past
   the response, so extraction genuinely happens outside the request the
   user waited on and survives the browser disconnecting.
2. **`POST /api/knowledge/tick`.** A scheduler endpoint for the two
   cases no user request will trigger: retries whose backoff has
   elapsed, and jobs whose runner died.

**This is not a fake async system.** The save response returns before
any fetch begins (asserted by a test that stubs a 10-second fetch and
still sees an immediate response). Work is durable, claimed under
compare-and-swap, retried with real backoff, and reaped when a runner
dies.

**The transport is temporary; the semantics are not.** Swapping in
pg-boss and a worker container later means replacing `runner.ts` — the
pipeline and its guarantees do not change.

## Retry policy

| Failure | Retried? |
|---|---|
| `timeout`, `http_5xx`, `network_error`, `dns_failure`, `extraction_error` | ✔ 3 attempts |
| `blocked_by_ssrf_guard`, `http_4xx`, `unsupported_content_type`, `too_large`, `too_many_redirects`, `invalid_url`, `extraction_empty` | ✘ terminal |

Backoff is 30s / 60s / 120s with ±20% jitter. **Jitter matters even at
this scale:** without it, a publisher that rate-limits us gets a
thundering herd of retries that all land in the same second.

Determinate failures are never retried — retrying burns capacity and
delays the honest failure the user needs to see.

---

# 8. EXTRACTION

Behind a stable `ContentExtractor` interface, so the application never
couples to any one extractor's internals.

| Tier | Implementation | Status |
|---|---|---|
| 1 | graby sidecar (Wallabag's per-domain XPath site-config corpus) | **NOT in Milestone 1** — needs a container |
| 2 | `readability.ts` — content-density heuristic | ✔ |
| 3 | `metadata.ts` — title/excerpt/cover, no body | ✔ |

**What is reused from Wallabag is the knowledge, not the code:** the
metadata precedence chain (site-config → OpenGraph → HTML fallback), and
the behaviour that matters most — a page that cannot be parsed still
produces a saved, visible, retryable entry rather than an empty article.

Tier 2 is honest about being a heuristic. It tracks tag depth (regex
cannot match nested tags), scores candidates by paragraph density, and
penalises link density, because a long block of link text is navigation
whatever its class says.

## Sanitization — on write, never on render

Wallabag renders stored HTML with Twig's `|raw`, no allowlist and no
CSP. We do neither. Sanitising **on write** means nothing unsafe is
ever stored, so a later rendering mistake cannot expose a stored
payload.

Unknown-but-harmless tags are **unwrapped** (text kept, tag dropped)
rather than deleted, so an article inside an unrecognised wrapper does
not come back empty. Outbound links get `noopener noreferrer nofollow`;
images get `referrerpolicy="no-referrer"` so the reader's IP and
referrer never reach the publisher.

## Extracted fields

`canonical_url` · `resolved_url` · `origin_url` (redirect provenance) ·
`title` · `authors[]` · `published_at` · `language` · `site_name` ·
`image_url` · `favicon_url` · `excerpt` · `word_count` ·
`reading_time_seconds` · `content_html` (sanitized) · `content_text` ·
`content_hash` · `extractor` · `http_status`.

`submitted_url` is preserved verbatim. Failures are stored explicitly
with a code and a user-facing message.

---

# 9. API CONTRACTS

All routes: **auth required** (`requireScope()` derives the workspace
from the verified session — never from a body, query or path).
**Cross-tenant ids return 404, never 403**, so another workspace's item
is indistinguishable from one that does not exist.

| Method · Path | Input | Output | Errors | Rate limit |
|---|---|---|---|---|
| `POST /api/knowledge/save` | `{ url }` | `201 {item, duplicate:false}` · `200 {item, duplicate:true}` | 400 invalid url · 401 · 429 | 30/min |
| `GET /api/knowledge/items` | `?limit&cursor` | `{items[], nextCursor}` | 401 | 300/min |
| `GET /api/knowledge/items/:id` | — | `{item}` incl. content | 401 · 404 | 300/min |
| `DELETE /api/knowledge/items/:id` | — | `204` | 401 · 404 | — |
| `POST /api/knowledge/items/:id/retry` | — | `202 {item, rearmed:true}` · `409` if not failed | 401 · 404 · 429 | 10/min |
| `GET /api/knowledge/processing/:id` | — | `{status, failureCode, failureMessage, attempt, maxAttempts, nextAttemptAt}` | 401 · 404 | 300/min |
| `POST /api/knowledge/tick` | — | `{ok, claimed, completed, failed, retrying, reaped}` | 404 if secret wrong · 503 if unset | internal |

**Internal details are not exposed.** DTOs omit `url_hash`,
`content_hash`, `org_id` and the extractor version. Clients get what
they need to render, nothing about how it is stored.

---

# 10. SECURITY CONSIDERATIONS

| Boundary | Control |
|---|---|
| **URL → server** | §6. Pinned IP, per-hop redirect validation, size cap, content-type allowlist, timeouts, audit-logged blocks. |
| **HTML → storage** | Allowlist sanitizer on write. 18-payload XSS corpus in CI. |
| **Storage → render** | Content was sanitized on write, so `dangerouslySetInnerHTML` renders something already proven safe. |
| **Tenant isolation** | Every repository function *requires* an `AccessScope` — omitting it is a compile error, which is why removing `ignoreBuildErrors` was a prerequisite. Cross-tenant reads return nothing, writes are no-ops, and lists never leak. Tested per function. |
| **Session** | Workspace comes from the verified JWT only; `requireSession()` re-verifies membership against the database on every call. |
| **Tick endpoint** | Shared secret, constant-time comparison. **Refuses with 503 when unset** rather than running anonymously — an open cron endpoint that starts outbound fetches is a denial-of-wallet vector. Wrong secret returns 404, not 401, so it is not a probing surface. |
| **Rate limiting** | Knowledge's own scopes on the shared Postgres counter, correct across concurrent serverless instances. |
| **Secrets** | Server-side env only. Never logged, never returned. |
| **Logging** | Ids, domains and counts only — never article content, never a full URL body. |

---

# 11. TESTS

**72 passing.** Zero new dependencies: `node --test` with
`--experimental-strip-types`, plus module-resolution hooks so tests
import application code exactly as Next.js does rather than duplicating
logic. Repository tests run against a **real PostgreSQL**, never a mock
— the thing under test is the SQL predicate itself.

| File | Covers |
|---|---|
| `workforce/repo-scope.test.ts` | the three hardened functions: foreign org is a no-op, owning org still works |
| `knowledge/url.test.ts` | 12 tracking/casing/slash/www variants collapse to one hash; genuinely different URLs stay distinct; bad input rejected |
| `knowledge/ssrf.test.ts` | loopback, private v4/v6, IPv4-mapped, link-local, cloud metadata, bad protocols, redirect-into-private, redirect loops, no content leakage — against **real sockets** |
| `knowledge/extraction.test.ts` | body vs chrome, metadata precedence, metadata-only fallback, implausible dates; **18-payload XSS corpus** |
| `knowledge/state.test.ts` | transition table, terminal states, retry classification, backoff jitter |
| `knowledge/ingestion.test.ts` | end to end on a real DB: transaction, dedupe, success, failure, retry-then-give-up, re-arm, concurrent claiming, reaper, no double-processing, tenant isolation, cursor stability |

**The safety guard:** the test bootstrap always overrides
`DATABASE_URL`, and `prepareDatabase()` refuses any database whose name
does not contain "test" — it drops the schema.

## Results

```
typecheck   0 errors  (strict: true, flag removed)
boundaries  pass
tests       72 / 72
build       pass
```

---

# 12. KNOWN LIMITATIONS

1. **Extraction quality is a heuristic, not the Wallabag corpus.** Tier
   1 (the graby sidecar with per-domain XPath rules) is the thing that
   makes extraction genuinely good on awkward publishers, and it is not
   here. Expect noticeably worse results than Wallabag on sites with
   unusual markup.
2. **No JS-rendered pages.** SPA-rendered articles will produce a
   metadata-only object. Honest, but a real gap.
3. **No raw HTML archive.** Object storage is not in this milestone, so
   re-extraction with better rules is impossible for M1-era objects —
   they can only be re-fetched from their URL.
4. **The runner is bounded by the request/function lifetime.** Fine for
   single saves; unsuitable for bulk import, which is why import is not
   in this milestone.
5. **`GET /api/knowledge/items/:id` records an open.** A prefetch would
   count as a read. Acceptable now; revisit when reading analytics
   matter.
6. **No pagination UI beyond "Load more."**
7. **The success path is tested with a stubbed network hop**, because
   this sandbox has no direct outbound HTTP. The SSRF boundary itself is
   tested against real sockets; extraction, sanitization and persistence
   are real. A live-network test belongs in CI where egress exists.
8. **`images.unoptimized: true` is still set.** Deliberately untouched —
   a separate concern from the type-checking flag, and changing both in
   one PR would conflate two risks.
9. **No CSP header yet.** Sanitization is on write, which is the
   stronger control, but a CSP is defence in depth and should follow.

---

# 13. TEMPORARY MECHANISMS

| Mechanism | Why | Replaced by |
|---|---|---|
| `knowledge_jobs` as the queue | zero new dependencies | pg-boss + a worker container |
| `after()` + tick as the runner | no worker process in M1 | the same worker |
| Node readability as tier 2 | the sidecar needs a container | graby sidecar as tier 1, tier 2 becomes the fallback |
| `--test-concurrency=1` | test files each reset the schema | per-file schemas, if suite time becomes a problem |
| Injectable fetcher in `runIngestJob` | testability without outbound HTTP | stays — production always uses the default |

---

# 14. INTENTIONALLY NOT IMPLEMENTED

AI of any kind · LLM calls · summaries · AI tagging · embeddings ·
semantic search · agents · knowledge graph · audio · research ·
sharing · public collections · import · topics/shelves · collections ·
highlights and notes · starred/archived/reading progress · mobile ·
object storage · the graby sidecar · RLS · CSP · Google OAuth ·
account recovery · full-text search · the Workforce's retirement.

**No AI provider is called anywhere in this milestone.** The only
intelligence is deterministic ingestion and extraction.

---

# 15. ACCEPTANCE CRITERIA

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | User can submit a public URL | ✔ | `POST /api/knowledge/save`, `SaveForm` |
| 2 | URL validated against SSRF | ✔ | `ssrf.test.ts`, 8 cases |
| 3 | Ingestion record created | ✔ | `ingestion.test.ts` "one transaction" |
| 4 | Save returns without waiting | ✔ | `after()`; object returns `pending` |
| 5 | Extraction runs asynchronously | ✔ | runner drains after the response |
| 6 | Success persists content | ✔ | `ingestion.test.ts` |
| 7 | Failure persists failure state | ✔ | `ingestion.test.ts`, code + message |
| 8 | Retry works | ✔ | backoff, ceiling, explicit re-arm |
| 9 | Duplicate processing controlled | ✔ | 4 layers; CAS test |
| 10 | Item visible at `/knowledge` | ✔ | library view |
| 11 | User can open saved content | ✔ | `/knowledge/read/[id]` |
| 12 | User A cannot access user B's content | ✔ | `ingestion.test.ts` isolation |
| 13 | `/library` unchanged | ✔ | `git diff main` empty for those paths |
| 14 | Workforce smoke checks pass | ⚠ **partial** | typecheck + build + `repo-scope.test.ts`. **No runtime smoke suite** — see below. |
| 15 | TypeScript passes | ✔ | 0 errors, `strict: true`, flag removed |
| 16 | Production build passes | ✔ | `next build` exit 0 |
| 17 | No unnecessary dependencies | ✔ | zero added |
| 18 | No AI provider called | ✔ | no LLM import anywhere in `lib/knowledge` |

## Criterion 14 is partial — stated plainly

Phase 5 §15 called for a Workforce runtime smoke suite (login, Studio
renders, create/build/release/run a worker). **That was not built.**

What exists instead: the build compiles every Workforce route with type
checking now switched on, `repo-scope.test.ts` exercises the three
changed functions against a real database, and `git diff main` proves no
other Workforce file changed. That is meaningful coverage of *this*
change, and it is not the same thing as proving the Workforce still
works end to end.

Given that the three modified call sites all pass an `orgId` that was
already in scope, the residual risk is low — but it is non-zero and it
should be closed before this merges, either with the smoke suite or with
a manual pass through Studio.

---

# 16. NEXT RECOMMENDED MILESTONE

**Milestone 2 — the graby extraction sidecar and object storage.**

1. Containerise graby with the site-config corpus behind the existing
   `ContentExtractor` interface (tier 1). This is the single largest
   quality gain available and the interface already exists.
2. Archive raw HTML to object storage, which is what makes
   re-extraction possible at all.
3. Track `siteConfigMatched` rate from day one, so the sidecar's value
   is visible rather than assumed.
4. Add the Workforce smoke suite (criterion 14) and a CSP header.

Import (Milestone 3) needs the worker process, which needs a container —
so the container work in Milestone 2 unblocks it.
