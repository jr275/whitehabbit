# Architectural Risks & Missing Requirements

Numbered so ADRs and the roadmap can reference them (`R-n`). Each has a
trigger condition, not just a description — "known and deferred" is only
honest if the deferral condition is written down.

| ID | Risk / missing requirement | Where named | Trigger to address |
|---|---|---|---|
| R-1 | Tenant isolation is application-layer only; no PostgreSQL RLS | ADR-001 | Before onboarding tenants whose contractual/compliance requirements demand defense-in-depth beyond app-layer checks; or opportunistically once the Phase-2 schema (this revision) stabilizes. |
| R-2 | Only two membership roles (owner/member); brief's full role set (OWNER/ADMIN/EDITOR/ANALYST/AGENT_OPERATOR/VIEWER) not implemented | ADR-001 | First feature that needs to distinguish, e.g., who can approve an Opportunity vs. who can only view one. |
| R-3 | No automated "Tenant A must never access Tenant B" test suite (brief §72 explicitly mandates this) | ADR-001 | Should be written concurrently with Phase 2/3 work, not deferred further — highest-priority test gap in this codebase today. |
| R-4 | No real Entity Resolution (candidate→review→merge); today's dedupe is exact name+type match only | ADR-002, ADR-009 | A second entity-producing ingestion path (e.g. real crawler in Phase 3) that can plausibly name the same real-world thing differently. |
| R-5 | Autonomy levels (§25, LEVEL 0–4) not configurable per tenant; every write/publish/financial/external-comm tool action requires approval unconditionally today | ADR-003 | Before any tenant needs LEVEL 2+ (AI-initiated low-risk publishing) — currently no publishing capability exists at all, so this is not yet blocking anything. |
| R-6 | No webhook delivery, no domain-event bus, no transactional outbox | ADR-004 | First real external consumer of a domain event (a webhook subscriber or a cache/search-index updater in Phase 6). |
| R-7 | Most Opportunity score components are NULL (demand/trend/business value/competition/authority gap/information gain/citation potential/cannibalization risk) | ADR-006, ADR-015 | Phase 7 — each integration (Search Console, trend source, Information Gain service) fills in exactly one column when it ships. |
| R-8 | No model routing (cheap vs. strong model per task) | ADR-008 | First task cheap enough to not need the default reasoning model — a candidate is entity-name dedupe in `lib/knowledge` once Phase 3's crawler produces higher entity volume. |
| R-9 | No explicit CSRF token on state-changing routes beyond NextAuth's session-cookie SameSite defaults | ADR-011 | Should be addressed alongside R-3 in priority — recommend before this revision's new mutation endpoints (`PATCH /api/opportunities/:id`) see production traffic from a UI with cross-origin exposure. |
| R-10 | No metrics/tracing backend beyond structured logs + querying Postgres directly | ADR-012 | Once execution volume makes ad-hoc Postgres queries insufficient for operational visibility, or Phase 4/6 creates a second process to correlate against. |
| R-11 | Opportunity field edits (once an edit UI exists) have no version history, only current-state + audit log of status transitions | ADR-014 | Before shipping free-text editing of an Opportunity's title/outline (not built in this revision — approve/reject only). |
| R-12 | `getOrCreateDefaultProject()` means multi-project-per-tenant is schema-ready but not yet a real onboarding flow — every org effectively has exactly one Project today | Domain model | Phase 3's real website-onboarding flow (§9) should let a tenant explicitly create/name additional Projects rather than relying on the lazy default. |
| R-13 | `Project.primary_domain` is a free-text field, not a verified/enforced domain binding | ADR-010 | Phase 6, when `apps/public-site` needs a real, verified domain to route on. |
| R-14 | No durable workflow engine; long-running/resumable agent steps are not yet possible | ADR-003 | Phase 4, required before Phase 5's multi-agent Content Factory can be built safely. |
| R-15 | Monorepo/package split not done; `lib/` has no build-enforced dependency boundaries between domains | ADR-000 | Either roadmap Phase 6 (second real deployable) or `lib/` becoming unwieldy by team feedback, whichever comes first. |

## Missing requirements carried forward without a risk ID (explicitly out of
this revision's and near-term roadmap's scope, restated here so they are not
silently forgotten)

- Community Signal Engine (§21) — needs a real community-source integration
  first; no such integration exists.
- Deep Data Engine / DataSourceDiscoveryAgent (§20) — needs a target page
  type to know what "better than competitors" means for; sequenced after
  Phase 5/6.
- White-label / second demo vertical proof (§77, "Acme Travel") — the
  generic `entity_type` free-text design (ADR-002, domain model) already
  makes this possible without core changes; the proof itself (seeding a
  second tenant with a non-real-estate ontology) is a Phase 3+ demo task,
  not an architecture task, and should be done once there's a real second
  Project/onboarding flow to seed it through.
