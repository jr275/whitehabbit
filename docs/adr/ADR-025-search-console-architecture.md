# ADR-025: Search Console — real schema now, two honest ingestion paths (manual import + gated live OAuth)

## Status
Accepted.

## Context
The brief requires a real Search Console integration architecture — property/query/page/date/clicks/impressions/ctr/position, daily snapshots, all tenant-scoped — explicitly forbidding fabricated data. This deployment has no Google service-account credentials configured, so a live OAuth pull cannot be exercised end-to-end here. The brief still requires the real architecture to exist, not a placeholder.

## Decision
1. Real schema (`search_console_properties`/`_snapshots`/`search_query_observations`/`search_page_observations`, `migrations/0007`) — every row real and tenant-scoped, no synthetic seed data anywhere in production code paths.
2. Two honest ingestion paths:
   - **Manual import** (`lib/intelligence/search-console/repo.ts`, `POST /api/v1/search-console/properties/:id/import`) — a tenant (or an operator on their behalf) supplies a real GSC data export; the endpoint persists it verbatim. This is real and usable today with zero external dependency.
   - **Live OAuth** (`lib/intelligence/search-console/live.ts`) — a real service-account JWT (RS256, Node's native `crypto.createSign`) exchanged for a real access token, then a real call to the Search Analytics API. Requires `GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL`/`_PRIVATE_KEY`; throws `SearchConsoleNotConfiguredError` immediately and loudly if absent — the same "never silently degrade" discipline as `lib/db/client.ts`'s `DatabaseNotConfiguredError`. `fetchImpl` is injectable (mirroring the crawler's `SafeFetchFn` pattern) so the request-shape and error-handling logic is unit-testable without a live credential.
3. Normalization (`lib/intelligence/search-console/normalize.ts`, §13) is deterministic where possible: intent classification is a real rule-based function; entity matching is real substring matching against the project's *already-known* canonical entities — a query matching no known entity gets `entityId: null`, never a fabricated new entity invented from free text.
4. Signal detection (`lib/intelligence/search-console/signal-detection.ts`, §14) compares real period-over-period numbers against real, named thresholds (spike/decline %, a published-style CTR-by-position benchmark curve used only as an *expected* baseline, never presented as measured fact).

## Consequences
- Positive: the manual-import path means this integration delivers real value today, in any environment, with no OAuth setup — a tenant with a GSC export can use it immediately.
- Positive: the live path is real, reviewable code, not a stub — adopting it in an environment with real credentials requires zero further engineering, just configuration.
- Negative (stated honestly, not hidden): the live OAuth path is genuinely untested end-to-end in this environment — no real Google property or credential exists here to verify against. Its request/response shape and error handling are unit-tested via the injectable `fetchImpl`; the real HTTP round-trip against Google's actual API is not.
- Negative: entity matching in normalization is substring-based, not NLP-based — "apartments barra da tijuca" only resolves to a Barra da Tijuca entity if that exact name (or a close variant) is already a canonical entity in the project. A query naming an entity the Knowledge Graph doesn't know about yet correctly gets no match, rather than a fabricated one.
