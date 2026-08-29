# Pocket2.io — Phase 1: foundation, data model, auth, tenancy

Phase 1 of the plan in [`POCKET2_ARCHITECTURE_AUDIT.md`](./POCKET2_ARCHITECTURE_AUDIT.md).
Everything below is running code verified against a real PostgreSQL database and a real
production build — not scaffolding.

## Where Pocket2 lives

| Path | What |
|---|---|
| `/pocket2` | Landing page (static) |
| `/pocket2/login`, `/pocket2/signup` | Auth screens over the **existing** Auth.js stack |
| `/pocket2/library` | Signed-in home (request-time; session-scoped) |
| `migrations/0002_pocket2.sql` | The Pocket2 schema |
| `lib/pocket2/domain/` | Pure types, URL canonicalization, validation, authorization predicates |
| `lib/pocket2/repo/` | Org-scoped SQL |
| `lib/pocket2/services/` | Business logic, always given an explicit `TenantContext` |
| `lib/pocket2/tenancy.ts` | Resolves the tenant context from the verified session |
| `app/pocket2/pocket2.css` | The design system, scoped to `[data-pocket2]` |
| `tests/` | Vitest: 33 unit + 24 integration |

Pocket2 is mounted under `/pocket2` because `/` currently serves the existing agent-factory
product, and quietly replacing another product's entry point was not this phase's call to make.
Re-rooting is a one-line change to `POCKET2_BASE` in `lib/pocket2/routes.ts` plus a directory
move — nothing references the prefix literally.

## What was reused, not rebuilt

Phase 1 adds **no second authentication system, no second database client, no second error
contract**. It builds on what the audit found worth keeping:

- `lib/db/client.ts` — pooled Postgres, `withTransaction`
- `scripts/migrate.mjs` — unchanged; the new schema is just another `migrations/*.sql`
- `lib/session.ts::requireSession()` — already re-verifies org membership every request
- `lib/api-error.ts` — including its correct 404-not-403 for cross-tenant reads
- `lib/security/ssrf-guard.ts` — reserved for the Phase 2 ingestion fetch
- Auth.js Credentials provider, bcrypt hashing, `/api/auth/register`

## Tenant isolation

Enforced at **three** independent layers, so no single mistake is sufficient to breach it:

1. **Signature.** Every repository function takes `orgId` as its first parameter. There is no
   `getItem(id)` — a caller cannot express "any tenant's item".
2. **Predicate.** Every statement filters on `org_id`. Cross-tenant reads return `null` and
   cross-tenant writes affect zero rows, so "not yours" and "does not exist" are
   indistinguishable to a probe.
3. **Schema.** Every child table carries `org_id` and references `saved_items(id, org_id)` as a
   **composite foreign key**. A cross-tenant row cannot be written even by SQL that bypasses the
   repository entirely — which `tests/integration/tenancy.test.ts` proves by attempting exactly
   that.

`organizationId` is always *derived* from the verified session, never *received* from a request
body, query string, or header.

## Idempotent save

`UNIQUE (org_id, url_hash)` in the database, not a read-then-write check in application code —
two devices saving the same link simultaneously would both pass a read-first check and race.
`saveItem` uses `ON CONFLICT DO NOTHING` and returns the existing row with `duplicate: true`.
A 5-way concurrent save is covered by test.

`url_hash` is `sha256(canonicalUrl)`. Canonicalization (`lib/pocket2/domain/url.ts`) folds
scheme, host case, `www.`, default ports, fragments, tracking parameters and parameter order,
so a link shared from a newsletter and from social resolves to one saved item.

## Reader/listen data model, present from day one

`reader_documents` → `reader_segments` → `audio_assets` → `audio_segment_marks` all ship in
Phase 1 even though the Reader is Phase 4 and Listen is Phase 6. Segments are the
read↔listen sync seam; reading position is stored as a **segment anchor, not a pixel offset**,
so it survives re-extraction and transfers between devices. Adding sentence-level audio
highlighting later needs no migration.

## Honesty rules encoded in the schema

- `ingest_status` and `reader_status` are **separate columns**. An item can ingest perfectly and
  still have no extractable article body. Conflating them is how a product ends up claiming it
  extracted content it never had.
- `reader_documents.failure_reason` names the real cause (`paywalled`, `login_required`,
  `robots_disallowed`, …) so the Reader can explain itself instead of showing fabricated text.
- `saved_item_tags.source` distinguishes `user` from `auto`, so Phase 7's auto-tagging can never
  silently overwrite someone's own organization of their library.

## Running it

```bash
pnpm install
createdb pocket2_dev                       # any PostgreSQL 14+
export DATABASE_URL=postgres://…/pocket2_dev
export AUTH_SECRET="$(openssl rand -base64 32)"
export AUTH_TRUST_HOST=true                # required outside Vercel, incl. local `pnpm start`
pnpm migrate
pnpm dev                                   # → http://localhost:3000/pocket2
```

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest; integration tests skip themselves without DATABASE_URL
pnpm build
```

> Point `DATABASE_URL` at a **throwaway** database when running tests. The suite creates and
> deletes only rows prefixed `test_org_` / `test_user_`, but it does run real migrations.

## Verified

| Check | Result |
|---|---|
| `migrations/0001` + `0002` applied to a live PostgreSQL 16 | clean |
| `pnpm typecheck` | 0 errors, whole repository |
| `pnpm test` | 57 passed |
| `pnpm build` | succeeds; all Pocket2 routes emitted |
| Register → sign in → library, end to end | real session, real workspace name, honest empty state |
| Wrong password | rejected; protected route redirects to sign-in |
| Anonymous `/pocket2/library` | 307 → `/pocket2/login?callbackUrl=…` |
| Existing product (`/`, `/studio`, `/login`) | unaffected |

## Debt closed in this phase

| Audit item | Status |
|---|---|
| #1 `ignoreBuildErrors: true` | **Fixed.** Repository typechecks clean, so the suppression was removed and the build now fails on a type error. |
| #2 Zero tests, no runner | **Fixed.** Vitest added; 57 tests, including the tenant-isolation suite. |
| #4 `node_modules` absent, Next 16 docs unread | **Fixed.** Dependencies installed; `node_modules/next/dist/docs/` read before writing code. |
| #10 No ESLint/Prettier | Still open — deferred rather than bolted on mid-phase. |

Still open by design: #3 (`images.unoptimized`) matters once cards render real cover images in
Phase 3; #5–#9 and #11–#14 belong to the existing product or later phases.

## Discovered during Phase 1

- **Next.js 16 renames `middleware` to `proxy`**, and `proxy` runs on the Node runtime — the
  Edge runtime is not supported there. That would let `lib/auth.config.ts`'s edge-safe split be
  simplified, but it changes the existing product's request path, so it belongs in its own
  commit. `middleware.ts` still works; its matcher was extended for Pocket2 (Next.js supports
  exactly one such file per project).
- **`AUTH_TRUST_HOST` was undocumented.** Every Auth.js endpoint returns
  `UntrustedHost` on a self-hosted production run without it. Added to `.env.example`.
- **The slug function mangled non-decomposable Latin letters** — `Søren` → `s-ren`,
  `Weiß` → `wei`. NFKD only splits accented letters into base + combining mark; letters that
  are their own codepoint need explicit folding. Found by a unit test, fixed, covered.

## Not built in Phase 1 — deliberately

Cards, filters, the ⌘K palette, the save modal, the ingestion worker, the Reader and the audio
player are Phases 2–6. The library page lists what is genuinely in the database and shows an
honest empty state; it does not mock a grid that does not exist yet.
