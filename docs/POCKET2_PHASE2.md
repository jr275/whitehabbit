# Pocket2.io — Phase 2: save + metadata ingestion

Phase 2 of the plan in [`POCKET2_ARCHITECTURE_AUDIT.md`](./POCKET2_ARCHITECTURE_AUDIT.md), built on
[Phase 1](./POCKET2_PHASE1.md). Verified against a live PostgreSQL database, a production build,
and a real end-to-end save of a public URL.

## The save path

```
POST /api/pocket2/items          ── synchronous, no network I/O ──
  validate scheme + shape → canonicalize → sha256 → dedupe on
  (org_id, url_hash) → INSERT (ingest_status='pending') → enqueue job
  → respond with the card                                    ~ms

next/server after()              ── once the response is sent ──
  runIngestTick(1)                     an accelerator, not the mechanism

POST /api/pocket2/jobs/tick      ── Vercel Cron, every 2 minutes ──
  claim (FOR UPDATE SKIP LOCKED) → robots.txt → guarded fetch
  → metadata → classify → extract → sanitize → segment
  → suggest tags → persist (one transaction)
```

The person pasting a link never waits on someone else's web server. They get a real row back
immediately, honestly marked as still fetching, and it fills in underneath.

## Security

URL ingestion is the subsystem where the server makes HTTP requests to addresses strangers chose.

**SSRF.** Every hop goes through the existing `assertSafeUrl()`, which resolves DNS and inspects
the **resolved** address. Redirects are followed **manually** (`redirect: "manual"`, max 5) and
re-validated at each hop — `redirect: "follow"` would let a public URL bounce to `10.0.0.5`
unchecked, and `redirect: "error"` is too blunt for the real web. Refusal messages never echo the
internal address. Covered by 11 tests including loopback, IPv6 loopback, cloud metadata
(`169.254.169.254`), all three RFC-1918 ranges, and non-http schemes.

**Known residual risk, recorded not hidden:** a TOCTOU window exists between DNS resolution and
the socket connecting. Closing it fully needs dialing the validated IP with a carried Host header,
which undici does not portably expose here.

**Stored XSS.** Extracted HTML is sanitized on **write** against a strict tag/attribute allowlist —
`allowedStyles: {}`, schemes limited to http/https/mailto, `nonTextTags` so a stripped `<script>`
cannot leave its source as visible text. 18 XSS payloads are covered by test.

**Resource exhaustion.** Content-type allowlist, 5 MB cap enforced **while streaming** (a
`Content-Length` from a stranger is a hint, not a guarantee), 20s deadline across the whole
redirect chain.

**The tick endpoint** authenticates with a constant-time bearer comparison and, if
`POCKET2_CRON_SECRET` is unset, **refuses every request rather than defaulting to open** — an
unauthenticated route that makes the server fetch arbitrary URLs is what must never be left
ungated. It answers `404`, not `401`, so it does not confirm it exists.

## Access controls are answers, not obstacles

Pocket2 does not route around anything:

| Signal | Response |
|---|---|
| `robots.txt` disallow | **Asked before fetching.** Not fetched at all; link + user-visible metadata only. |
| `X-Robots-Tag: noarchive` / `<meta name="robots" content="noarchive">` | Metadata saved; **no stored copy** of the body. |
| 401 / 403 | `login_required` — recorded and explained. |
| 402 / subscription gate in the body | `paywalled` — the teaser is **not** stored as if it were the article. |
| 451 | `robots_disallowed`. |

The robots parser implements the parts that actually decide this — agent grouping, longest-match
with Allow winning ties, `*`/`$` wildcards — and treats an absent robots.txt as permission (the
standard's own default) but a 5xx as unknown, which retries rather than assuming consent.

The fetcher identifies itself honestly as `Pocket2Bot/1.0` and never impersonates a browser.

## Never claiming extraction that did not happen

`ingest_status` and `reader_status` are separate columns, and a failure records a real
`failure_reason` from the product's own vocabulary. A paywalled page produces a **complete saved
item** with real metadata and `reader_status='not_available'` — the save is never lost, only the
body is absent, and the UI says which.

Extraction uses **@mozilla/readability** (MPL-2.0, the algorithm behind Firefox Reader View —
not Pocket's proprietary code). Below 400 characters, or when a gate phrase appears in the
opening, it returns a typed failure rather than a thin misleading success.

## Notable implementation decisions

- **Idempotency is the database's job.** `ON CONFLICT DO NOTHING` on `(org_id, url_hash)`. A
  read-then-write check would let two devices saving the same link both pass. Tested with 5
  concurrent saves → exactly one row.
- **`FOR UPDATE SKIP LOCKED`** for job claims, so concurrent ticks take disjoint work; an expired
  lease is reclaimed, so a worker killed mid-flight strands nothing. Both tested.
- **Retryable vs. permanent** is explicit per failure reason. A blocked address or unsupported
  content type is never retried — repeatedly asking a server that already answered is what a
  well-behaved fetcher must not do.
- **Curated vs. derived metadata.** OpenGraph values are authoritative; Readability's own title,
  byline and excerpt are passed separately as fallbacks applied only where a column is empty.
  Found by a test: a re-ingest was silently downgrading a good `og:description` to a generic
  first paragraph.
- **A fetcher seam** (`PageFetcher`) lets a headless-browser fetcher be added later for
  JS-rendered pages, and lets the pipeline be tested end to end against fixtures.
- **Segments are written with `unnest()`** — one statement for an article of any length.

## Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | 0 errors |
| `pnpm test` | **142 passed** (was 57) |
| `pnpm build` | succeeds; all Pocket2 routes emitted |
| Real end-to-end save of a public URL | fetched, real OG title + description extracted, classified `article`, auto-tagged `#code`, card filled in without a page reload |
| Duplicate with different spelling (`www.`, `utm_source`) | recognised, not re-saved |
| `javascript:` URL | rejected with the real reason |
| Tick endpoint, no/bad token | 404 |
| Save endpoint, no session | 401 |

## Fixed during Phase 2

- **`rel="noopener"` was being stripped from every article link.** `transformTags` added it, but
  `allowedAttributes.a` did not list it, so sanitize-html removed it again immediately — handing
  `window.opener` to every destination. Found by test.
- **A sign-in wall was reported as a paywall** — the paywall pattern's bare "to continue reading"
  swallowed "Sign in to continue reading". Login patterns are now tested first.
- **The save dialog's close button** was `position: absolute` with no positioned ancestor, so it
  anchored to the viewport and intercepted clicks across the page. Found by the browser driver.
- **Failed third-party cover images** showed the browser's broken-image glyph inside our card.
  They now degrade to the same neutral placeholder an item with no image gets.
- **Audit item #9**: `pruneExpiredRateLimits()` was defined but never called, so
  `rate_limit_counters` grew without bound. The idle tick now calls it.

## Deferred to later phases, deliberately

Cards in grid/list/compact, filter chips, the ⌘K palette and sort controls are Phase 3; the Reader
is Phase 4. The library lists what is genuinely in the database with each item's real ingestion
state — it is not a mock of the grid that is coming.

## Configuration

```bash
POCKET2_CRON_SECRET="$(openssl rand -base64 32)"   # required for the tick endpoint
```

`vercel.json` schedules `/api/pocket2/jobs/tick` every two minutes. Locally, drain the queue with:

```bash
curl -X POST -H "Authorization: Bearer $POCKET2_CRON_SECRET" \
  http://localhost:3000/api/pocket2/jobs/tick
```
