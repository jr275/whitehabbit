# First Vertical Slice (brief §76)

The brief's mandated end-to-end slice:

> Create Tenant → Create Project → Connect Website → Crawl Website → Build
> Website Knowledge Profile → Extract Entities → Create Knowledge Graph →
> Discover Opportunities → Score Opportunities → Approve Opportunity →
> Generate Page → QA → Publish → Render Next.js page → Generate Schema →
> Add Internal Links → Sitemap → Measure

This must work end-to-end before expanding horizontally (§76). It is a long
chain; this document states, honestly, how much of it is real today, what
this revision adds, and what remains — rather than claiming the whole slice
is done.

| Step | Status before this revision | Status after this revision |
|---|---|---|
| Create Tenant | ✅ real (`createUserWithOrganization`) | unchanged |
| Create Project | ❌ no concept of Project | ✅ real — `projects` table + `getOrCreateDefaultProject()`; not yet a dedicated onboarding UI (R-12) |
| Connect Website | ⚠️ approximated — Programmatic SEO product onboarding asks text questions about the site, no URL/crawl | unchanged this revision — real URL-driven onboarding is Phase 3 |
| Crawl Website | ❌ no crawler | unchanged — Phase 3 (`WebsiteDiscoveryAgent`) |
| Build Website Knowledge Profile | ❌ | unchanged — Phase 3 |
| Extract Entities | ❌ | ⚠️ partial — `lib/opportunity/ingest.ts` creates lightweight `Topic` entities from the SEO Opportunity skill's LLM-identified topics (real, but derived from web-search results about the topic area, not from crawling the tenant's own site) |
| Create Knowledge Graph | ❌ no schema | ✅ real — `entities`/`entity_relationships`/`entity_evidence` tables + `lib/knowledge` |
| Discover Opportunities | ⚠️ real but ephemeral — `skill_seo_opportunity` already does real, source-grounded discovery, but the result lived only in one `outputs` row | ✅ real and persistent — same discovery, now written to `opportunities` |
| Score Opportunities | ❌ no persisted score, only an ephemeral per-run quality evaluation | ✅ real, explicitly partial — 3 of ~10 components computed (ADR-006); rest `NULL` until Phase 7 |
| Approve Opportunity | ❌ | ✅ real — `PATCH /api/opportunities/:id` with audit log |
| Generate Page | ❌ | unchanged — Phase 5/6, and gated by Information Gain (ADR-015) which cannot pass yet |
| QA | ❌ | unchanged — Phase 5 |
| Publish | ❌ | unchanged — Phase 6 |
| Render Next.js page | ❌ | unchanged — Phase 6, `apps/public-site` (ADR-007) |
| Generate Schema | ❌ | unchanged — Phase 6 |
| Add Internal Links | ❌ | unchanged — depends on Knowledge Graph (now real) + Page Engine (not yet) |
| Sitemap | ❌ | unchanged — Phase 6 |
| Measure | ⚠️ operational metrics only (`metrics` table) | unchanged — growth measurement needs Search Console (Phase 7) |

## What "done" means for this revision specifically

This revision's scope is exactly: **Create Project → Discover Opportunities
→ Create Knowledge Graph → Score Opportunities → Approve Opportunity**,
built on the existing, already-real Tenant and Discover-Opportunities
capability. It does not claim to complete the full §76 chain — the chain's
remaining half (Generate Page through Measure) is sequenced in
`docs/architecture/roadmap.md` Phases 3, 5, and 6, each with its own real
prerequisite (a crawler, a durable workflow engine, a public rendering app)
rather than being skipped for being hard.

## Multi-vertical proof (§77)

Not exercised in this revision — no second tenant/Project was seeded. The
schema is designed to support it without core changes: `entities.entity_type`
is free text (ADR-002), `opportunities` carries no real-estate-specific
column, and `lib/products/catalog.ts`'s existing "Content Intelligence" /
"Discover" products already prove the vertical-independence pattern at the
product-template layer. The actual "Acme Travel" seed-and-demonstrate task
(§77) is listed in `docs/architecture/risks.md`'s missing-requirements
section as a Phase 3+ demo task, not an architecture change.
