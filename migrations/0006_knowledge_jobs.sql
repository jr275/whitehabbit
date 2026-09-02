-- ================================================================
-- 0006_knowledge_jobs.sql — Commit 12A: the durable ingestion job
-- engine's one new table.
--
-- Replaces bare reliance on next/server's after() (best-effort, no
-- retry, silently lost if the function terminates mid-flight — see
-- the Commit 12 audit) with a real, Postgres-backed queue. after()
-- becomes a fast-path optimization on top of this table, not the
-- only way work ever gets done.
--
-- Follows 0002_knowledge.sql's own conventions exactly: BIGINT epoch-
-- millisecond timestamps (Date.now(), not TIMESTAMPTZ/now()), prefixed
-- TEXT ids ("knj_..."), org-scoped by a NOT NULL org_id FK. No CHECK
-- constraint on `status` — 0002 doesn't put one on knowledge_items.
-- status either; validated at the application layer, same pattern.
--
-- Three job statuses, not four: "claimed" is deliberately NOT its own
-- status — it's a lease (locked_at/locked_by) on a still-`queued` row.
-- That is what makes stale-job reaping fall out of the claim query
-- for free (a lease older than LEASE_MS is simply claimable again) —
-- no separate reaper process, no separate "revert to queued" sweep.
--
--   queued  — claimable once available_at <= now AND the lease (if
--             any) is stale. Covers "never touched" and "currently
--             leased" and "leased, but that lease expired" all at
--             once — the claim query's WHERE clause is the reaper.
--   done    — terminal, success.
--   failed  — terminal, attempts exhausted (max_attempts reached).
--
-- knowledge_items gets ZERO changes in this migration. It stays the
-- one UI-facing source of truth (status/error/attempts/content_text)
-- exactly as it is today — this table is a purely internal
-- orchestration layer underneath it, not a replacement.
--
-- Migrations 0001-0005 are untouched.
-- ================================================================

CREATE TABLE IF NOT EXISTS knowledge_jobs (
  id            TEXT PRIMARY KEY,
  item_id       TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by    TEXT REFERENCES users(id),      -- mirrors knowledge_items.created_by exactly (nullable FK, no cascade)

  job_type      TEXT NOT NULL DEFAULT 'ingest',  -- room for a distinct job type later without a new table

  status        TEXT NOT NULL DEFAULT 'queued',  -- queued | done | failed
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 5,       -- approved policy constant — see lib/knowledge/repo.ts's DEFAULT_MAX_ATTEMPTS

  available_at  BIGINT NOT NULL,                 -- claimable once now() >= available_at; backoff delay lands here
  locked_at     BIGINT,                          -- epoch ms of the current lease; NULL = not leased
  locked_by     TEXT,                            -- opaque per-invocation worker id — observability only, not a trust boundary
  last_error    TEXT,

  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL
);

-- The claim query's own WHERE clause (status='queued' AND available_at
-- <= now) is exactly this predicate — keeps the claim scan on a small,
-- relevant index instead of the whole table as job history grows.
CREATE INDEX IF NOT EXISTS idx_knowledge_jobs_claimable
  ON knowledge_jobs (available_at) WHERE status = 'queued';

-- THE idempotency guard: at most one OPEN job per item at a time. This
-- is the database constraint the enqueue path relies on as its FINAL
-- protection against a duplicate — not just an application-level
-- check — so a concurrent double-enqueue (e.g. a double-clicked Retry)
-- can never create two open jobs for the same item, no matter how the
-- application-level race unfolds.
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_jobs_item_open
  ON knowledge_jobs (item_id) WHERE status = 'queued';

-- General item→jobs lookup across ALL statuses (done/failed history
-- included) — distinct from the partial index above, which only
-- covers the open-job subset.
CREATE INDEX IF NOT EXISTS idx_knowledge_jobs_item ON knowledge_jobs (item_id);
