-- ================================================================
-- 0011_custom_connector_contract.sql — connector platform audit,
-- Fase D1: normalizes the CustomConnector contract to match the
-- fields a static ConnectorDefinition already carries (registry.ts) —
-- slug (a stable, URL-safe identifier distinct from the opaque
-- cconn_<uuid> id), category, and icon — none of which existed before
-- this migration.
--
-- slug is backfilled from each existing row's name, deduplicated by
-- appending the row's own id suffix (never colliding, since id is
-- already unique) — every row gets a real, non-null slug, never a
-- placeholder. New rows get a real slug generated the same way at
-- INSERT time (lib/connectors/slug.ts's slugify()).
--
-- Purely additive: no existing column altered or dropped, no row
-- deleted.
-- ================================================================

ALTER TABLE custom_connectors ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE custom_connectors ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE custom_connectors ADD COLUMN IF NOT EXISTS icon TEXT;

UPDATE custom_connectors
SET slug = lower(
  regexp_replace(
    regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'),
    '(^-+|-+$)', '', 'g'
  )
) || '-' || right(id, 8)
WHERE slug IS NULL;

-- A name that was entirely non-alphanumeric collapses to an empty
-- string before the id suffix — guard against a leading '-' with
-- nothing before it turning into a slug that starts with '-'.
UPDATE custom_connectors SET slug = 'connector-' || right(id, 8) WHERE slug LIKE '-%';

ALTER TABLE custom_connectors ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_connectors_org_slug ON custom_connectors(org_id, slug);
