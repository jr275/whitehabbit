# Pocket2.io — Phase 2 Security Checkpoint

Adversarial audit of the ingestion surface added in Phase 2, performed before any further
feature work. Every attack below was actually executed against a live PostgreSQL 16 database
and a running production build — none is theoretical.

**Result: 9 findings, all fixed and regression-tested. The three conditions attached to the
original verdict are also closed.** Tests went from 142 to **317**.

> **Update after authorization.** This document first reported DB-03 (no row-level security) as
> open, because fixing it was not a localized change. That work is now done, along with the
> CSRF `Origin` check and the ESLint gate. Sections 5, 6 and 12 record the closed state; the
> findings themselves are left as written so the audit trail stays honest about what was found.

---

## 1. What was implemented (the surface audited)

Guarded fetch · SSRF protection · robots.txt · metadata extraction · content classification ·
article extraction · HTML sanitization · segmentation · persistence · ingestion pipeline ·
worker runner · API routes · background execution via `after()`.

## 2. Attacks tested

| Focus | Attempted |
|---|---|
| **SSRF** | localhost by name and address, 127/8, IPv6 `::1` and `0::1`, IPv4-mapped IPv6 (dotted and hex tails), link-local, cloud metadata (`169.254.169.254`), `metadata.google.internal`, 10/8, 172.16/12, 192.168/16, CGNAT 100.64/10, IETF 192.0.0/24, benchmarking 198.18/15, multicast 224/4, reserved 240/4, broadcast, ULA `fc00::/7`, link-local `fe80–febf`, site-local `fec0::/10`, 6to4 and NAT64 wrapping private v4, decimal/octal/hex/short-form IP spellings, userinfo and double-`@` URLs, non-standard ports, `file:`/`ftp:`/`gopher:`/`data:`/`javascript:`/`dict:`, malformed URLs, **redirects to every private range**, redirect loops, scheme-switching redirects, relative `Location`, >5 hops |
| **XSS** | 60+ payloads: inline script, event handlers (incl. mixed case, backtick, unquoted), `javascript:`/`vbscript:`, entity and double-entity encoding, tab/newline/NUL inside the scheme, `data:` URIs, SVG (`animate`, `set`, `foreignObject`, `use`), MathML (`mtext`+`style`, `annotation-xml`, `maction`), iframe/object/embed/form, meta refresh, `<base>`, CSS injection and `expression()`, inline style, `srcset` smuggling, `formaction`, `ping`, `is=`, `marquee`/`details`/`autofocus` handlers, DOM clobbering (`name=body`, `id=getElementById`, `id=attributes`), `noscript`/`template`/`xmp`/`title` escapes, malformed and nested markup, `rel="opener"` and `target` overrides |
| **Ingestion** | empty / 1-tag / non-HTML bodies, 5 MB pages, 60k-block documents, invalid encoding, mismatched charset, no metadata, triplicate metadata (OG vs Twitter vs JSON-LD vs `<title>`), malformed JSON-LD, paywall, login wall, duplicates, re-ingest, concurrency, retry, **partial failure mid-transaction** |
| **Tenancy** | Raw-SQL cross-tenant INSERT into all 12 tenant tables, cross-tenant SELECT, cascade behaviour, FK composition audit, org deletion |
| **Queue** | Duplicate jobs, 4 concurrent workers, lease expiry, crash-loop, poisoned payload, deleted item, retry exhaustion |
| **Resources** | Giant URLs, giant responses, lying `Content-Length`, unbounded streams, excessive redirects, segment explosion |
| **API** | Anonymous access, **IDOR with a real cross-tenant item id**, CSRF/`SameSite`, input validation, duplicate and concurrent saves |
| **`after()`** | Job durability, failure persistence, double execution, tenant-context independence |

---

## 3. Vulnerabilities found

### SSRF-01 — Non-public IPv4 ranges reachable — **HIGH**
- **Repro:** `assertSafeUrl("http://100.64.0.1/")` → allowed. Same for `192.0.0.8`, `198.18.0.1`, `224.0.0.1`, `240.0.0.1`, `255.255.255.255`.
- **Impact:** RFC 6598 carrier-grade NAT space is where cloud platforms route real internal services (container networks, node-local agents). Reachable = server-side request forgery into infrastructure.
- **Root cause:** `isPrivateIPv4` enumerated only RFC 1918 + loopback + link-local.
- **Mitigation before:** none for these ranges.
- **Test before:** none.
- **Fix:** ranges added to `lib/security/ssrf-guard.ts`.

### SSRF-02 — IPv6 link-local only partially blocked — **MEDIUM**
- **Repro:** `http://[fe90::1]/`, `http://[febf::1]/` → allowed.
- **Root cause:** the check was `normalized.startsWith("fe80:")` — a *string* prefix. `fe80::/10` actually spans `fe80`–`febf`.
- **Fix:** replaced with numeric first-hextet range arithmetic.

### SSRF-03 — IPv6 site-local reachable — **MEDIUM**
- **Repro:** `http://[fec0::1]/` → allowed. Deprecated but still routed on some networks.
- **Fix:** `fec0::/10` blocked.

### SSRF-04 — Private IPv4 smuggled inside IPv6 — **MEDIUM**
- **Repro:** `http://[2002:7f00:0001::]/` (6to4 for 127.0.0.1) and `http://[64:ff9b::a9fe:a9fe]/` (NAT64 for 169.254.169.254) → both allowed.
- **Impact:** an apparently-public IPv6 literal reaching loopback or the metadata endpoint.
- **Fix:** `embeddedIPv4()` decodes 6to4 and NAT64 and re-checks the extracted address.

### XSS-01 — Relative URLs never absolutized — **MEDIUM**
- **Repro:** an article containing `<img src="/admin/x">` was stored verbatim; in the Reader it resolves against **Pocket2's own origin**.
- **Impact:** publisher content drives credentialed same-origin `GET`s to arbitrary paths of our application from the reader's browser, and `<a href="/x">` navigates into our app instead of the publisher's site. Article images also silently break.
- **Root cause:** Readability absolutizes using `document.baseURI`; linkedom's `parseHTML` produces a document with no base URI.
- **Fix:** `sanitizeArticleHtml(html, pageUrl)` resolves every `href`/`src`/`srcset` against the source page and drops anything not http(s).

### DB-01 — Cross-tenant attachment possible on `audio_segment_marks` — **MEDIUM**
- **Repro (raw SQL, API bypassed):** inserting a mark joining org B's `audio_asset` to org A's `reader_segment` → **ACCEPTED**.
- **Root cause:** `segment_id` referenced `reader_segments(id)` alone, not `(id, org_id)` — the only FK in the schema that was not composite.
- **Status when found:** latent (audio is Phase 6), fixed while the table is empty.
- **Fix:** migration `0003` adds `UNIQUE (id, org_id)` on `reader_segments` and makes the FK composite.

### DB-02 — `item_events.item_id` had no foreign key — **LOW**
- **Repro:** inserting an event under org B naming org A's item → **ACCEPTED**. Deleting an item left orphaned events.
- **Fix:** composite FK with `ON DELETE SET NULL (item_id)`, so the activity record survives an item deletion without dangling.
- **Note:** the first attempt at this fix used a bare `ON DELETE SET NULL`, which nulls **every** column in a composite key including the `NOT NULL` `org_id` — that would have made item deletion fail outright. Caught by the regression test before it shipped; the column-list form (PostgreSQL 15+) is correct.

### QUEUE-01 — Crash-looping job retried forever — **MEDIUM**
- **Repro:** claim a job, expire its lease without writing a status, repeat. Measured **12 claims against `max_attempts = 4`**, still `processing`.
- **Impact:** a page that reliably kills the worker (OOM, native crash) permanently occupies a queue slot on every tick — a self-sustaining denial of service triggered by one saved URL.
- **Root cause:** the reclaim branch had no `attempts` ceiling; a worker that dies before `failJob()` never records the attempt.
- **Fix:** `AND attempts < max_attempts` in the claim, plus `reapAbandonedJobs()` on each tick to give such a job a terminal state and a real error, rather than leaving it silently stuck.

### RES-01 — Unbounded segment amplification — **MEDIUM**
- **Repro:** an 880 KB document produced **60,000 segments** in 320 ms; at the 5 MB fetch ceiling that is ~350,000 database rows and five parallel in-memory arrays of that size, from **one** saved URL.
- **Fix:** `MAX_SEGMENTS = 4,000` (far above any real article), and a capped extraction is recorded as `partial`, not `ok`.

### API-01 — Validation failures returned 500 — **MEDIUM**
- **Repro:** `POST /api/pocket2/items` with `{"url": 12345}`, `{}`, `{"url": ""}` or an over-long URL → `500 "Something went wrong"`, and one `unhandled_route_error` line per request.
- **Impact:** client mistakes misreported as server faults; real faults buried; an unauthenticated-cost path for flooding the error log.
- **Root cause:** `FieldError` (thrown by `lib/pocket2/domain/validate.ts`) was not handled by `withApiHandler`.
- **Fix:** mapped to `400` with the field name. `ForbiddenError` → `403` added at the same time.

### LOG-01 — Credentials written to the error log — **MEDIUM**
- **Repro:** an unhandled error whose message contains `postgres://app:s3cr3t@host` or `password=hunter2` was logged verbatim. The HTTP response was already scrubbed; the log was not.
- **Fix:** targeted redaction in `lib/observability/logger.ts` for connection strings, `password`/`token`/`api_key` parameters, bearer tokens, and `sk-`/`ghp_`-style credentials. Ordinary diagnostic text is preserved (tested).

### ING-01 — Our refusal misattributed to the publisher — **LOW (honesty)**
- **Repro:** saving `http://169.254.169.254/` produced *"This site asks automated tools not to fetch this page."*
- **Impact:** not a security hole — the fetch **was** blocked — but the product blamed a third party for its own decision, which is precisely the kind of dishonest reporting this codebase is built to avoid.
- **Root cause:** `checkRobots()` fetches `robots.txt` from the same origin, so the SSRF guard fired there first and its `UnsafeUrlError` collapsed into "disallowed".
- **Fix:** `RobotsVerdict.unsafe` distinguishes the two; the pipeline now reports *"That address can't be fetched safely."*

---

## 4. Vulnerabilities fixed

All nine above. Each has a regression test that **fails against the pre-fix code**, and each was
re-executed after the fix to confirm the attack is blocked.

| ID | Regression test |
|---|---|
| SSRF-01…04 | `tests/unit/ssrf-guard.test.ts` (57 cases) |
| XSS-01 | `tests/unit/sanitize.test.ts` — "relative URLs are resolved against the source page" |
| DB-01, DB-02 | `tests/integration/tenant-schema.test.ts` (13 cases, raw SQL) |
| QUEUE-01 | `tests/integration/queue-hardening.test.ts` |
| RES-01 | `tests/integration/queue-hardening.test.ts` |
| API-01, LOG-01 | `tests/unit/api-errors.test.ts` |
| ING-01 | `tests/integration/ingest.test.ts` |

---

## 5. Vulnerabilities open

### DB-03 — No row-level security — **CLOSED** (was OPEN/HIGH)

*Recorded as it was found, then closed on authorization. Implementation below.*

- **Confirmed:** `relrowsecurity = false` and `relforcerowsecurity = false` on all 12 tenant
  tables. A raw `SELECT text FROM reader_segments WHERE id = 'seg_a'` returns another tenant's
  content.
- **Precisely what is and is not guaranteed today:**
  - Cross-tenant **writes** are impossible at the storage layer — composite foreign keys refuse
    them, proven by 8 raw-SQL attempts that bypass the API entirely.
  - Cross-tenant **reads** are prevented by every repository function taking `orgId` and
    filtering on it. That is an **application-layer** guarantee. It holds today (verified by
    live IDOR testing), but one missing predicate in future code would breach it silently.
- **Why not fixed here:** RLS requires every Pocket2 query to run inside a transaction that sets
  a tenant session variable (`SET LOCAL`). Our repository issues most reads as pooled
  single statements. Using session-level `SET` on a pooled connection would leak tenant context
  between requests — strictly worse than the current state. Doing it correctly means routing all
  Pocket2 data access through a `withTenant(orgId, …)` transaction wrapper: a change to every
  repository function, which is neither localized nor safe to land unreviewed inside a security
  checkpoint.
- **Recommended fix, ready to apply on authorization:**
  1. `withTenant(orgId, fn)` in `lib/pocket2/repo/` — opens a transaction, issues
     `SELECT set_config('pocket2.org_id', $1, true)`, runs the callback.
  2. Migrate the ~20 repository functions to use it (mechanical).
  3. Migration: `ENABLE` + `FORCE ROW LEVEL SECURITY` on all 12 tables, with
     `USING (org_id = current_setting('pocket2.org_id', true))`.
  4. Invert the assertion in `tests/integration/tenant-schema.test.ts` that currently records
     RLS as absent.
**How it was closed**

1. `lib/pocket2/repo/tenant-db.ts` — `withTenant(orgId, fn)` opens a transaction and issues
   `set_config('pocket2.org_id', orgId, true)`. Transaction-local is essential: a session-level
   `SET` on a pooled connection would outlive the request and hand the next one another tenant's
   scope — worse than no RLS. AsyncLocalStorage carries the connection so repository functions
   keep their signatures; a function that forgets the wrapper throws
   `MissingTenantScopeError` rather than silently falling back to an unscoped connection.
2. All ~20 repository functions migrated onto `tquery`/`tqueryOne`; services and the worker
   supply the scope.
3. `migrations/0004_pocket2_rls.sql` — `ENABLE` **and** `FORCE ROW LEVEL SECURITY` on all 12
   tenant tables, each with `USING` **and** `WITH CHECK` on
   `org_id = current_setting('pocket2.org_id', true)`. `current_setting(..., true)` is NULL when
   unset and `org_id = NULL` is not true, so an undeclared statement is denied by construction.
4. `ingest_jobs` additionally accepts a worker scope, because the queue is cross-tenant by
   nature — a worker must see that org B has work before it can act for org B. That scope is
   accepted by **that table alone** and is tested: a worker-scoped transaction reads zero rows
   from saved_items, reader_documents, reader_segments, tags, collections and item_events.

**The deployment requirement this creates**

RLS does not apply to superusers. Migration 0004 creates a `pocket2_app` role (NOLOGIN by
default); `DATABASE_URL` must point at it. Connecting as `postgres` leaves every policy inert.
`assertRlsIsEffective()` asks the database directly so the misconfiguration is loud, `.env.example`
documents it, and a test asserts the application role is not a superuser.

**Proof** — `tests/integration/tenant-schema.test.ts`, all issued as the application role with
**no `org_id` predicate in the SQL at all**:

| Attempt | Result |
|---|---|
| `SELECT` with no organization declared | 0 rows (default deny) |
| `SELECT` while acting for the wrong organization | 0 rows |
| `SELECT` while acting for the right organization | the rows, so this is isolation not breakage |
| `INSERT` labelled with another tenant's org_id | refused by `WITH CHECK` |
| `UPDATE` relabelling one's own row into another org | refused |
| `DELETE FROM saved_items` as the wrong tenant | 0 rows deleted; owner's data intact |
| Worker scope reading content tables | 0 rows from every one |
| Tenant scope surviving onto a pooled connection | not set — transaction-local confirmed |

### CSRF-01 — **CLOSED** (was LOW, accepted)

`SameSite=Lax` was the only layer. `lib/pocket2/http/origin.ts` adds a second: a mutating request
must carry either no `Origin` (a non-browser client, which has no ambient cookie to abuse) or one
matching the host it was sent to. Compared against the request's own host rather than a
configured allowlist, so it needs no per-environment setting and cannot drift.

Verified live: `Origin: https://evil.test` → **400**, same-origin → 401 (the auth layer,
unchanged), no Origin → 401. Six unit tests, including the `app.test.evil.test` suffix trick and
a differing port.

### Audit item #10 (ESLint) — **CLOSED**

`eslint.config.mjs` added; `pnpm lint` runs. Scoped deliberately: **errors** on Pocket2's own
code (including `no-explicit-any`, `no-floating-promises`, `no-misused-promises` under
type-aware checking), **warnings** on the pre-existing product, whose ~20 React 19 hook
violations belong to its owner rather than to this checkpoint.

It immediately paid for itself in Pocket2 code:
- `String(form.get("email"))` on a `FormData` value — a field submitted as a file would have
  become `"[object File]"` instead of failing validation.
- Six async event handlers passed where a void return was expected, so a rejection would have
  been invisible.
- Two `setState`-inside-effect patterns, now genuinely fixed rather than suppressed: the theme
  toggle uses `useSyncExternalStore` with a real server snapshot, and the save launcher derives
  its open state from the URL instead of synchronising it.
- Two dead type assertions.

Current state: **0 errors, 46 warnings**, every warning inherited and deliberately visible.

### Still accepted, not fixed

- **SSRF-05 (INFO):** `POST /api/pocket2/items` accepts `http://169.254.169.254/` and creates
  the item; the fetch is then refused. By design — save-time validation is synchronous and does
  no DNS, and a DNS check there would be a TOCTOU anyway. No request is ever made.

---

## 6. Multi-tenancy — **STRONG, enforced by the database for reads and writes**

- Every one of the 12 tenant tables carries `org_id` (asserted by test).
- Every FK between tenant-owned rows is now composite on `org_id` (asserted by test — this is
  what caught DB-01).
- 8 raw-SQL cross-tenant writes attempted, all refused.
- Deleting an organization removes its entire footprint from all 12 tables; the other tenant is
  untouched.
- Live IDOR against a real second tenant: `GET` 404, `reingest` 404, list 0 items, search 0 hits
  — and **identical to a nonexistent id**, so probing reveals nothing. Owner still gets 200.
- Row-level security is `ENABLE`d and `FORCE`d on all 12 tables, with `USING` and `WITH CHECK`
  policies. A raw `SELECT` as the application role, with no predicate, returns nothing for the
  wrong organization and nothing at all when none is declared.
- The application connects as a non-superuser, asserted by test — without which none of the
  above would apply.

## 7. SSRF protection — **STRONG**

35 address forms refused, 4 previously-reachable classes closed. The redirect guard is confirmed
enforced **per hop**, not just on the submitted URL: a transport spy proves the internal address
is **never requested** when a public host redirects to it, including at the end of a long chain.

**Residual, documented:** a TOCTOU window between DNS resolution and connection (classic
rebinding). Closing it needs dialing the validated IP with a carried `Host` header, which undici
does not portably expose here.

## 8. XSS protection — **STRONG**

70 sanitizer tests. No payload produced live markup. `target="_blank"` **always** carries
`rel="noopener"`, and cannot be defeated by the publisher supplying `rel="opener"`, a different
`target`, or mixed-case attributes. Inline style is dropped entirely; schemes limited to
http/https/mailto; `nonTextTags` prevents a stripped `<script>` leaving its source as visible
text. Escaped output (`&lt;img …&gt;`) was verified to be inert text, not markup.

## 9. Ingestion pipeline — **SOUND**

Persistence is a single transaction: a forced mid-transaction failure leaves the item `pending`
with **zero** reader documents, segments or tags — never a half-applied state claiming an
article we do not hold. Empty, malformed, mis-encoded and metadata-free pages all resolve to a
definite `ready`/`failed` state. OpenGraph precedence confirmed against a page declaring the
same field four ways.

## 10. Worker / queue — **SOUND**

Concurrent claims disjoint (`FOR UPDATE SKIP LOCKED`); two simultaneous ticks over 8 jobs
processed each exactly once and produced exactly 8 reader documents. Expired leases reclaimed;
attempts now bounded; abandoned jobs reaped to a terminal state. Poisoned payloads cannot
redirect the fetch — the worker reads the URL from `saved_items`, never from the job payload.

**`after()` (FOCUS 8):** the job is a committed database row enqueued in the same transaction as
the item, so a killed invocation loses nothing — cron drains it. Failures are persisted, not
just logged. Double execution is impossible (`SKIP LOCKED`). **Tenant context is loaded from the
job row, never from HTTP context** — demonstrated by every integration test running the worker
with no request context at all.

## 11. Tests

**317 passing** (from 142), 13 files. Typecheck 0 errors. **Lint 0 errors.** Build succeeds.

E2E re-run against the running build with the app connected as the non-superuser role: sign-in,
theme toggle (including persistence across reload), `?save=1`, keyboard shortcut, save, and live
ingestion of a real public page — all under RLS, with zero tenant-scope errors in the log.

The fail-closed design caught one of my own misses during that run: `GET /api/pocket2/items/:id`
called the repository directly rather than through a service, so it threw
`MissingTenantScopeError` instead of quietly running unscoped. Fixed by routing it through
`getSavedItem()`.

---

## 12. Verdict

### READY

All nine findings are fixed and regression-tested, and the three conditions attached to the
original verdict are closed:

| Condition | State |
|---|---|
| DB-03 — row-level security | **Closed.** ENABLE + FORCE on 12 tables, USING + WITH CHECK, proven by raw-SQL reads as the application role |
| CSRF-01 — Origin check | **Closed.** Second layer added and verified live |
| Audit item #10 — ESLint | **Closed.** `pnpm lint` at 0 errors; found four real defects in Pocket2 code on its first run |

**Two operational requirements remain, and they are deployment configuration rather than code:**

1. **`DATABASE_URL` must connect as a non-superuser** (`pocket2_app`, created by migration 0004
   and NOLOGIN until credentials are granted). A superuser bypasses RLS entirely, which would
   make every policy decorative. Run migrations as an administrative role; run the application
   as `pocket2_app`. `assertRlsIsEffective()` exists to surface this loudly — wire it into a
   health check.
2. **`POCKET2_CRON_SECRET` must be set** in every environment. Without it the tick endpoint
   refuses all requests (fail-closed, correct) and the queue never drains.

Phase 2 feature work has NOT resumed. Remaining Phase 2 scope is UI polish on the save flow;
Phase 3 is cards, filters and the search palette.
