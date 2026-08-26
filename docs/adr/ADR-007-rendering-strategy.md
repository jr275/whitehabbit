# ADR-007: Public-site rendering is a separate future app, not a route added to the control plane

## Status
Accepted (design-only — no code in this revision).

## Context
The brief's §6/§27/§29 public-site requirements (tenant-configurable
`RouteTemplate`s rendering to `/[market]/[city]/[entity]/[intent]`-shaped
paths, SSR/ISR/on-demand revalidation, edge caching, sitemap shards) describe
a workload with very different characteristics from the authenticated
control-plane app that exists today: high-volume, unauthenticated, cache-
heavy, public traffic vs. low-volume, authenticated, mutation-heavy
dashboard traffic.

## Decision
When the Page Engine (ADR-006 follow-on) produces real, approved,
publishable content, it will be served by a second Next.js application
(`apps/public-site` in the eventual monorepo layout — see ADR-000), not by
adding public routes to this control-plane app. Reasons: separate caching/
revalidation policy, separate domain/subdomain binding (§57), separate
security posture (no session/auth surface to attack on the public side), and
independent scaling.

This ADR is intentionally decision-only: no `public-site` code exists yet
because no Page Engine exists yet to feed it (ADR-006). Building the
rendering shell before there's real content to render would be exactly the
"optimize for the demo" anti-pattern the brief warns against. It is recorded
now so the Page Engine (when built) is designed with the eventual API
boundary in mind: Page/PageVersion rows and a `RouteTemplate` model, not
React components colocated with control-plane pages.

## Consequences
- Positive: the control-plane app's existing auth/session model never has to
  reason about unauthenticated public traffic.
- Positive: matches ADR-000's monorepo trigger #1 exactly — this is the
  point at which a second real deployable justifies workspace tooling.
- Negative: until built, there is no way to actually publish and view a
  generated page — the vertical slice (§76, `docs/architecture/
  vertical-slice.md`) stops at "Approve Opportunity" in this revision, not
  at "Render Next.js page." Named, not hidden.
