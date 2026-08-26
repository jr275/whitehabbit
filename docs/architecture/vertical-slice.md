# First Vertical Slice (brief §76)

The brief's mandated end-to-end slice:

> Create Tenant → Create Project → Connect Website → Crawl Website → Build
> Website Knowledge Profile → Extract Entities → Create Knowledge Graph →
> Discover Opportunities → Score Opportunities → Approve Opportunity →
> Generate Page → QA → Publish → Render Next.js page → Generate Schema →
> Add Internal Links → Sitemap → Measure

## Status: the full chain is real and passing, end to end

As of this revision, **every step through "Render Next.js page → Generate
Schema → Add Internal Links → Sitemap" is implemented, persisted, and
covered by `tests/e2e/vertical-slice.test.ts`**, which runs the entire
chain through the real API route handlers (not reimplemented test logic)
against a real Postgres database, with only the true network boundary
faked (a deterministic fixture website — §33 — never a live production
site). "Measure" (real Search Console/AI-visibility feedback) remains out
of scope, named below.

| Step | Status | Where |
|---|---|---|
| Create Tenant | ✅ real | `createUserWithOrganization` (pre-existing) |
| Create Project | ✅ real | `lib/projects/repo.ts` (previous revision) |
| Connect Website | ✅ real | `lib/websites/repo.ts`, `POST /api/projects/:id/websites` |
| Crawl Website | ✅ real, bounded, SSRF-safe | `lib/crawler/*` |
| Build Website Knowledge Profile | ✅ real, deterministic, confidence-scored | `lib/knowledge-profile/*` |
| Extract Entities | ✅ real, evidence-first, from structured data + text heuristics | `lib/knowledge/extraction.ts` |
| Entity Resolution | ✅ real, threshold-based (auto-merge/review/distinct), auditable | `lib/knowledge/resolution.ts` |
| Create Knowledge Graph | ✅ real | `entities`/`entity_relationships`/`entity_evidence` (previous revision), now actually populated from crawl data |
| Discover Opportunities | ✅ real, deterministic gap analysis, capped at 20/run | `lib/opportunity/discovery.ts` |
| Score Opportunities | ✅ real, explainable, Known/Estimated/Unavailable | `lib/opportunity/scoring.ts`, `lib/opportunity/information-gain.ts` |
| Approve Opportunity | ✅ real, audited | `PATCH /api/opportunities/:id` (previous revision) |
| PageBrief | ✅ real, derived from actual Knowledge Graph state | `lib/pagebrief/build.ts` |
| Generate Page (Research→Outline→Draft→SEO→GEO→Quality) | ✅ real, each step a persisted artifact + agent_run_step | `lib/content-pipeline/*` |
| QA (Quality Gate) | ✅ real, can reject with explicit reasons | `lib/content-pipeline/quality.ts` |
| Page + PageVersion | ✅ real, immutable versions | `lib/pages/*` |
| Publish | ✅ real, explicit human action | `POST /api/pages/:id/publish`, `lib/pages/publish.ts` |
| Render Next.js page | ✅ real, minimal in-app route (ADR-016) | `app/sites/[projectId]/[slug]/page.tsx` |
| Generate Schema (JSON-LD) | ✅ real, validated before publish | `lib/pages/json-ld.ts` |
| Add Internal Links | ✅ real, relationship-based, capped at 5/page | `lib/internal-links/*` |
| Sitemap | ✅ real, global, dynamic | `app/sitemap.xml/route.ts` |
| Measure | ⚠️ operational metrics only | growth measurement still needs Search Console (Phase 7, unchanged) |

## What's still honestly partial

- **Synchronous, in-process execution** (ADR-003/ADR-016): both the
  discovery pipeline and the content-generation pipeline run inside one
  HTTP request. Fine for this slice's bounded limits (≤25 pages, one
  Writer LLM call); real durability/resumability still needs the Phase 4
  workflow-engine migration.
- **No public domain binding** (ADR-010 still deferred): a published page
  is reachable at `/sites/:projectId/:slug` inside this app, not the
  tenant's own domain.
- **The Draft step's LLM call** is the one place real content quality
  depends on a configured LLM credential; `LLM_DEV_MODE=true` produces a
  deterministic, clearly-labeled fixture (now content-aware — it echoes
  the real target intent and research claims it was given, not generic
  boilerplate — see `lib/agent/tools/llm-providers/development.ts`) so the
  full pipeline, including the Quality gate, is exercisable and testable
  without a real API key.
- **Entity extraction is structured-data-first**: JSON-LD on the crawled
  pages is the primary, highest-confidence source; a lightweight text
  heuristic (question-shaped sentences) supplements it. A site with
  neither will still crawl and profile correctly, just discover few or no
  entities/opportunities — an honest empty result, never a fabricated one.

## Multi-vertical proof (§77)

`tests/e2e/vertical-slice.test.ts` runs the entire chain against
`tests/e2e/fixture-website.ts` — a deliberately generic "consulting/
support services" business, not real estate — proving the same
extraction/scoring/generation code produces a correct result for an
unrelated vertical with zero code changes. Seeding a second named demo
tenant (the brief's literal "Acme Travel", §77) beyond the automated test
fixture remains a Phase 3+ demo task, not an architecture change — the
schema and pipeline already support it.
