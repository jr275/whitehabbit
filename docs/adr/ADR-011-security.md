# ADR-011: Security posture — extend the existing real controls, don't duplicate them

## Status
Accepted (documents existing decisions; extends them to new domains).

## Context
Real, working controls already exist: `lib/security/ssrf-guard.ts` (blocks
localhost/private IPs/metadata endpoints/non-http schemes for any outbound
crawl-shaped request), `lib/rate-limit.ts` (Postgres-backed, per-scope/
subject fixed-window limiting, correct across concurrent serverless
instances), `recordAudit()` (append-only `audit_log`), `requireSession()`
(ADR-001), and secrets read only server-side from environment variables
(`.env.example`'s own header: "Never exposed to the browser — read only in
lib/db/client.ts (server-only)").

## Decision
New domains introduced in this revision follow the same controls, not new
ones: `lib/opportunity`'s status-transition endpoint (approve/reject) calls
`requireSession()` + `recordAudit()` exactly like `app/api/workers/route.ts`
does. No new outbound HTTP call was added in this revision (Opportunity
ingestion is pure computation over already-fetched skill output), so
`ssrf-guard.ts` has nothing new to cover yet — it will apply directly once a
real crawler (§67, not built) makes its own outbound requests.

Two items are named as gaps, not silently accepted: (1) rate limiting on the
new opportunity status-transition endpoint uses the same
`checkRateLimit()` primitive as worker mutations, at a conservative default —
tuned, not skipped. (2) No CSRF token exists beyond NextAuth's own
session-cookie handling and `SameSite` defaults; explicit CSRF protection
for state-changing routes is tracked in `docs/architecture/risks.md` R-9.

## Consequences
- Positive: security review surface for this revision is small — it reuses
  audited primitives rather than adding parallel ones.
- Negative: R-9 (CSRF) and R-1 (RLS) remain open; both are named, scoped,
  and prioritized in the risk register rather than assumed handled.
