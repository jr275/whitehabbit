# Phase 7 — Milestone 2 Implementation Record

**Extraction quality, permanent archival, and hardening.**

Status: complete. Branch `feat/knowledge-library-m1`, eight commits on top of Milestone 1.

---

## 1. What M2 was for

> The objective of M2 is NOT AI. The objective is to make the Knowledge
> ingestion system capable of producing high-quality, re-processable content.

Everything below serves one requirement, stated as an absolute:

> **WE MUST NEVER LOSE THE ORIGINAL FETCHED REPRESENTATION.**

That single sentence decides most of the design. If the bytes a
publisher served survive, then every downstream artefact — this
extractor, the next one, and whatever a later milestone builds — is
re-derivable. If they do not, an extraction failure is permanent and
the only fix is to ask the publisher again, which may no longer be
possible: pages move, go behind paywalls, and disappear.

So the bytes are archived **before** anything interprets them, and
nothing in the system is allowed to be the reason they are lost.

### Explicitly not built

No AI of any kind. No Gemini, Claude or OpenAI call. No agents, no
embeddings, no vector search, no knowledge graph, no audio, no
recommendations, no Research. No frontend redesign. Migration 0003
creates no table for any of them.

---

## 2. What shipped

| # | Commit | What |
|---|--------|------|
| 1 | `refactor(knowledge): make extraction a tiered ContentExtractor ladder` | SOURCE/DERIVED split, every tier behind one interface, central sanitization |
| 2 | `feat(knowledge): graby extraction sidecar as tier 1` | ~1,960 per-domain XPath rules, isolated in a no-egress container |
| 3 | `feat(knowledge): pluggable blob store for archived documents` | `BlobStore` + filesystem and S3/R2 adapters |
| 4 | `feat(knowledge): archive the original fetched document before extraction` | `knowledge_artifacts`, migration 0003, archive-before-extract |
| 5 | `feat(knowledge): re-extract from the archive without re-fetching` | Reprocessing, with last-known-good protection |
| 6 | `feat(knowledge): re-extraction jobs, a worker process, and blob collection` | Second job kind, worker/web separation, GC sweep |
| 7 | `feat(security): nonce-based CSP, plus a smoke suite that proves it works` | CSP, security headers, 42-check smoke suite |
| 8 | `docs: milestone 2 implementation record` | This document |

**Tests: 154 passing** (`npm test`, real PostgreSQL, zero test dependencies).
**Smoke: 42 checks passing** (`npm run smoke`, real build, real database).

---

## 3. Extraction: a ladder, not a function

### 3.1 The tiers

```
tier 1   graby sidecar    services/extractor — 1,961 site configs.
                          Remote, OPTIONAL, no egress.
tier 2   readability      content-density heuristic, in-process
tier 3   metadata         title/excerpt/cover, no body, in-process
```

Every tier implements the same `ContentExtractor`. The ladder
(`lib/knowledge/ingestion/extraction/index.ts`) is the only module that
knows there is more than one, so adding a tier — PDF, YouTube, podcast —
is a module plus one array entry.

### 3.2 Invariants the ladder enforces

- **No tier ever fetches.** The caller supplies the bytes. This is what
  keeps the SSRF boundary in exactly one file (`safe-fetch.ts`).
- **Falling through is normal, not an error.** Tier 1 being down is a
  quality regression, never an outage: tiers 2 and 3 are in-process and
  report `isAvailable()` unconditionally true, so the ladder cannot fall
  off its end and an object is never silently empty.
- **Sanitization happens once, centrally.** Not in each tier. No tier
  can forget, and no future remote tier is trusted to have done it. A
  test feeds a deliberately hostile tier result through the ladder and
  asserts the script and the `onerror` attribute are gone.
- **A broken tier costs that tier, not the ladder.** A tier throwing
  something that is not an `ExtractionError` is contained.

### 3.3 SOURCE vs DERIVED

M1 recorded one opaque string, `extractor`. That is not enough to
re-extract meaningfully, so `ExtractionResult` now separates:

| | Fields | Property |
|---|---|---|
| **SOURCE** | title, authors, publishedAt, language, siteName, canonicalUrl, imageUrl, faviconUrl, images, contentHtml, contentText | What the publisher said. **Re-derivable from the archived artifact.** |
| **DERIVED** | method, extractorVersion, siteConfigMatched, confidence | What we computed. **Changes when our extractors improve.** |

`confidence` is a documented deterministic function of observable facts
(which method won, whether a site rule matched, word count, presence of
title/authors/date). It is written down as *not* a probability and *not*
a model output, so nobody later mistakes it for something cleverer.

Nothing here is AI-generated. There are no AI fields.

---

## 4. The graby sidecar

Phase 1 identified Wallabag's per-domain XPath site-config corpus as the
one asset genuinely worth carrying forward: ~1,960 hand-written rules
for publishers no generic heuristic reads well. `services/extractor` is
a single-file PHP service wrapping `j0k3r/graby` behind a JSON contract
of our own — the only PHP in the product, and nothing graby-specific,
Wallabag-specific or PHP-specific crosses the boundary.

### 4.1 Its security contract

1. **It never fetches.** Node fetches behind the SSRF guard with a
   pinned IP and passes the bytes in; graby is constructed with
   `setContentAsPrefetched()`, so it issues no request of its own. In
   production the container has **no egress at all**, so even a full
   compromise cannot turn it into an SSRF proxy.
2. **No database connection, no credentials, no tenant data.** A pure
   function from bytes to structure.
3. **Never publicly reachable.** Private networking only.
4. **Input is hostile by definition** — arbitrary internet HTML. Size
   capped, entity loading disabled (XXE), every extraction inside a
   `try/catch` so a malformed document is a typed 422, never a 500.

### 4.2 Optional, and treated as such

`EXTRACTOR_URL` unset — dev, tests, any deployment that has not built
the container — and the ladder falls straight through. A dead or slow
service is a quality regression, never an ingestion outage:

- A module-level circuit breaker (5 consecutive failures, 60s open)
  stops one dead sidecar adding 20 seconds to every save.
- A 422 is a determinate "no article here": it falls through **without**
  opening the circuit, because a page with no article is a healthy
  service giving a correct answer.
- One success closes the breaker again.

### 4.3 Two quality fixes found by running it

Verified live against the real container (1,961 site configs loaded, no
egress, correct extraction). Two things showed up only under real use:

- Graby reports the raw `<title>`, so `" | Example Engineering"`
  survived where the local tiers stripped it. The suffix rule is now
  `cleanTitle()`, shared by every tier.
- When no site config matches, graby's generic fallback can return
  `<body>`'s serialization, which **begins with the title as a loose
  text node**. Left in, every such article opens by saying its own
  headline twice. Now dropped — narrowly: only a leading run of text
  before the first tag, and only when it matches the title we are about
  to store.

Fields graby does not report (canonical URL, favicon, site name, the
image list) are read from the **original** document with the same
readers the local tiers use, so turning the sidecar on can never lose a
field tier 3 would have found.

---

## 5. Storage: the `BlobStore`

### 5.1 Why not Postgres

Raw documents are 50 KB–10 MB, written once and read rarely. In a table
they would bloat every backup, restore and replica for no queryable
gain. **Postgres keeps the metadata; the object store keeps the bytes.**

### 5.2 The contract

Deliberately dumb: bytes and keys. It knows nothing about gzip, tenants,
artifacts or HTML — compression is the archive layer's decision and is
recorded per row, so changing it later cannot strand what is already
stored.

| Decision | Answer |
|---|---|
| **Object key** | `knowledge/<workspaceId>/<objectId>/<artifactId>.html.gz` — tenant first, so deleting a workspace is one prefix, a bucket listing is human-readable during an incident, and a key that crosses tenants is *visibly* wrong. |
| **Ownership** | The `knowledge_artifacts` row, which carries `org_id`. A blob with no row is garbage, not content. |
| **Authorisation** | The row, checked against an `AccessScope` **before** the blob is located. Keys are not a security control and are never public. |
| **Content type** | Recorded as served. Encoding (`gzip`/`identity`) recorded separately, because it describes storage, not the document. |
| **Size** | Both: stored (compressed) and original. |
| **Checksum** | sha256 of the **uncompressed** bytes. Verified on every read. |
| **Encryption at rest** | The volume's (LUKS/EBS) or the bucket's (SSE-S3/SSE-KMS). **We do not encrypt in the application** — a key we manage is a key we can lose, and losing it would destroy the one thing M2 exists to preserve. |
| **Encryption in transit** | TLS. A non-https endpoint is refused outright. |
| **Retention** | Newest 3 captures per object; the newest is **never** released. |

### 5.3 Two adapters

**filesystem** — the default, with no configuration at all. Dev, the
test suite, single-node deployments with a mounted volume. Write-then-
rename so a crash cannot leave a truncated artifact that reads as valid;
mode 0600 so archived documents are not world-readable. Honest about its
limits: not replicated, not shared between hosts.

**s3** — AWS S3, Cloudflare R2, MinIO. SigV4 signed with `node:crypto`
and **no SDK**: the AWS SDK is ~15 MB across dozens of packages for
three operations, and SigV4 is a stable documented algorithm, so this is
~150 lines with no supply-chain surface. Its signing tests pin the RFC
3986 encoding and the signed-header set directly, because a signing bug
surfaces as a 403 rather than a crash and would otherwise be noticed a
week after archiving broke.

**No presigned URLs, ever.** An archived document is raw
attacker-controlled HTML; a presigned URL for one is a public,
unauthenticated XSS host on infrastructure we own.

Backend selection is implicit in the configuration — bucket credentials
present means S3, absent means disk — rather than a separate flag that
could disagree with the credentials actually present at 3am.

---

## 6. The archive

### 6.1 Archive before extract

The pipeline writes the bytes and commits the artifact row **before**
extraction is attempted. A page no extractor can read is still
permanently re-processable. This is verified by a test that ingests a
document every tier declines, then reads the archive back.

Order within archiving matters too: **blob first, row second.** A crash
between them leaves an orphan blob, which the sweep collects and which
costs pennies. The reverse order would leave a row pointing at nothing —
a phantom artifact indistinguishable from data loss.

### 6.2 The bytes are the bytes

`safeFetch` now returns the raw buffer and the declared charset
alongside the decoded string, and the archive stores the **buffer**.
`html` is already a transformation, so a mis-detected charset costs a
re-extraction rather than a document. A test archives invalid UTF-8 and
gets the identical bytes back.

### 6.3 Every read is verified

The checksum is over the uncompressed original and is checked on the way
out. A truncated or overwritten archive announces itself instead of
silently producing a worse extraction that looks like a publisher's
fault. Tests cover both a corrupted blob and a missing one.

### 6.4 Idempotency

Unique on `(object_id, kind, checksum)` among live rows. A retried job,
or a re-fetch of an unchanged page, is **one** capture rather than two;
the blob that lost the race is collected immediately rather than left
for the sweep.

---

## 7. Re-extraction

This is what the archive is *for*. When a site config improves, a tier
is added, or a bug in our own sanitizer is fixed, every article already
saved can be made better without touching the publisher again.

**No network — as a guarantee, not a preference.** The path has no
URL-shaped input and never calls `safeFetch`. It resolves a
tenant-scoped artifact row, decompresses it, verifies its checksum, and
hands the bytes to the same ladder ingestion uses.

**Last known good survives.** A re-extraction that throws, that finds a
missing archive, or that produces something materially worse leaves the
stored article exactly as it was. Losing a working article to a hopeful
re-run would be strictly worse than never re-running.

**"Worse" is written down**, because this runs unattended across a whole
library and a wrong "yes" is invisible until someone opens an article
and finds it gutted:

1. A stored row with no content is replaced by anything with some.
2. A site-specific rule beats a generic heuristic — a human wrote that
   rule for this domain.
3. Otherwise the body must not shrink by more than a third.
4. Ties go to the stored copy; rewriting an article to say the same
   thing burns a revision for nothing.

Outcomes are typed (`replaced` / `unchanged` / `declined` / `failed`),
never thrown: an unhandled throw in a background worker is a job stuck
`active` until the reaper notices. Re-extraction never overwrites the
fetch provenance of a fetch it did not perform, and `revision` counts
successful re-extractions so "this article changed" is distinguishable
from "this article was read again".

`POST /api/knowledge/items/[id]/reextract` queues the work. **It never
returns the archived document** — there is deliberately no API that
hands raw third-party HTML to a browser. An item with nothing archived
gets a plain 409 rather than work that could only fail.

---

## 8. Jobs, the worker, and collection

### 8.1 One new job kind

`reextract` joins `ingest`. Exactly one, and no speculative ones.

Blob garbage collection is deliberately **not** a job: it is a
system-wide sweep with no object and no tenant behind it, and
`knowledge_jobs` requires an `object_id` — modelling it there would mean
inventing a fake one. It rides on the same tick that reaps.

`enqueueJob` keeps **one live job per (object, kind)**: a user hammering
"re-extract" produces one unit of work, not twenty. An existing row is
re-armed rather than duplicated, with the attempt counter reset — a
re-extraction asked for today deserves its own full allowance, not
whatever a run last month left over — and a job a runner is currently
holding is left alone, since stealing it would run it twice.

### 8.2 Worker/web separation

`scripts/knowledge-worker.mjs` runs the same stage functions in a
long-lived process outside Next. M1 drove the queue from inside the web
process; M2 makes that materially worse on purpose, since archiving
gzips multi-megabyte buffers and re-extraction reads them back.

The separation is a **deployment choice, not a migration**: claiming is
already a compare-and-swap with `FOR UPDATE SKIP LOCKED`, so a web
process and any number of workers split the queue rather than
duplicating it. Run the worker and the web process stops doing the heavy
lifting, with no code change; run neither and `after()` plus `/tick`
still work exactly as before. SIGTERM finishes the job in flight; if the
process is killed anyway the reaper reclaims it, which is what lets the
worker be this small.

No new dependency — Node's own type stripping runs the TypeScript, as
the test suite already does. The module-resolution hooks moved out of
`tests/` and are now shared, because two copies would drift and the
drift would be a worker importing a different module than the tests do.

### 8.3 Collection

Retention **marks** rows; the sweep deletes the blob and only then the
row. A blob whose delete fails keeps its row, so it is retried rather
than leaked, and the sweep can never reach an artifact retention has not
released.

---

## 9. Security re-audit

M2 adds three genuinely new attack surfaces: a second process that
parses hostile input, a blob store, and a reader that renders stored
third-party HTML. Each was worked through explicitly.

### 9.1 Untrusted input reaching graby

| Risk | Control |
|---|---|
| The sidecar becoming an SSRF proxy | It never fetches (`setContentAsPrefetched`), and the container is given **no egress**. The SSRF boundary stays in `safe-fetch.ts` alone. |
| XXE via crafted HTML | `libxml` external entity loading disabled; internal errors suppressed. |
| Oversized documents | Capped at both ends: Node caps the fetch at 10 MB, the service rejects >10 MB with 413 before parsing. |
| A malformed document crashing the service | Every extraction inside `try/catch`; a parse failure is a typed 422, never a 500. |
| Credential or tenant-data exposure from a compromise | It holds neither. No database connection, no credentials, no tenant data — a pure function from bytes to structure. |
| Reaching it directly | Private networking only; never publicly routable. |

### 9.2 Decompression bombs

We only ever decompress bytes we compressed ourselves, from a document
the fetcher already capped. **"Only ever" is exactly the assumption an
attacker who reached the bucket would be relying on**, so the cap is
enforced by zlib (`maxOutputLength`) rather than assumed by us. A test
writes a ~200 MB-inflating bomb over a real artifact and asserts the
read fails as `artifact_too_large`.

### 9.3 Raw HTML exposure

| Risk | Control |
|---|---|
| An API returning an archived document | There is no such API. The re-extract endpoint returns the same sanitized item shape as every other endpoint. |
| A public artifact URL | Never created. No presigned URLs, no public ACLs, no listing endpoint. |
| Cross-tenant delivery | The tenant check happens **before** the blob is located, never after. `recordArtifact` guards on the object's workspace *inside* the INSERT, so there is no window between check and write. Handing an artifact to the wrong tenant is not a privacy bug, it is a stored-XSS delivery mechanism, so it is tested from both directions. |
| Unsanitized markup reaching the reader | Sanitize-on-write, now performed centrally by the ladder so no tier can skip it, plus the CSP below. |

### 9.4 Path traversal into the blob store

A key becomes a filesystem path, so traversal is an arbitrary file
write. One validator is shared by **both** backends so they cannot drift
apart; the filesystem adapter additionally re-checks the resolved path
against its root. Ten traversal shapes are tested, including
`knowledge/../../etc/passwd`, backslashes, doubled slashes, control
characters and a trailing slash.

### 9.5 Container escape

The sidecar runs as a non-root user on `php:8.3-cli-alpine` with no
egress, no credentials, no volumes and no database access. The blast
radius of a full compromise is the ability to return wrong extraction
results — which the ladder's central sanitization then strips, and which
a test exercises directly by feeding a hostile tier result through.

### 9.6 Content-Security-Policy

New in M2, and the reason it is new is M2: we now render HTML that came
from an arbitrary website. Nonce-based with `'strict-dynamic'`, so an
injected `<script>` cannot execute even if one survives sanitization.
Plus `nosniff`, `X-Frame-Options: DENY`, a referrer policy, and a
`Permissions-Policy` that turns off capabilities we never ask for.

**The one deliberate loosening is `img-src https:`** — see §10.

**What this cost, measured rather than assumed:** the root layout now
awaits `connection()`. `export const dynamic = "force-dynamic"` is *not*
sufficient on Next 16 — with it, responses still came back
`x-nextjs-prerender` and their scripts still carried no nonce, because
Next serves a prerendered shell built before any request exists. Under
`'strict-dynamic'` that is a page that loads and then does nothing:
invisible to `curl`, fatal in a browser. The smoke suite asserts every
`<script>` on every document carries the nonce named in the header,
which is the only kind of check that catches it.

The prerendering this removes was saving a render of markup containing
no data (these are authenticated shells that fetch client-side):
`/login` 7.3 ms → 10.9 ms, `/studio` 4.6 ms → 3.9 ms.

### 9.7 Still true from M1

Re-verified by the smoke suite against the built application, not just
by unit tests: the SSRF guard refuses loopback addresses (it has **no**
test escape hatch — a flag that let the suite reach a private address is
a flag an attacker would look for); a page we could not read is still
saved, listed and openable; and a second account can reach none of the
first's data.

---

## 10. Image policy

**Images stay external. We record every in-article image URL and
download none.**

Downloading every image on every save is real bandwidth and real storage
for a benefit no current or planned feature needs. Recording the list
means a future milestone can archive selected images without
re-extracting, which is the option worth keeping open.

The consequences are handled where they belong:

- Rendering an article loads images from the publisher, so `img-src`
  allows `https:`. Narrowing it further would mean proxying or
  downloading, which is a later milestone's decision.
- The privacy cost is handled in the markup, not the policy: the
  sanitizer stamps every `<img>` with `referrerpolicy="no-referrer"`
  and `loading="lazy"`, so a publisher learns that an IP fetched an
  image and nothing about which page rendered it. Outbound links get
  `rel="noopener noreferrer nofollow"`.
- A gallery page is capped at 40 recorded images; `data:` URIs are
  skipped, since they are not addressable resources.

---

## 11. Performance

Measured on this machine against real PostgreSQL and the filesystem
store, 20 runs per cell, `p50 / p95` in milliseconds.

| Document | Bytes | Stored | Extract | Archive | Re-extract |
|---|---|---|---|---|---|
| small | 3 KB | <1 KB | 1.3 / 12.7 | 3.9 / 46.3 | 6.3 / 10.2 |
| typical | 11 KB | <1 KB | 3.4 / 4.7 | 3.2 / 5.2 | 8.1 / 9.6 |
| large | 75 KB | 1 KB | 22.6 / 25.0 | 3.7 / 15.1 | 32.1 / 35.2 |
| huge | 296 KB | 2 KB | 91.0 / 114.4 | 5.5 / 16.8 | 116.2 / 132.9 |

Archive read-back of a 75 KB document (fetch + gunzip + sha256 verify):
**p50 2.1 ms, p95 2.4 ms.**

### What the numbers say

- **Archiving is cheap and roughly flat**: 3–6 ms p50 regardless of
  size, because gzip and a single sequential write are both fast
  relative to a database round trip. Adding permanent archival to
  ingestion costs less than the extraction it protects.
- **Extraction dominates, and scales with document size.** At 296 KB it
  is ~91 ms — which is precisely the argument for the worker process:
  that is 91 ms of event loop the web process should not be spending
  while somebody is waiting for a page.
- **Re-extraction ≈ read-back + extraction**, as it should be. There is
  no hidden cost in reprocessing; it is the extraction you would have
  paid anyway, minus the network.
- **Verification is not a meaningful cost.** 2 ms to decompress and
  checksum 75 KB is not a reason to skip either.

### Compression, honestly

The synthetic benchmark reports 7×–186×, which is an artefact of
repeated paragraphs and is not worth believing. Measured over real
served documents, gzip -6 gives **3.6×–4.4×, aggregate 3.8×** — which is
the figure the code comments now cite. At 3.8×, a 10,000-item library of
typical 60 KB pages is roughly **160 MB** of archived bytes.

---

## 12. Schema

Migration `0003_knowledge_m2.sql` is **purely additive**: one new table
plus new nullable columns. No existing column is dropped, renamed or
retyped, no existing row is rewritten, and nothing touches the
Workforce/Studio product. An M1 deployment runs unchanged against it,
which is what makes it safe to apply before the code that uses it.

```
knowledge_artifacts   one immutable capture per fetch: backend, key,
                      both sizes, checksum, charset, and the fetch's own
                      provenance. Idempotent by (object, kind, checksum).
knowledge_content     + artifact_id, extraction_method,
                      extractor_version, extraction_confidence,
                      site_config_matched, images, revision
knowledge_objects     + publisher_canonical_url — the publisher's own
                      idea of the address, kept separate from
                      canonical_url, which is OUR normalisation and is
                      what duplicate detection keys on
knowledge_jobs        kind constrained to ('ingest', 'reextract')
```

Still deliberately absent: embeddings, vector columns, chunks, topics,
entities, collections, graph edges, recommendations, audio, research,
agent tables.

---

## 13. Configuration

| Variable | Required | Meaning |
|---|---|---|
| `EXTRACTOR_URL` | No | The graby sidecar. Unset → the ladder uses the in-process tiers; quality drops on awkward publishers, nothing else changes. **Private networking only, no egress.** |
| `KNOWLEDGE_BLOB_DIR` | No | Filesystem blob root. Defaults to a temp directory, which is fine for dev and wrong for production. |
| `KNOWLEDGE_S3_BUCKET` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | No | Present → the S3 backend is selected. **Required for any multi-node deployment**; a local directory is not shared. |
| `KNOWLEDGE_S3_REGION` / `_ENDPOINT` / `_FORCE_PATH_STYLE` | No | R2 needs `region=auto`, its account endpoint, and path style. |
| `KNOWLEDGE_TICK_SECRET` | For the scheduler | Unchanged from M1. |
| `KNOWLEDGE_WORKER_BATCH` / `_IDLE_MS` | No | Worker tuning. |

---

## 14. Running it

```bash
npm run migrate         # applies 0003
npm run verify          # typecheck + boundaries + 154 tests
npm run worker          # the queue worker, as its own process
npm run build && npm run smoke   # 42 checks against the real build

# the extraction sidecar (optional)
docker build -t whitehabbit-extractor services/extractor
docker run --network none -p 8080:8080 whitehabbit-extractor
```

`SMOKE_ARTICLE_URL=<a public article>` extends the smoke suite to the
full save → read → re-extract path. Without it that section is **skipped
with a stated reason** rather than faked: the same path is covered
against a real database in `npm test`, and a check that quietly passes
without running is worse than one that says it did not run.

---

## 15. What M2 deliberately left for later

| Deferred | Why |
|---|---|
| Downloading/proxying images | §10. Recording the URLs keeps the option open at no cost. |
| A real queue (pg-boss) | The transport is temporary; the semantics are not. `knowledge_jobs` already does CAS claiming, backoff and reaping. Swapping it means replacing the runner, not the pipeline. |
| Bulk "re-extract everything stale" | The primitive exists (`idx_knowledge_content_version`, `reextractObject`) and the job kind exists. What is missing is only the fan-out, and fan-out without a rate budget is how you re-extract a million articles at once. |
| PDF / YouTube / podcast tiers | Each is one `ContentExtractor` plus one array entry. The seam is proven by the three tiers already in it. |
| Encrypting artifacts in the application | A key we manage is a key we can lose. Volume- and bucket-level encryption is the right layer. |
| Tightening `img-src` | Requires the image decision above first. |

---

## 16. Milestone 2 acceptance

| Requirement | Status |
|---|---|
| Extraction quality improved with real per-domain rules | ✅ 1,961 site configs, tier 1 |
| The original fetched representation is never lost | ✅ Archived before extraction, checksum-verified, retained |
| Raw HTML never stored in PostgreSQL | ✅ Object store; the database holds metadata |
| Content is re-processable without re-fetching | ✅ `reextractObject`, no network path |
| Extraction is versioned | ✅ method + version + confidence + site-config match, per revision |
| A failed reprocess preserves last known good | ✅ Guarded, and tested from four directions |
| Raw HTML is never exposed to unauthorized clients | ✅ No such API; tenant checked before the blob is located |
| No public artifact URLs | ✅ No presigning, no public ACLs |
| Worker and web separated | ✅ `scripts/knowledge-worker.mjs`; a deployment choice, not a migration |
| CSP implemented and tested | ✅ Nonce + `strict-dynamic`, asserted per-script by the smoke suite |
| Workforce still works end to end | ✅ 42-check smoke suite: LOGIN → STUDIO → CREATE → BUILD → RELEASE → RUN |
| No AI of any kind | ✅ No provider call, no embedding, no agent, no vector |
