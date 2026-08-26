# ADR-018: Real DNS-verified domains; server-side host→tenant resolution never trusts client input

## Status
Accepted. Supersedes the "deferred" position in ADR-010.

## Context
ADR-010 deferred domain management until a separate public-site app
existed. That app never materialized — Phase 3 instead rendered published
pages from the main Next.js app at `/sites/:projectId/:slug`, and Phase 4
requires the platform to also serve a tenant's real domain/subdomain,
verified before any content is served from it.

This is a real security boundary: a request's `Host` header is
attacker-controlled input. Resolving it to a tenant incorrectly — or
resolving an unverified domain at all — would let one tenant's content (or
credentials-adjacent surface) be served under a hostname it does not
actually control.

## Decision
1. `domains` and `domain_verifications` are real tables
   (`migrations/0004_durable_workflows.sql`). Creating a domain
   (`lib/domains/repo.ts#createDomain`) always starts `pending` with a real
   random `verificationToken` (`randomBytes(16)`) — never auto-verified.
2. Verification (`lib/domains/verification.ts`) performs a real DNS lookup
   — `dns_txt` (a TXT record at `_whitehabbit-verify.<hostname>` matching
   the token) or `dns_cname` (a CNAME to `<token>.<verify-host>`) — via
   `node:dns/promises`. Every attempt, success or failure, is recorded
   (`domain_verifications`); only a real successful lookup marks the domain
   `verified`.
3. `resolveVerifiedDomain(hostname)` is the **only** function the public
   render path may call to turn a request's Host header into a tenant. It
   takes no `orgId`/`projectId` parameter — the hostname is the untrusted
   input, the verified row is the only trusted output — and returns `null`
   for anything not `verification_status = 'verified'`, no matter how
   plausible the hostname looks.
4. `proxy.ts` (the renamed `middleware.ts`) calls `resolveVerifiedDomain`
   for any non-platform host and rewrites to `/sites/:projectId/:slug` only
   on a real match; otherwise it falls through to `NextResponse.next()` —
   it never silently serves platform content on an unrecognized or
   unverified host. This is possible in-process (no separate app, no Edge
   workaround) because this fork's Proxy defaults to the Node.js runtime as
   of Next v16.0.0, which can hold a real `pg` connection — a genuine
   capability this fork provides that the deferred ADR-010 assumed away.
5. `CanonicalUrlService` (`lib/domains/canonical.ts`) prefers a project's
   verified primary domain for a published page's canonical URL, falling
   back to the platform's own `/sites/:projectId/:slug` path when no domain
   is verified yet — a page is never left without a valid canonical URL
   while a tenant's domain verification is still pending.

## Consequences
- Positive: no domain is ever treated as owned by a tenant without a real,
  independently-observable DNS fact proving it — adversarial tests in
  `tests/security/phase4-tenant-isolation.test.ts` assert a `pending`
  domain resolves to `null` and that a hostname already claimed by one
  tenant is rejected for another.
- Positive: hostname registration is global-unique (`UNIQUE(hostname)`) —
  a hostname belongs to exactly one tenant, matching how every real hosting
  platform's domain claiming works; a second tenant registering an
  already-claimed hostname gets a real `DuplicateHostnameError`, not a
  silent overwrite.
- Negative: no SSL/TLS provisioning is implemented — verifying DNS control
  is necessary but not sufficient for safely serving HTTPS on a custom
  domain in production; this is tracked honestly in
  `docs/architecture/risks.md`, not claimed as done.
- Negative: `verifyDomain` is triggered explicitly (`POST
  /api/v1/domains/:id/verify`), not re-checked on a schedule — a domain
  whose DNS later changes to point elsewhere stays `verified` in this
  revision until someone re-triggers a check. Scheduled re-verification is
  future work.
