-- ================================================================
-- 0009_connector_health.sql — real, persisted connector health
-- (section 23 of the connectivity platform brief): a Connection's
-- health was previously only ever computed live, on demand, by a
-- connector's own healthCheck() — never tracked over time. "Do not
-- infer connection status simply because credentials exist" already
-- held (status/healthCheck were both already real); what was missing
-- was a durable record of when a check last ran, whether it last
-- succeeded, and how fast.
--
-- Purely additive columns on the existing connections table — no new
-- table, no change to any existing column or row.
-- ================================================================
ALTER TABLE connections ADD COLUMN IF NOT EXISTS last_checked_at BIGINT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS last_success_at BIGINT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS last_error_at BIGINT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS last_error_code TEXT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS last_latency_ms INTEGER;
