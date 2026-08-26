# ADR-005: Provenance is a first-class column set, not a convention

## Status
Accepted.

## Context
The existing codebase already treats "never fabricate" as load-bearing: every
`WorkerOutput.sources` field carries real `SourceRecord[]` (title/url/
provider/snippet) from the actual web-search call that produced it, and every
`SkillEvaluation` is computed from real structural checks — the runtime types
file states it outright: "never Math.random." The Knowledge Graph introduced
in this revision needed the same discipline applied to facts about entities,
per the brief's §13.

## Decision
`entity_evidence` (ADR-002) is the provenance record for any fact attached to
an entity: `source_url, source_type, retrieved_at, confidence,
verification_status`. `verification_status` is one of `verified | unverified
| conflicting | stale | deprecated` — matching the brief's §13 states
exactly — and defaults to `unverified`: nothing is inserted as `verified`
by the current ingestion path (ADR-014), because nothing in this revision
does the cross-checking that would earn that label. A future
`FactCheckAgent` (§53) is what is allowed to write `verified`/`conflicting`;
until it exists, claiming `verified` would itself be a fabrication.

Opportunity score components (ADR-006) follow the same rule at the numeric
level: a component whose real input data doesn't exist yet (demand, trend,
competition — all require integrations not yet connected) is stored as SQL
`NULL`, never a synthesized placeholder number, and the API/UI must render
`NULL` as "not yet available," never as `0` or an invented value.

## Consequences
- Positive: extends this codebase's existing, tested honesty invariant
  (`notYetConnected` product disclosure, `executionMode: "development"`
  tagging, `costUsd: undefined` when no rate is configured) into the new
  Knowledge Graph and Opportunity domains rather than introducing a second
  standard.
- Positive: any future consumer (a UI, an export, an AI-visibility report)
  can rely on "absent means genuinely unknown" without per-field special
  casing.
- Negative: this is enforced by convention and code review, not a database
  constraint that forbids a "verified" insert without a matching
  `FactCheckAgent` run — tracked as a lighter-weight follow-up, not blocking
  this revision.
