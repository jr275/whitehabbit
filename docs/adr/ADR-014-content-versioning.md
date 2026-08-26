# ADR-014: Opportunity lifecycle is versioned by status transition + audit log, not by row mutation history

## Status
Accepted for this revision's scope; Page/PageVersion immutability (§26) is a
separate, larger decision deferred to the Page Engine.

## Context
The brief's §26 requires immutable, versioned content (`Page`/`PageVersion`)
once real publishable content exists. This revision does not create content
— it creates Opportunities, which are pre-content planning artifacts with a
lifecycle (`discovered → approved/rejected`, this revision's implemented
subset of the brief's fuller status list in §17).

`lib/opportunity/ingest.ts` is the one write path that creates Opportunity
rows: it runs immediately after `lib/agent/runtime.ts` persists a
`skill_seo_opportunity` output, non-fatally (a failure here never fails the
underlying Skill execution — mirroring the existing `appendWorkerMemory()`
call's own try/catch pattern in the same file), and links back to the exact
`execution_id`/`output_id` that produced it — real provenance to the agent
run, not a detached record.

## Decision
Opportunities transition status via a real API call
(`PATCH /api/opportunities/[id]`) that writes `status` + `reviewed_by` +
`reviewed_at` and records an audit-log entry (`opportunity.approve` /
`opportunity.reject`) — the audit log, not a `opportunity_versions` table,
is this revision's record of "what changed and who did it," matching how
`worker.status` transitions are audited today. A full immutable version
history (à la `worker_versions`' build/release/archive pattern) is the right
model once Opportunities produce actual generated `Page`/`PageVersion`
content (§26) that itself needs rollback — building that machinery for a
pre-content planning row would be speculative.

## Consequences
- Positive: reuses the exact audit pattern already proven for Workers; no
  new versioning concept introduced for a lifecycle that doesn't yet need
  one.
- Negative: an Opportunity's own field values (title/outline/scores) are
  mutable in place today — there is no "what did this Opportunity look like
  before an operator edited it" history. Acceptable because no edit UI
  exists yet (this revision is approve/reject only, not free-text editing);
  tracked in `docs/architecture/risks.md` R-11 for whenever editing ships.
