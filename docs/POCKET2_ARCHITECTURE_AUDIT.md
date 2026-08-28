# Pocket2.io — Repository Audit & Phased Implementation Plan

Audit of `jr275/whitehabbit` @ `3e11bc9`, performed before any Pocket2.io code is written.
No architectural claim below is assumed — each is traced to a file in this repository.

---

## A. Current architecture

**This repository is not an empty shell, and it is not a bookmarking product.**
It is a working, production-oriented **AI agent factory** ("Menlo Whitehabbit", `app/layout.tsx`)
generated originally by v0 and then substantially hardened by hand. Pocket2.io is a
*new product* that will be built on this codebase's **chassis**, not an evolution of its
domain model.

| Layer | What is actually there |
|---|---|
| Framework | **Next.js 16.3.0**, App Router, React 19, TypeScript 5.7 (`strict: true`) |
| Package manager | pnpm (`pnpm-lock.yaml`), Node ≥ 22.5 |
| Database | **PostgreSQL** via `pg` connection pool — `lib/db/client.ts`. No ORM: raw parameterized SQL throughout `lib/db/repo.ts` (692 lines). Real `withTransaction()` helper. |
| Migrations | `migrations/*.sql` + `scripts/migrate.mjs` — filename-ordered, tracked in `_migrations`, transactional per file, idempotent rerun. `pnpm migrate`. |
| Auth | **Auth.js v5** (`next-auth@5.0.0-beta.32`), Credentials provider, `bcryptjs` hashing, **JWT sessions**. Split into `lib/auth.config.ts` (edge-safe, no DB) and `lib/auth.ts` (Node runtime, DB-backed). |
| Tenancy | `organizations` + `memberships(user_id, org_id, role)` tables. `lib/session.ts::requireSession()` is the single org-context entry point. |
| Route protection | `middleware.ts` — **UX convenience only**, explicitly documented as *not* the security boundary. Matcher covers `/studio` and `/outputs` only. |
| API | Route Handlers under `app/api/**`. Every handler wraps its body in `withApiHandler()` (`lib/api-error.ts`). |
| Styling | **Tailwind v4** CSS-first (`@theme inline` in `app/globals.css`), oklch token system, `--radius` scale, `prefers-reduced-motion` handling. |
| Components | `shadcn` style `base-nova` over **`@base-ui/react`** (not Radix). `components.json` configured. Only **two** primitives exist: `ui/button.tsx`, `ui/chart.tsx`. ~90 bespoke feature components. |
| Icons / motion | `lucide-react`, `framer-motion` |
| Observability | `lib/observability/logger.ts` — structured single-line JSON to stdout, `requestId` correlation. `audit_log` table + `recordAudit()`. |
| Deployment | Vercel (`@vercel/analytics`, `VERCEL_ENV` checks in `lib/runtime-mode.ts`), Neon-style Postgres |

### Existing data model (`migrations/0001_init.sql`)
`organizations`, `users`, `memberships`, `workers`, `worker_versions`, `tasks`,
`executions`, `execution_events`, `outputs`, `business_events`, `metrics`,
`rate_limit_counters`, `audit_log`.

Conventions worth inheriting verbatim:
- **Prefixed TEXT ids** (`worker_…`, `exec_…`) rather than bare UUIDs.
- **`BIGINT` epoch-milliseconds** for all timestamps — matches the TS `number` model with zero conversion code.
- **Hybrid relational + `JSONB`**: relational columns for anything queried/filtered/authorized on; `JSONB` for still-evolving document shapes.
- `org_id` denormalized onto **every** tenant-owned table, including child tables.

---

## B. Existing reusable infrastructure

These are genuinely good and must be **reused, not reimplemented**:

1. **`lib/db/client.ts`** — pooled Postgres, global singleton across warm lambdas, `query`/`queryOne`/`withTransaction`. Fails loudly (`DatabaseNotConfiguredError`) rather than falling back to a fake store.
2. **`scripts/migrate.mjs`** — Pocket2's schema ships as `migrations/0002_pocket2.sql`; the runner needs no change.
3. **`lib/session.ts::requireSession()`** — org id comes only from the verified session and is **re-checked against real `memberships` rows on every request**. A tampered cookie cannot grant access.
4. **`lib/api-error.ts::withApiHandler()`** — typed error → HTTP mapping. Notably **`UnauthorizedOrgError` → 404, not 403**, so another tenant's resource is indistinguishable from a nonexistent one. Correct anti-enumeration behaviour, already done.
5. **`lib/security/ssrf-guard.ts`** — this is the single most valuable asset for Pocket2. It already blocks non-http(s) schemes, loopback, link-local (incl. `169.254.169.254`), private ranges, IPv4-mapped IPv6, and — critically — **resolves DNS and checks the resolved addresses**, defeating rebinding. Pocket2's ingestion pipeline is exactly the subsystem this was written for.
6. **`lib/rate-limit.ts` + `rate_limit_counters`** — Postgres-backed fixed-window limiter, correct across concurrent serverless instances. Pocket2 adds `save_item`, `ingest_retry`, `tts_generate` scopes.
7. **`lib/observability/logger.ts`** + `recordAudit()`.
8. **`lib/agent/tools/llm-providers/types.ts`** — the `LlmProvider` interface is a well-executed provider-abstraction seam (`id` / `displayName` / `isConfigured()` / `notConfiguredReason()` / `call()`, server-side selection via env var, never leaking keys to the browser). **`TextToSpeechProvider` should be modelled on this file exactly** — same shape, same honesty rules ("never fabricate a completion").
9. **Design tokens in `app/globals.css`** — the `@theme inline` mapping and oklch approach are the right foundation; the *values* get replaced (see §I and debt item 8).
10. **`components/ui/button.tsx`** — the only primitive worth keeping as-is.

---

## C. What should be preserved

- The entire `lib/db`, `lib/session`, `lib/api-error`, `lib/rate-limit`, `lib/observability`, `lib/security` stack.
- The auth stack (`lib/auth.ts`, `lib/auth.config.ts`, `lib/auth-password.ts`, `app/api/auth/**`) — extended, not replaced.
- Migration tooling and SQL conventions (prefixed ids, BIGINT ms, `org_id` everywhere, hybrid JSONB).
- The `LlmProvider` abstraction pattern.
- Tailwind v4 + `@base-ui/react` + `components.json` toolchain.
- `withApiHandler` error contract, including 404-for-cross-tenant.

## C-bis. What should be retired (not carried into Pocket2)

- `lib/db/schema.ts` — a **dead SQLite schema**, superseded by `migrations/0001_init.sql`. Two schema definitions in one repo is an active hazard.
- `lib/workforce-demo/**` (5 files, 363-line store) — demo-only data still imported by 6 components.
- The agent-factory domain (`lib/agent/**`, `lib/worker/**`, `lib/character/**`, `lib/workforce/**`) is orthogonal to Pocket2. **Recommendation: leave it in place and untouched for now**, and namespace Pocket2 cleanly beside it, rather than deleting a working product mid-flight. Retirement is a decision for you, not a side effect of my work.

---

## D. What needs to be created

Nothing in this repository saves a URL, fetches metadata, extracts an article, renders a reader, or plays audio. Everything in the Pocket2 product surface is new:

- **Schema**: `migrations/0002_pocket2.sql` (see §E).
- **Ingestion pipeline** (§G) — the largest new backend subsystem.
- **Reader document model** — sanitized, segmented, stored separately from metadata.
- **TTS subsystem** — `TextToSpeechProvider` + async job lifecycle + audio asset storage.
- **Search layer** — Postgres FTS with a deliberate seam for a future external engine.
- **Pocket2 design system** — light **and** dark, editorial typography, the full primitive set (currently only Button exists).
- **All 18 required screens**, plus the card system in three density modes.
- **Test infrastructure** — there is currently **none** (0 test files, no runner).

---

## E. Recommended database model

`migrations/0002_pocket2.sql`. Follows every existing convention. `org_id` on every row.

**Reuse as-is:** `organizations`, `users`, `memberships` (roles extend to `owner | admin | member`), `rate_limit_counters`, `audit_log`.

```
saved_items                     -- the core entity
  id TEXT PK ("item_…")
  org_id TEXT NOT NULL REFERENCES organizations(id)
  created_by TEXT REFERENCES users(id)
  url TEXT NOT NULL                    -- exactly what the user submitted
  canonical_url TEXT NOT NULL          -- normalized: scheme/host lowercased,
                                       -- default port, tracking params stripped,
                                       -- fragment dropped, trailing slash rules
  url_hash TEXT NOT NULL               -- sha256(canonical_url) — the dedupe key
  domain TEXT NOT NULL
  title TEXT
  description TEXT
  author TEXT
  content_type TEXT NOT NULL DEFAULT 'unknown'
      -- article|video|news|blog_post|document|product|social_post|website|podcast|other|unknown
  image_url TEXT
  favicon_url TEXT
  published_at BIGINT
  saved_at BIGINT NOT NULL
  word_count INTEGER
  reading_time_seconds INTEGER
  ingest_status TEXT NOT NULL DEFAULT 'pending'   -- pending|processing|ready|failed
  ingest_error TEXT
  ingest_attempts INTEGER NOT NULL DEFAULT 0
  reader_status TEXT NOT NULL DEFAULT 'not_available' -- not_available|available|failed
  metadata JSONB NOT NULL DEFAULT '{}'  -- raw OG/oEmbed/JSON-LD, never trusted for render
  search_vector tsvector                -- GENERATED, see below
  created_at BIGINT NOT NULL
  updated_at BIGINT NOT NULL
  UNIQUE (org_id, url_hash)             -- ← idempotent save, enforced in the DB
```

> **Why `UNIQUE (org_id, url_hash)` and not `(created_by, url_hash)`**: tenancy is the
> isolation boundary everywhere else in this codebase; scoping dedupe to the org keeps
> a future team library coherent. Personal-library semantics remain available by adding
> `created_by` to the constraint later — the reverse (widening a unique index) is harder.

```
saved_item_states               -- per-user state; separate so a shared/team item
  (item_id, user_id, org_id)    -- can have per-member read/favorite state
  status TEXT NOT NULL          -- unread|read|archived
  is_favorite BOOLEAN
  read_at, archived_at, favorited_at BIGINT
  reading_progress REAL         -- 0..1
  reading_position TEXT         -- segment id — the semantic anchor, not a pixel offset
  listening_position_ms INTEGER
  listening_segment_id TEXT
  playback_speed REAL DEFAULT 1.0
  listen_completed BOOLEAN
  PRIMARY KEY (item_id, user_id)

reader_documents                -- the extracted, SANITIZED representation
  id, item_id UNIQUE, org_id
  extraction_status TEXT        -- ok|partial|failed
  extractor_version TEXT        -- so a pipeline improvement can re-run deterministically
  hero_image_url TEXT
  html TEXT                     -- sanitized; allowlist of tags/attrs only
  text TEXT                     -- plain text, for search + TTS
  language TEXT
  word_count INTEGER
  extracted_at BIGINT

reader_segments                 -- ★ the read↔listen sync seam
  id, document_id, org_id
  ordinal INTEGER               -- stable order
  kind TEXT                     -- paragraph|heading|list_item|quote|caption|code
  text TEXT NOT NULL
  char_start, char_end INTEGER
  UNIQUE (document_id, ordinal)

audio_assets                    -- generated audio, stored SEPARATELY from the article
  id, item_id, document_id, org_id
  status TEXT      -- not_requested|queued|processing|ready|failed
  provider TEXT, voice TEXT, format TEXT
  duration_ms INTEGER, url TEXT, bytes INTEGER
  error TEXT, requested_by, requested_at, completed_at

audio_segment_marks             -- segment_id → start_ms/end_ms
                                -- (populated when a provider returns timings;
                                --  empty is fine — the table's existence is what
                                --  makes sentence-level highlighting possible later)

collections     (id, org_id, created_by, name, slug, description, color, icon,
                 item_count, created_at, updated_at; UNIQUE(org_id, slug))
collection_items(collection_id, item_id, org_id, added_at, position; PK both)
tags            (id, org_id, name, slug, usage_count; UNIQUE(org_id, slug))
saved_item_tags (item_id, tag_id, org_id, source TEXT /* user|auto */; PK both)
ingest_jobs     (id, item_id, org_id, kind /* metadata|extract|tts|reindex */,
                 status, attempts, next_attempt_at, last_error, payload JSONB,
                 locked_by, locked_until, created_at, updated_at)
item_events     (id, org_id, item_id, user_id, type, payload JSONB, occurred_at)
```

**Indexes** (planning for millions of rows):
```sql
-- the library's default query: org + status + recency, keyset-paginated
CREATE INDEX idx_items_org_saved    ON saved_items(org_id, saved_at DESC, id DESC);
CREATE INDEX idx_items_org_domain   ON saved_items(org_id, domain);
CREATE INDEX idx_items_org_type     ON saved_items(org_id, content_type);
CREATE INDEX idx_items_ingest       ON saved_items(ingest_status) WHERE ingest_status IN ('pending','processing');
CREATE INDEX idx_states_user_status ON saved_item_states(user_id, status, item_id);
CREATE INDEX idx_states_user_fav    ON saved_item_states(user_id) WHERE is_favorite;
CREATE INDEX idx_items_search       ON saved_items USING GIN (search_vector);
CREATE INDEX idx_tags_item          ON saved_item_tags(item_id);
CREATE INDEX idx_jobs_claim         ON ingest_jobs(status, next_attempt_at) WHERE status = 'queued';
```

**Search vector** — a generated column over weighted fields:
`setweight(title,'A') || setweight(description,'B') || setweight(domain||author,'C')`,
with the reader body indexed as a `D`-weighted column on `reader_documents`.
Full-text lives behind `lib/pocket2/search/` so swapping in Typesense/Meili/pgvector
later touches one module, not the API surface.

**Cursor pagination**, never `OFFSET`: keyset on `(saved_at, id)`.

---

## F. Recommended API architecture

Route Handlers under `app/api/pocket2/**`, every one wrapped in the **existing**
`withApiHandler` + `requireSession` pair. Server Components read through the same
repository functions directly — no internal HTTP hop.

```
POST   /api/pocket2/items                 save (idempotent by org_id+url_hash)
GET    /api/pocket2/items                 list: cursor + filters + sort
GET    /api/pocket2/items/:id             detail
PATCH  /api/pocket2/items/:id             title, tags, status, favorite, archive
DELETE /api/pocket2/items/:id
POST   /api/pocket2/items/:id/reingest    recover a failed ingest
GET    /api/pocket2/items/:id/reader      sanitized reader document + segments
PATCH  /api/pocket2/items/:id/progress    reading/listening position (debounced)
POST   /api/pocket2/items/:id/audio       request TTS  → 202 + job status
GET    /api/pocket2/items/:id/audio       audio asset status/url
GET    /api/pocket2/search                q + filters (instant search)
GET    /api/pocket2/suggest               search suggestions
CRUD   /api/pocket2/collections[/:id]
CRUD   /api/pocket2/tags[/:id]
GET    /api/pocket2/facets                counts for type/domain/tag/status
POST   /api/pocket2/jobs/tick             worker tick (secret-protected / cron)
```

**Layering** — business logic never lives in a route handler or a component:
```
app/api/pocket2/**       thin: parse → validate → call service → NextResponse
lib/pocket2/services/**  business logic, always takes an explicit TenantContext
lib/pocket2/repo/**      parameterized SQL; every function's first arg is orgId
lib/pocket2/domain/**    pure types + zod-style validators, no I/O
```

**Save response contract** (drives the §9 UX):
```ts
{ item, duplicate: boolean, ingest: { status: 'pending'|'ready', jobId } }
```
`duplicate: true` returns the **existing** item with 200 — the client shows
"Already in your library — Open / Re-fetch", never a silent second row.

Validation: a small typed validator module rather than adding a runtime schema
dependency, unless you'd prefer `zod` — that's a one-line decision I'll defer to you.

---

## G. Recommended ingestion architecture

The UI must **never** wait on a scrape. The save request does only trusted-local work:

```
POST /api/pocket2/items   ── synchronous, <50ms ──────────────────────────────
  1. validate scheme + shape          (reject non-http(s) immediately)
  2. canonicalize + url_hash
  3. dedupe lookup on (org_id, url_hash) → early return if found
  4. INSERT saved_items (ingest_status='pending', title = pretty URL fallback)
  5. INSERT ingest_jobs (kind='metadata')
  6. return the card immediately  ← user sees a real row, honestly marked pending

Background worker (POST /api/pocket2/jobs/tick, driven by cron; the same
handler is directly invokable so local dev needs no extra process) ────────
  claim job  (UPDATE … SET locked_by, locked_until WHERE status='queued'
              AND next_attempt_at <= now() … FOR UPDATE SKIP LOCKED)
   ↓ assertSafeUrl()                      ← lib/security/ssrf-guard.ts, unchanged
   ↓ fetch: redirect:'manual', re-guard EVERY hop, ≤5 hops
   ↓ enforce Content-Type allowlist + byte cap (streamed, ~5 MB hard stop)
   ↓ metadata extract (OG → twitter → JSON-LD → <title>/<meta>)
   ↓ classify content_type
   ↓ article extraction  → reader_documents + reader_segments
   ↓ sanitize HTML (allowlist: no <script>/<style>/<iframe>/on*/javascript:;
                    force target=_blank rel="noopener noreferrer nofollow")
   ↓ tag suggestion (deterministic v1: domain + keyword heuristics; the AI path
                     in Phase 7 replaces this one function)
   ↓ persist + ingest_status='ready'  |  on failure: attempts++, exponential
                                          backoff, status='failed' after N,
                                          reader_status='not_available'
```

Non-negotiables baked in from day one:
- **Never claim extraction succeeded when it didn't.** A failed extract yields a real
  card with `reader_status='not_available'` and an "Open original" affordance. No fake body text.
- **Never bypass access controls.** Paywalls, auth walls, `robots.txt` disallow, and
  explicit `X-Robots-Tag: noarchive` are treated as *"metadata only, open original"* —
  not as obstacles to route around. A declining path is a first-class, designed outcome.
- **Attribution is structural, not decorative.** Every reader view carries source domain,
  author, publication date and a live link to the original.
- Redirect chains are re-validated at each hop (a single `redirect:'error'` is too blunt
  for real-world publisher URLs, and following blindly re-opens SSRF).

---

## H. Multi-tenant security model

The existing model is sound; Pocket2 extends it rather than inventing a parallel one.

1. **Server-side only.** `organizationId` is derived from `requireSession()`. No route,
   service, or repo function ever accepts an org id from the client body, query, or header.
2. **Every repo function takes `orgId` as a mandatory first parameter**, and every SQL
   statement carries `WHERE org_id = $1` — including updates and deletes. This is enforced
   by construction: the repo layer exposes no un-scoped query.
3. **404, never 403**, for cross-tenant reads — the existing `withApiHandler` already does this.
4. **Composite FK integrity**: child tables carry `org_id` and are constrained
   `FOREIGN KEY (item_id, org_id) REFERENCES saved_items(id, org_id)`, so a
   cross-tenant join is impossible even if a service layer forgets a predicate.
5. **Roles**: `owner | admin | member` on `memberships`, checked in a single
   `requireRole()` helper. V1 grants all three the same item permissions;
   the check sites exist from day one so team features are additive.
6. **Reader HTML is untrusted third-party content.** Sanitized on **write** (server, at
   ingest) *and* rendered under a restrictive policy. The reader route is served from a
   path with its own CSP; no inline scripts, images proxied or `referrerpolicy`-stripped.
7. **Audio assets** are org-scoped and served through an authorizing handler or
   short-lived signed URL — never a guessable public path.
8. **Ingestion is treated as hostile input end to end**: SSRF guard, scheme allowlist,
   per-hop redirect validation, content-type allowlist, size cap, timeout, and no
   trust in any metadata field for rendering.
9. Tenant isolation gets **explicit automated tests** (§20) — tenant A must not read,
   write, enumerate, or infer the existence of tenant B's items.

---

## I. Design system strategy

**Direction:** premium, calm, editorial. Content is the interface; chrome recedes.
Original throughout — the references inform *principles* (density, hierarchy,
card rhythm, restraint), never marks, palettes, or layouts.

- **A new token layer**, `app/pocket2.css`, scoped under a `data-product="pocket2"` root
  so it cannot collide with the existing agent-factory tokens (which are dark-only and
  internally inconsistent — see debt item 8). **Light-first**, with a genuine dark mode
  as a peer, both defined as complete palettes.
- **Palette**: a near-neutral paper/ink foundation (warm-neutral light, cool-neutral dark)
  with **one** restrained accent used only for primary action and active state. Content-type
  is signalled by a small typographic label, not by seven competing colours.
- **Typography**: two families — a geometric-humanist sans for UI, a true reading serif for
  the Reader body. Modular scale, ~66–72 characters measure, 1.6–1.75 line height in the
  reader, tabular numerals for metadata.
- **Spacing**: 4px base, 8px rhythm, generous card padding. Density is achieved by
  *removing* borders and shadows, not by tightening leading.
- **Elevation**: essentially flat. Hairline borders at ~8% contrast; one soft shadow
  reserved for genuinely floating surfaces (modal, mini-player, command palette).
- **Primitives to build** (only Button exists today): Input, Textarea, Select, Checkbox,
  Switch, Dialog, Popover, DropdownMenu, Tooltip, Tabs, Badge/Tag, Avatar, Skeleton,
  Toast, ScrollArea, Command palette, Progress, Slider, EmptyState. All on
  `@base-ui/react`, matching `ui/button.tsx`'s CVA conventions.
- **Card system**: one `ItemCard` component, three density modes (grid / list / compact)
  driven by a `density` prop and container queries — not three duplicated components.
- **Motion**: 120–200ms, ease-out, opacity+transform only. The existing
  `prefers-reduced-motion` block already covers the accessibility case.
- **Accessibility as a gate, not a pass**: visible focus rings on every interactive
  element, full keyboard paths (⌘K search, `s` save, `j/k` navigate, `e` archive),
  AA contrast minimum, correct roles/labels on cards and the player.

---

## J. Implementation phases

| Phase | Scope | Key deliverables |
|---|---|---|
| **1** | Foundation, data model, auth, tenancy | `migrations/0002_pocket2.sql`; `lib/pocket2/{domain,repo,services}`; `requireRole()`; Pocket2 token layer + app shell + core primitives; landing/login/signup wired to the **existing** auth stack; tenant-isolation tests |
| **2** | Save + ingestion | Save endpoint (idempotent) + modal; `ingest_jobs` + worker tick; SSRF-guarded fetch with per-hop redirect checks; metadata extraction; classification; sanitized article extraction; failure/retry UX |
| **3** | Library, cards, search, filters | `ItemCard` ×3 densities; cursor-paginated library; ⌘K search over Postgres FTS behind a swappable seam; combinable filters + facet counts; empty/loading/error states |
| **4** | Reader | Reader route + typography; segments; progress persistence; hero/attribution/open-original; graceful non-extractable fallback |
| **5** | Collections + tags | Full CRUD, many-to-many assignment, collection detail, tag index, bulk actions |
| **6** | Listen, polish, hardening | `TextToSpeechProvider` abstraction + async lifecycle; mini-player + full player; speed/position memory; perf pass (lazy images, virtualization, cache); security review; test suite |
| **7** | AI capabilities | Auto-tagging, summaries, semantic search, related content, duplicate detection — each replacing one already-isolated function |

Ordering note: **Listen sits in Phase 6**, not Phase 4 — its *data model* (`reader_segments`,
`audio_assets`, `audio_segment_marks`) lands in Phase 1 so nothing later requires a
migration rewrite, but building the player before the reader is real would be premature.

---

## K. Risks

1. **Article extraction quality is the product's credibility.** Real-world HTML is hostile.
   Mitigation: a versioned extractor (`extractor_version`) so improvements can re-run,
   and an honest `reader_status` that never fakes success.
2. **Copyright and access control.** Storing extracted publisher content has real limits.
   Mitigation: metadata / extracted-representation / user-notes / generated-audio /
   original-URL are **separate** entities; extraction respects paywalls, auth, and robots
   directives; attribution and an original link are always present; Pocket2 never presents
   itself as the publisher.
3. **SSRF via redirects.** The existing guard checks the initial URL; publishers redirect
   constantly. Mitigation: `redirect:'manual'` + re-guard every hop, capped.
4. **Stored XSS through reader HTML.** The single highest-severity risk in this product.
   Mitigation: strict allowlist sanitization at ingest, defence-in-depth CSP at render,
   and explicit malicious-HTML tests.
5. **TTS cost and latency.** Mitigation: server-side provider config, explicit
   user-initiated generation, `NOT_REQUESTED → QUEUED → PROCESSING → READY → FAILED`
   lifecycle, cached assets, per-org rate limits.
6. **Serverless background jobs.** Vercel has no long-running worker. Mitigation: short,
   idempotent, `SKIP LOCKED`-claimed job ticks driven by cron; the design ports to a real
   queue without schema change.
7. **Search outgrowing Postgres FTS.** Mitigation: the search module boundary, from day one.
8. **Two products in one repository.** Namespace collisions and reviewer confusion.
   Mitigation: `/api/pocket2/**`, `lib/pocket2/**`, scoped tokens — and an explicit
   decision from you on the agent-factory code's future.
9. **`next-auth` is a 5.x beta** on a Next.js version whose APIs may differ from
   general knowledge. Mitigation: verify against `node_modules/next/dist/docs/` (per
   `AGENTS.md`) once dependencies are installed — see debt item 4.

---

## L. Technical debt discovered

| # | Finding | Severity | Recommendation |
|---|---|---|---|
| 1 | **`next.config.mjs` sets `typescript.ignoreBuildErrors: true`** — type errors do not fail the build. Directly contradicts the type-safety requirement. | **High** | Turn off for Pocket2 code at minimum; ideally repo-wide once existing errors are cleared. |
| 2 | **Zero tests, no test runner.** 0 test files; no vitest/jest/playwright in `package.json`. | **High** | Add Vitest (unit/integration) in Phase 1. Tenant isolation must be tested before it is trusted. |
| 3 | **`images.unoptimized: true`** — every image ships unoptimized. Pocket2 is an image-dense card grid. | **High** | Re-enable optimization with a remote-pattern allowlist, or proxy OG images through a sizing route. |
| 4 | **`node_modules` is absent in this container**, so `node_modules/next/dist/docs/` — which `AGENTS.md` requires reading before writing code — could not be consulted. | **High** | `pnpm install` as the first action of Phase 1, then read the Next 16 guides before writing app code. |
| 5 | **Two competing schema definitions**: `lib/db/schema.ts` (dead SQLite DDL) vs `migrations/0001_init.sql` (live Postgres). | Medium | Delete `lib/db/schema.ts`. |
| 6 | **~1,560 lines across four parallel client state stores** (`lib/workforce/store.ts` 609, `lib/character/character-store.ts` 371, `lib/workforce-demo/store.ts` 363, `lib/library/draft-store.ts` 217), each hand-rolling `useSyncExternalStore`. | Medium | Do not extend the pattern. Pocket2 uses server components + URL state + one small client store. |
| 7 | **Route namespace collision**: `app/library/` already exists (AI-worker prefabs). Pocket2's library is the product's primary surface. | Medium | Mount Pocket2 under its own segment and decide the old route's fate explicitly. |
| 8 | **The design token system is internally contradictory.** `:root` defines a signature blue-cast dark palette, but `@media (prefers-color-scheme: dark) :root:not(.light)` overrides it with a plain neutral grayscale — so the brand palette only renders for users whose OS is in **light** mode, and `.dark` defines a third, different palette. There is no working light theme at all. | Medium | Do not build on these tokens. Pocket2 ships its own complete, coherent light+dark scope. |
| 9 | **`pruneExpiredRateLimits()` is defined but never called** (`lib/db/repo.ts:680`) — `rate_limit_counters` grows without bound. | Medium | Call it from the job tick added in Phase 2. |
| 10 | **No ESLint, no Prettier, no formatting config** anywhere in the repo. | Medium | Add both in Phase 1; a shared style matters more once two products share a tree. |
| 11 | **`middleware.ts` matcher covers only `/studio` and `/outputs`.** | Low (by design) | Extend the matcher for Pocket2 routes. Note the file itself correctly documents that it is *not* the security boundary — API-layer checks remain mandatory. |
| 12 | **Stale product identity**: `app/layout.tsx` metadata still reads "Menlo Whitehabbit — AI Agent Factory", `generator: 'v0.app'`, hardcoded dark `viewport.colorScheme`. | Low | Per-route metadata for Pocket2; drop the forced dark color-scheme. |
| 13 | **4 uses of `: any`** across `lib`/`app`/`components`. | Low | Contained; no new ones in Pocket2 code. |
| 14 | **`lib/workforce-demo/**` (demo-only data) is imported by 6 live components.** | Low | Flag for the agent-factory product's owner; out of Pocket2's scope. |

---

## Open decisions for you (not blocking Phase 1)

1. **The agent-factory product's future** — coexist indefinitely, or plan its retirement?
   My recommendation is coexist-and-namespace for now; deleting a working product is your call, not mine.
2. **Dedupe scope** — per-organization (my recommendation, above) or per-user?
3. **Runtime validation** — add `zod`, or a small hand-rolled typed validator (fewer dependencies)?
4. **TTS provider** for the first real implementation — the browser SpeechSynthesis
   fallback needs no key and can ship in Phase 6; a neural provider needs a credential you'd supply.

None of these block Phase 1: the schema, tenancy, auth, and design system are unaffected by all four.
