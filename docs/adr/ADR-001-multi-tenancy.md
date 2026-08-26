# ADR-001: Multi-tenancy — application-layer isolation now, RLS as the next hardening step

## Status
Accepted, with a named follow-up.

## Context
Every tenant-owned table (`workers`, `tasks`, `executions`, `execution_events`,
`outputs`, `business_events`, `metrics`, and — as of this revision —
`projects`, `entities`, `entity_relationships`, `entity_evidence`,
`opportunities`) carries `org_id`. `lib/session.ts#requireSession()` is the
single place a request's tenant context is established: it reads the
authenticated user from NextAuth, then re-verifies real membership
(`userBelongsToOrg`) against the database on every request — a stale or
forged `organizationId` claim in a session/cookie can never grant access it
doesn't actually have. Every `lib/db/repo.ts` read/write function takes an
explicit `orgId` and filters on it in SQL; there is no "get by id alone" path
for a tenant-owned row.

Row Level Security (RLS) is not enabled. Isolation today is 100%
application-layer: correct as long as every query goes through `repo.ts` and
every `repo.ts` function remembers its `WHERE org_id = $n`.

## Decision
Keep application-layer isolation as the enforced boundary now — it is
real, tested by convention (every repo function's own docstring states its
org-scoping), and matches the brief's core requirement ("never allow a
tenant ID supplied by a client to bypass authorization; derive tenant
context from authenticated identity and server-side authorization").
Layer PostgreSQL RLS on top as defense-in-depth once the schema stabilizes
past this revision's additions — RLS policies keyed on `org_id` via
`current_setting('app.org_id')`, set once per pooled connection at the top
of each request — rather than rewriting every existing query first. This is
tracked in `docs/architecture/risks.md` as R-1, not silently deferred.

Tenant model: `Organization` (today's `organizations` table) = Tenant.
`Project` (new in this revision, `projects` table) = one connected website /
workspace inside a tenant — the brief's explicit "do not assume one tenant =
one website." `Membership.role` remains `owner | member` for now; the
brief's full role set (OWNER/ADMIN/EDITOR/ANALYST/AGENT_OPERATOR/VIEWER) is
deferred until a real permission-consuming feature needs the distinction
(see `docs/architecture/risks.md` R-2) — adding role values with no
enforcement anywhere would be exactly the "TODO-driven architecture" the
brief prohibits (§73).

## Consequences
- Positive: no change to the proven, already-audited isolation mechanism;
  new domains (`lib/knowledge`, `lib/opportunity`) reuse it unmodified.
- Positive: `Project` slots into the existing shape with one new table and
  one new foreign key column per tenant-owned row added going forward —
  existing tables (`workers`, etc.) are not retrofitted with `project_id`
  in this revision, since no current feature needs a Worker scoped below
  the org. Adding it is a one-column, backward-compatible migration
  whenever it is needed.
- Negative: a bug in a single `repo.ts` function that forgets `AND org_id =`
  is a real cross-tenant leak with nothing else to catch it today. Mitigated
  by (a) every function in `repo.ts` taking `orgId` as a required, typed
  parameter — there is no overload without it — and (b) R-1's RLS follow-up.
  Explicit automated cross-tenant-access tests (brief §72) are tracked in
  `docs/architecture/risks.md` R-3, not yet written.
