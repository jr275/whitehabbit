-- ================================================================
-- 0004_pocket2_rls.sql — closes finding DB-03.
--
-- Before this, tenant isolation had two layers:
--   * composite foreign keys, which made cross-tenant WRITES
--     impossible at the storage layer;
--   * `WHERE org_id = $1` in every repository function, which made
--     cross-tenant READS impossible as long as no future change ever
--     forgot a predicate.
--
-- The second is an application guarantee. This migration moves it
-- into the database: every Pocket2 statement now runs inside a
-- transaction that has declared which organization it acts for
-- (lib/pocket2/repo/tenant-db.ts), and PostgreSQL enforces that
-- declaration. A forgotten predicate returns zero rows instead of
-- another tenant's library.
--
-- ---- READ THIS BEFORE DEPLOYING --------------------------------
-- Row-level security does NOT apply to superusers, and applies to a
-- table's owner only when FORCE ROW LEVEL SECURITY is set. Both are
-- handled here, but the first cannot be: if DATABASE_URL connects as
-- a superuser, every policy below is inert and the system merely
-- LOOKS protected.
--
-- Connect the application as the pocket2_app role created here.
-- assertRlsIsEffective() in tenant-db.ts asks the database whether
-- this is actually true, so the misconfiguration is loud rather than
-- silent.
-- ================================================================

-- ---- the application role ---------------------------------------
-- NOLOGIN by default: an operator grants a password (or maps an
-- existing login role into it) as part of deployment. Deliberately
-- NOT a superuser and NOT the owner of these tables — that is the
-- entire point.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pocket2_app') THEN
    CREATE ROLE pocket2_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO pocket2_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pocket2_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pocket2_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pocket2_app;

-- ---- policies ----------------------------------------------------
-- One policy per table, all the same shape:
--
--   org_id = current_setting('pocket2.org_id', true)
--
-- current_setting(..., true) returns NULL when unset, and
-- `org_id = NULL` is NULL, which is not true — so a statement that
-- never declared an organization sees nothing and may write nothing.
-- Default deny, by construction rather than by an extra rule.
--
-- USING governs which rows are visible to SELECT/UPDATE/DELETE;
-- WITH CHECK governs which rows INSERT/UPDATE may produce. Both are
-- needed: USING alone would let a tenant UPDATE one of its own rows
-- to carry another tenant's org_id.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'saved_items', 'saved_item_states', 'reader_documents', 'reader_segments',
    'audio_assets', 'audio_segment_marks', 'collections', 'collection_items',
    'tags', 'saved_item_tags', 'item_events'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE makes the policy apply to the table's OWNER as well.
    -- Without it, an application connecting as the owner bypasses
    -- everything below.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (org_id = current_setting('pocket2.org_id', true))
        WITH CHECK (org_id = current_setting('pocket2.org_id', true))
    $f$, t);
  END LOOP;
END
$$;

-- ---- the one deliberate exception --------------------------------
-- ingest_jobs is the work queue, and the queue is cross-tenant by
-- nature: a worker has to be able to see that organization B has
-- pending work BEFORE it can act for organization B.
--
-- So this policy additionally accepts a worker scope. That scope is
-- granted only by withWorkerScope() in tenant-db.ts, and only around
-- claim/complete/fail/reap — it is accepted by THIS TABLE ALONE, so a
-- worker-scoped transaction still cannot read a single row of any
-- tenant's saved items, reader documents, tags or collections.
--
-- The rows here carry ids, a URL and a status; no user content.
ALTER TABLE ingest_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ingest_jobs;
CREATE POLICY tenant_isolation ON ingest_jobs
  USING (
    org_id = current_setting('pocket2.org_id', true)
    OR current_setting('pocket2.worker', true) = 'on'
  )
  WITH CHECK (
    org_id = current_setting('pocket2.org_id', true)
    OR current_setting('pocket2.worker', true) = 'on'
  );

-- ---- what is deliberately NOT covered ----------------------------
-- organizations, users and memberships are the tenancy substrate
-- itself: sign-in must resolve a user and their membership BEFORE any
-- organization is known, so an org-scoped policy on them would be
-- circular. They are reached only through lib/db/repo.ts, which
-- looks rows up by primary key or by the authenticated user's own id.
--
-- The other product's tables (workers, executions, outputs, ...) are
-- out of scope for this migration: they have their own access path
-- and changing their read semantics is not Pocket2's call to make.
