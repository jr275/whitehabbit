# ADR-020: Durable approvals and a backend-only autonomy policy — an LLM never decides its own permission

## Status
Accepted.

## Context
Phase 3 had no real approval gate for publication — a page that passed
quality checks published immediately. Phase 4 requires a durable
human-in-the-loop mechanism (a workflow can be genuinely paused awaiting a
human, survive a process restart, and resume exactly once on a real
decision) and an explicit autonomy policy (LEVEL_0–4) that is evaluated
entirely by the backend, never by asking the LLM "should you publish this?".

## Decision
1. `approvals` is a real table (`lib/workflow/approval.ts`).
   `requestApproval()` inserts a row **and** transitions the workflow to
   `WAITING_APPROVAL` in one action — a workflow can never report "waiting
   approval" without a corresponding durable, reviewer-visible row.
2. `decideApproval()` is the only writer of an `approved`/`rejected`
   decision, and it always runs as the authenticated reviewer resolving the
   API request (`app/api/v1/approvals/[id]/approve|reject/route.ts`) — never
   the agent that requested the approval. Approving resumes the workflow;
   rejecting fails it with the reviewer's real, stored reason — never
   silently.
3. `getApprovalForArtifact()` gives a resumed workflow an idempotent check:
   "has a human already decided this exact artifact+approval-type", so a
   resumed run never re-asks for a decision that already exists, and a
   double-resume never double-publishes.
4. `evaluatePublishAutonomy()` (`lib/workflow/autonomy.ts`) is a pure,
   synchronous function over already-computed facts (information-gain
   score, quality score, risk classification, fact-verification status,
   schema validity) and a project's configured `AutonomyLevel`. LEVEL_0/1
   always require approval, unconditionally, regardless of how high the
   scores are. LEVEL_2 auto-publishes only content the platform's own
   deterministic classifier (`lib/content-pipeline/risk.ts`) has called
   low-risk. LEVEL_3/4 auto-publish only if every named condition holds —
   every failure is a real, human-readable reason, never a bare `false`.
5. Risk classification (`classifyContentRisk`) is regex-based pattern
   matching against regulated-topic language (medical/legal/
   financial/safety), documented honestly as a conservative heuristic —
   it never claims `high`/`critical` risk without a stronger signal than
   this revision has, and errs toward requiring human review rather than
   under-classifying risk.

## Consequences
- Positive: `tests/integration/durable-workflow.test.ts` proves the full
  request→pause→decide→resume cycle against real Postgres, proves rejection
  really fails the workflow with the stored reason, and proves LEVEL_0/1
  never auto-publish even when every quality signal is maximal — the
  guarantee "never let an LLM decide its own permission" is enforced by
  which function is allowed to call `decideApproval`/`workflowEngine.resume`
  (an authenticated human via an API route), not by asking a model to
  self-report.
- Positive: expired approvals (`expireOverdueApprovals`) are handled
  explicitly — a request past its `expiresAt` is marked `expired` and its
  workflow fails with a real reason, never left silently pending forever.
- Negative: reviewer authorization today is "any authenticated member of
  the tenant org" — there is no separate reviewer role distinct from any
  other org member yet. A finer-grained reviewer permission is real future
  work, named in `docs/architecture/risks.md`.
- Negative: `classifyContentRisk`'s regex patterns are a starting set, not
  an exhaustive regulated-topic taxonomy — expect false negatives on risk
  language it doesn't yet recognize; this is why LEVEL_2/3/4 additionally
  gate on quality/information-gain/fact-verification, not risk
  classification alone.
