# ADR-000: Evolve the existing Next.js app in place, defer the Turborepo monorepo split

## Status
Accepted.

## Context
The product brief specifies a `apps/*` + `packages/*` Turborepo from day one
(control-plane, public-site, admin, api, worker, crawler, docs; ~30 domain
packages). The actual repository is a single, working, deployed Next.js 16
App Router application with a real Postgres schema, real auth, a real agent
runtime, and a real product catalog (`lib/products/catalog.ts`) already
selling three verticals including "Programmatic SEO." It is not a green
field, and it already meets the brief's own quality bar in several places
(tenant isolation derived from session, not client input; no fabricated
data; structured reason codes; real cost accounting).

## Decision
Do not migrate to a monorepo now. Continue building inside this application,
using `lib/<domain>/` module boundaries whose names and internal shape
mirror the target `packages/*` split (e.g. `lib/knowledge`, `lib/opportunity`,
`lib/agent`, `lib/security`) so each can be lifted into a real workspace
package later with import-path changes only, not a redesign.

Two concrete triggers move this repo to a monorepo, in order:
1. A second genuinely separate deployable is built — a real `public-site`
   Next.js app serving generated programmatic pages, or a real out-of-request
   `worker` process for long-running agent/crawl jobs (see ADR-003, ADR-007).
   At that point `pnpm`/Turborepo workspaces earn their keep because there
   are actually ≥2 deployables sharing code.
2. `lib/` genuinely becomes unwieldy for the team working in it (measured by
   review friction / merge conflicts / onboarding time), not by a fixed
   file count.

## Consequences
- Positive: zero migration risk taken on before it's earned; every new
  domain package is designed with the eventual package boundary in mind, so
  the later extraction is close to mechanical.
- Positive: the existing, already-hardened auth/session/rate-limit/audit
  layer keeps working unmodified; new domains (Knowledge Graph, Opportunity
  Engine) plug into `requireSession()` exactly like `workers` do today.
- Negative: until the split happens, `lib/` has no build-level enforcement
  against accidental cross-domain coupling (a real package boundary would
  give that for free via package.json dependencies). Mitigation: each new
  `lib/<domain>/` directory only imports `lib/db/client`, its own model, and
  explicitly-named sibling domains in a top comment — reviewed like a
  package dependency list would be.
- Negative: `apps/worker`, `apps/crawler`, `apps/public-site` do not exist —
  every long-running or public-rendering capability described in the brief
  is still design-only until one of the two triggers above fires. This is
  named explicitly in `docs/architecture/risks.md`, not discovered later.
