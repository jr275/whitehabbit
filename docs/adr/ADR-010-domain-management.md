# ADR-010: Domain/subdomain management deferred to the public-site app

## Status
Superseded by Phase 4 (2026-08). Domain management is now implemented —
see `lib/domains/*`, `migrations/0004_durable_workflows.sql`, and
ADR-018 for the implementation decision. The deferral rationale below is
kept for history; `apps/public-site` never materialized as a separate
app — instead `proxy.ts` (the renamed `middleware.ts`, Node.js runtime
as of this fork's Next v16) does real host-based tenant resolution
in-process, which is what made building this now practical without the
separate app this ADR originally waited on.

## Context
§57 requires tenant-configurable domains/subdomains/custom domains/SSL/
canonical host, decoupled from any single DNS provider. This is entirely a
public-site rendering concern (ADR-007) — there is nothing to bind a domain
to until pages exist to serve.

## Decision
Defer domain management schema and UI until `apps/public-site` (ADR-007)
exists. When built, model it as `TenantDomain (org_id, project_id, hostname,
verification_status, ssl_status, is_primary)`, verified via a DNS TXT/CNAME
challenge, provider-agnostic (no hard dependency on Vercel's or any single
registrar's API beyond an abstraction interface — mirroring ADR-008's
provider-abstraction pattern).

## Consequences
- Positive: no speculative domain-verification code sits unused.
- Negative: `Project.primary_domain` (this revision's `projects` table, used
  only as a descriptive/onboarding field today) is not yet a verified,
  enforced binding — it's a plain text column, not a security boundary.
  This is stated explicitly in `docs/architecture/domain-model.md` so it is
  never mistaken for one.
