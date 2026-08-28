-- ================================================================== --
-- PHASE 6E — REAL-TIME INTELLIGENCE: DURABLE EVENT QUEUE (§7, ADR-032).
--
-- migrations/0008 already wires real pg_notify triggers on the tables
-- that matter (search_console_snapshots/trends/entities/pages/
-- ai_answers/dataset_versions) onto the 'intelligence_events' channel —
-- but a bare NOTIFY is not durable: if no listener happens to be
-- connected at the moment it fires, the event is gone forever, and
-- this system's whole discipline is against silently losing real
-- signal. This migration adds a real, durable queue table fed by the
-- SAME trigger (extended, not replaced) so a real background drain
-- (lib/intelligence/recalc-worker.ts, invoked the same way
-- lib/workflow/step-worker.ts's processStepQueue() already is) can
-- guarantee every real change is eventually processed, while
-- pg_notify keeps serving any live listener that IS connected right
-- now — the same two-tier pattern ADR-022/023 already established for
-- workflow steps, applied here to intelligence invalidation.
-- ================================================================== --

CREATE TABLE IF NOT EXISTS intelligence_event_queue (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id),
  project_id   TEXT, -- real, resolved at trigger time where a cheap join exists; null only when genuinely unresolvable (never guessed)
  event_type   TEXT NOT NULL, -- SearchConsoleImported|TrendUpdated|EntityChanged|PagePublished|PagePerformanceChanged|AIVisibilityChanged|DataSourceUpdated
  subject_id   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','processed','failed')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  created_at   BIGINT NOT NULL,
  processed_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_intel_event_queue_pending ON intelligence_event_queue(status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_intel_event_queue_org ON intelligence_event_queue(org_id, created_at DESC);

-- Extends the existing trigger function (0008) in place: same
-- pg_notify behavior for any live listener, PLUS a real, durable
-- queue row every time, now resolving project_id via the real FK path
-- for the three tables that don't carry it directly.
CREATE OR REPLACE FUNCTION notify_intelligence_invalidation() RETURNS trigger AS $$
DECLARE
  event_type TEXT;
  subject_id TEXT;
  org TEXT;
  proj TEXT;
BEGIN
  IF TG_TABLE_NAME = 'search_console_snapshots' THEN
    event_type := 'SearchConsoleImported'; subject_id := NEW.property_id; org := NEW.org_id;
    SELECT project_id INTO proj FROM search_console_properties WHERE id = NEW.property_id;
  ELSIF TG_TABLE_NAME = 'trends' THEN
    event_type := 'TrendUpdated'; subject_id := NEW.id; org := NEW.org_id; proj := NEW.project_id;
  ELSIF TG_TABLE_NAME = 'entities' THEN
    event_type := 'EntityChanged'; subject_id := NEW.id; org := NEW.org_id; proj := NEW.project_id;
  ELSIF TG_TABLE_NAME = 'pages' THEN
    IF NEW.status = 'published' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'published') THEN
      event_type := 'PagePublished';
    ELSE
      event_type := 'PagePerformanceChanged';
    END IF;
    subject_id := NEW.id; org := NEW.org_id; proj := NEW.project_id;
  ELSIF TG_TABLE_NAME = 'ai_answers' THEN
    event_type := 'AIVisibilityChanged'; subject_id := NEW.ai_run_id; org := NEW.org_id;
    SELECT project_id INTO proj FROM ai_runs WHERE id = NEW.ai_run_id;
  ELSIF TG_TABLE_NAME = 'dataset_versions' THEN
    event_type := 'DataSourceUpdated'; subject_id := NEW.dataset_id; org := NEW.org_id;
    SELECT ds.project_id INTO proj FROM datasets d JOIN data_sources ds ON ds.id = d.data_source_id WHERE d.id = NEW.dataset_id;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM pg_notify('intelligence_events', json_build_object('event', event_type, 'orgId', org, 'projectId', proj, 'subjectId', subject_id, 'at', extract(epoch FROM now()) * 1000)::text);
  INSERT INTO intelligence_event_queue (id, org_id, project_id, event_type, subject_id, created_at)
  VALUES ('ieq_' || gen_random_uuid()::text, org, proj, event_type, subject_id, (extract(epoch FROM now()) * 1000)::bigint);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
