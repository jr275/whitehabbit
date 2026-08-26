-- ================================================================== --
-- Real-time workflow events (§27) via Postgres LISTEN/NOTIFY — not
-- polling. A trigger fires pg_notify('workflow_events', ...) on every
-- agent_runs/agent_run_steps write, carrying just enough (org_id,
-- run_id, status/step) for a listener to decide whether to forward the
-- event to a connected SSE client. The SSE route (§29) opens a real
-- dedicated LISTEN connection per request and streams these as they
-- happen — genuinely real-time, never a "fake real-time" fixed-interval
-- poll dressed up as a stream.
-- ================================================================== --

CREATE OR REPLACE FUNCTION notify_workflow_run_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'workflow_events',
    json_build_object(
      'kind', 'run',
      'orgId', NEW.org_id,
      'runId', NEW.id,
      'status', NEW.status,
      'pipeline', NEW.pipeline,
      'updatedAt', extract(epoch FROM now()) * 1000
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_workflow_run_change ON agent_runs;
CREATE TRIGGER trg_notify_workflow_run_change
  AFTER INSERT OR UPDATE ON agent_runs
  FOR EACH ROW EXECUTE FUNCTION notify_workflow_run_change();

CREATE OR REPLACE FUNCTION notify_workflow_step_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'workflow_events',
    json_build_object(
      'kind', 'step',
      'orgId', NEW.org_id,
      'runId', NEW.agent_run_id,
      'step', NEW.step,
      'status', NEW.status,
      'updatedAt', extract(epoch FROM now()) * 1000
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_workflow_step_change ON agent_run_steps;
CREATE TRIGGER trg_notify_workflow_step_change
  AFTER INSERT OR UPDATE ON agent_run_steps
  FOR EACH ROW EXECUTE FUNCTION notify_workflow_step_change();
