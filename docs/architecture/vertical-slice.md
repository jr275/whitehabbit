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
| Generate Page (Research→Outline→Draft→SEO→GEO→FactCheck→Quality) | ✅ real, checkpointed `WorkflowRun`, each step a persisted artifact + resumable step | `lib/content-pipeline/*`, `lib/workflow/*` |
| QA (Quality Gate) | ✅ real, can reject with explicit reasons, now including a real fact-verification gate | `lib/content-pipeline/quality.ts`, `lib/content-pipeline/fact-check.ts` |
| Page + PageVersion | ✅ real, immutable versions, classified against a `RouteTemplate` when one matches | `lib/pages/*`, `lib/route-templates/*` |
| Approval / Autonomy gate | ✅ real, backend-only decision — LEVEL_0/1 always pauses for a human; LEVEL_2–4 may auto-publish only under named, testable conditions | `lib/workflow/approval.ts`, `lib/workflow/autonomy.ts` |
| Publish | ✅ real — either an explicit human action (`POST /api/pages/:id/publish`) or an autonomy-gated auto-publish from the resumed workflow | `lib/pages/publish.ts` |
| Render Next.js page | ✅ real, minimal in-app route (ADR-016) | `app/sites/[projectId]/[slug]/page.tsx` |
| Generate Schema (JSON-LD) | ✅ real, validated before publish | `lib/pages/json-ld.ts` |
| Add Internal Links | ✅ real, relationship-based, capped at 5/page | `lib/internal-links/*` |
| Sitemap | ✅ real, global, dynamic | `app/sitemap.xml/route.ts` |
| Measure | ⚠️ operational metrics only | growth measurement still needs Search Console (Phase 7, unchanged) |

## What's still honestly partial

- **A single orchestrator call still runs synchronously within one HTTP
  request** (`docs/architecture/risks.md` R-16): Phase 4 (ADR-017) made
  both pipelines checkpointed and resumable *between* steps — a crashed or
  killed process resumes past already-succeeded work rather than
  restarting — but a step itself is not yet dispatched as its own
  independently-scheduled job, so an unusually slow single step can still
  approach a serverless function's real timeout within one call.
- **Domain binding is now real** (ADR-018 supersedes ADR-010): a tenant can
  register and DNS-verify a real domain (`lib/domains/*`), and
  `proxy.ts` resolves a verified host to the right tenant server-side. A
  page's canonical URL prefers a verified domain and falls back to
  `/sites/:projectId/:slug` only while none is verified yet. TLS/SSL
  provisioning for the custom domain itself is not implemented (risks.md
  R-20).
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

## The autonomous loop, closed (Phase 7, ADR-038)

The full brief's closing chain — Signal → Correlation → Observation →
Decision → (human) Approval → real ActionPlan → real AgentRun/WorkflowRun
→ the SAME durable pipeline this document describes above → Information
Gain V2 → Content → QA → Publish → Outcome → Learning → the next Decision
— is now real end to end, proven by
`tests/integration/decision-action-bridge.test.ts`: a well-evidenced
entity's real `CREATE_PAGE` Decision, once approved, is really dispatched
through `lib/intelligence/action-executor.ts` into the exact same real
Research→Outline→Draft→SEO→GEO→Quality→decide/publish pipeline this
document's own vertical slice already proves — no second, parallel
content pipeline was built for Decision-originated pages. A thin,
under-evidenced entity's `CREATE_PAGE` Decision is instead honestly
`BLOCKED` by the same real Information Gain V2 gate (ADR-031) the rest of
this pipeline already enforces, proven in the same test file. See
ADR-038/039 for the full design and `docs/architecture/roadmap.md`'s
Phase 11 entry for what remains open (six unsupported action types,
automatic dispatch retry).

## Multi-vertical proof (§77)

`tests/e2e/vertical-slice.test.ts` runs the entire chain against
`tests/e2e/fixture-website.ts` — a deliberately generic "consulting/
support services" business, not real estate — proving the same
extraction/scoring/generation code produces a correct result for an
unrelated vertical with zero code changes. Seeding a second named demo
tenant (the brief's literal "Acme Travel", §77) beyond the automated test
fixture remains a Phase 3+ demo task, not an architecture change — the
schema and pipeline already support it.
