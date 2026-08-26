# ADR-016: Vertical-slice execution ledger and minimal in-app public rendering

## Status
Accepted. Amends ADR-003 (agent orchestration) and ADR-007 (rendering
strategy) with two concrete decisions discovered while building the first
real end-to-end vertical slice (website → crawl → knowledge graph →
opportunity → page → public render).

## Decision 1: `agent_runs`/`agent_run_steps`, not a reuse of `executions`

`executions`/`execution_events` (ADR-003) are structurally tied to a Worker:
`executions.worker_id` is `NOT NULL REFERENCES workers(id)`, and the whole
shape assumes one operator-configured Worker running one Skill. Website
discovery and content generation are project-level system pipelines with no
Worker involved — forcing them through `executions` would mean fabricating a
synthetic "system Worker" per org purely to satisfy a foreign key, which is
exactly the kind of accidental complexity a smallest-reusable-abstraction
call should avoid.

Decision: add a parallel, equally durable ledger — `agent_runs` (≈ AgentRun)
and `agent_run_steps` (≈ AgentStep) — scoped by `org_id`/`project_id`
directly, carrying `pipeline` (`website_discovery` | `content_generation`)
and `subject_type`/`subject_id` (which website or opportunity this run is
for) instead of a worker id. Same durability discipline as `executions`:
every step persisted as it completes, real cost/token accounting per step,
no fabricated state. `executions` is unchanged and keeps serving Worker/
Skill runs exactly as before.

Consequence: the codebase now has two execution ledgers with a similar
shape. This is accepted, not accidental — see ADR-003's own note that a
durable-workflow migration (Temporal or equivalent) is the real long-term
answer once a genuinely long-running, resumable pipeline exists; when that
migration happens, both `executions` and `agent_runs` are candidates to
converge on the same workflow-engine-backed representation. Duplicating the
ledger shape now is cheaper than either forcing an awkward reuse or
building the durable-workflow migration before this slice needs it.

## Decision 2: public rendering ships inside this app now, not a separate `apps/public-site`

ADR-007 deferred public rendering to a second Next.js app, explicitly
"when the Page Engine ... produces real, approved, publishable content."
That content now exists. Building a full second deployable app mid-slice
(separate package.json, deployment target, domain binding) is real risk to
an otherwise-working single-app repository for a slice whose job is to
*prove the mechanism*, not scale it.

Decision: add the smallest possible public render surface inside this app —
an unauthenticated route resolving one page by `(projectId, slug)`
(`app/sites/[projectId]/[slug]/page.tsx`), a global `app/sitemap.xml/route.ts`
listing every `PUBLISHED` page, and JSON-LD generated at publish time and
stored on the immutable `page_versions.schema` column. The resolution is
isolated behind one function (`resolvePublishedPage(projectId, slug)` in
`lib/pages/repo.ts`) so that introducing a real `RouteTemplate` engine later
means replacing what calls that function, not redesigning the render path.
No domain binding (ADR-010 still deferred) — pages are reachable by project
id, not a tenant's own domain, which is an accepted, temporary limitation of
proving the mechanism before ADR-010's trigger (a real `apps/public-site`)
is reached.

Consequence: ADR-007's separate-app plan stands as the long-term direction;
this decision is a documented, deliberate detour to avoid overbuilding
before the slice proves the loop end-to-end. The trigger to actually build
`apps/public-site` is unchanged from ADR-007/ADR-000: a real second
deployable becomes worth its own workspace once page volume or domain-
binding requirements exceed what a single in-app route can honestly serve.
