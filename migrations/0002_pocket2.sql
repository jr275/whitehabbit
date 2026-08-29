-- ================================================================
-- 0002_pocket2.sql — Pocket2.io: the personal internet library.
--
-- Follows every convention established by 0001_init.sql:
--   * prefixed TEXT ids ("item_...", "coll_...") — not bare uuids
--   * BIGINT epoch-milliseconds timestamps, matching the TS `number`
--     model exactly, so no layer converts dates
--   * org_id denormalized onto EVERY tenant-owned row, including
--     child rows, so a tenant predicate is always available locally
--   * relational columns for anything queried/filtered/authorized on,
--     JSONB only for genuinely open-ended documents
--
-- Tenancy is enforced structurally, not by convention: every child
-- table carries org_id and references saved_items(id, org_id) as a
-- COMPOSITE foreign key. A row can therefore never be attached to a
-- parent in a different organization, even if an application-layer
-- predicate is forgotten.
-- ================================================================

-- ---- roles ------------------------------------------------------
-- 0001 documented memberships.role as "owner | member". Pocket2 adds
-- the middle tier the product brief calls for. Existing rows only
-- ever hold 'owner' (see createUserWithOrganization in lib/db/repo.ts),
-- so this constraint validates cleanly against live data.
ALTER TABLE memberships
  ADD CONSTRAINT chk_memberships_role
  CHECK (role IN ('owner', 'admin', 'member'));

-- ---- saved_items: the core entity -------------------------------
-- `url` is exactly what the user submitted (preserved for display and
-- for "open original"); `canonical_url` is the normalized form used
-- for identity; `url_hash` is sha256(canonical_url), the dedupe key
-- — hashed rather than indexed directly because URLs routinely exceed
-- btree's index row limit.
CREATE TABLE IF NOT EXISTS saved_items (
  id                   TEXT PRIMARY KEY,
  org_id               TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by           TEXT REFERENCES users(id),
  url                  TEXT NOT NULL,
  canonical_url        TEXT NOT NULL,
  url_hash             TEXT NOT NULL,
  domain               TEXT NOT NULL,
  title                TEXT,
  description          TEXT,
  author               TEXT,
  content_type         TEXT NOT NULL DEFAULT 'unknown',
  image_url            TEXT,
  favicon_url          TEXT,
  published_at         BIGINT,
  saved_at             BIGINT NOT NULL,
  word_count           INTEGER,
  reading_time_seconds INTEGER,
  -- ingestion lifecycle (see lib/pocket2 ingestion pipeline)
  ingest_status        TEXT NOT NULL DEFAULT 'pending',       -- pending | processing | ready | failed
  ingest_error         TEXT,
  ingest_attempts      INTEGER NOT NULL DEFAULT 0,
  -- whether a reader representation actually exists. NEVER inferred
  -- from ingest_status: an item can ingest successfully (real title,
  -- description, image) and still have no extractable article body.
  reader_status        TEXT NOT NULL DEFAULT 'not_available', -- not_available | available | failed
  -- raw OG/twitter/JSON-LD as fetched. Retained for provenance and
  -- re-processing. NEVER rendered directly — it is third-party input.
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           BIGINT NOT NULL,
  updated_at           BIGINT NOT NULL,

  CONSTRAINT chk_items_ingest_status CHECK (ingest_status IN ('pending','processing','ready','failed')),
  CONSTRAINT chk_items_reader_status CHECK (reader_status IN ('not_available','available','failed')),
  CONSTRAINT chk_items_content_type CHECK (content_type IN (
    'article','video','news','blog_post','document','product',
    'social_post','website','podcast','other','unknown'
  )),

  -- Idempotent save, enforced by the database rather than by a
  -- read-then-write race in application code.
  CONSTRAINT uq_items_org_url UNIQUE (org_id, url_hash),
  -- the target of every child table's composite FK
  CONSTRAINT uq_items_id_org UNIQUE (id, org_id)
);

-- The library's default query: one organization, newest first,
-- keyset-paginated on (saved_at, id) — never OFFSET.
CREATE INDEX IF NOT EXISTS idx_items_org_saved  ON saved_items(org_id, saved_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_items_org_domain ON saved_items(org_id, domain);
CREATE INDEX IF NOT EXISTS idx_items_org_type   ON saved_items(org_id, content_type, saved_at DESC);
-- partial index: the job runner only ever scans unfinished work
CREATE INDEX IF NOT EXISTS idx_items_pending    ON saved_items(ingest_status)
  WHERE ingest_status IN ('pending','processing');

-- ---- full-text search -------------------------------------------
-- A stored generated column, so the vector can never drift out of
-- sync with the row. Weighted: title (A) > description (B) >
-- domain/author (C). The article body is indexed separately on
-- reader_documents (weight D) — keeping it off this row avoids
-- rewriting a wide row every time extraction is re-run.
--
-- 'english' is a literal regconfig here, which is what makes
-- to_tsvector immutable and therefore legal in a generated column.
ALTER TABLE saved_items
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(domain, '') || ' ' || coalesce(author, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_items_search ON saved_items USING GIN (search_vector);
-- trigram-free prefix matching for the instant-search "starts with"
-- case on title, without adding the pg_trgm extension dependency.
CREATE INDEX IF NOT EXISTS idx_items_title_lower ON saved_items(org_id, lower(title));

-- ---- per-user state ---------------------------------------------
-- Deliberately NOT columns on saved_items. Read/favorite/archive and
-- reading position are properties of (item, person), so a collection
-- shared with a team in a later phase needs no data migration — the
-- table already has the right grain.
CREATE TABLE IF NOT EXISTS saved_item_states (
  item_id               TEXT NOT NULL,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id                TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'unread',  -- unread | read | archived
  is_favorite           BOOLEAN NOT NULL DEFAULT FALSE,
  read_at               BIGINT,
  archived_at           BIGINT,
  favorited_at          BIGINT,
  -- reading position is a SEMANTIC anchor (a reader_segments ordinal),
  -- not a pixel offset — so it survives re-extraction and transfers
  -- between screen sizes, and matches where listening left off.
  reading_progress      REAL NOT NULL DEFAULT 0,
  reading_segment_id    TEXT,
  -- listening state, populated from Phase 6 onward. Columns exist now
  -- so the read/listen resume model needs no later migration.
  listening_position_ms INTEGER,
  listening_segment_id  TEXT,
  playback_speed        REAL NOT NULL DEFAULT 1.0,
  listen_completed      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL,

  PRIMARY KEY (item_id, user_id),
  CONSTRAINT chk_states_status CHECK (status IN ('unread','read','archived')),
  CONSTRAINT chk_states_progress CHECK (reading_progress >= 0 AND reading_progress <= 1),
  CONSTRAINT fk_states_item FOREIGN KEY (item_id, org_id)
    REFERENCES saved_items(id, org_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_states_user_status ON saved_item_states(user_id, status, item_id);
CREATE INDEX IF NOT EXISTS idx_states_user_fav    ON saved_item_states(user_id, item_id) WHERE is_favorite;

-- ---- reader documents -------------------------------------------
-- The extracted, SANITIZED representation. Stored separately from the
-- item's metadata because they are legally and operationally distinct
-- artifacts (see the content-ownership section of the product brief):
-- metadata is factual description; this is derived from the
-- publisher's content and always carries attribution back to it.
CREATE TABLE IF NOT EXISTS reader_documents (
  id                TEXT PRIMARY KEY,
  item_id           TEXT NOT NULL,
  org_id            TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  extraction_status TEXT NOT NULL,  -- ok | partial | failed
  -- which extractor produced this. A pipeline improvement can then
  -- re-run deterministically over stale documents instead of guessing.
  extractor_version TEXT NOT NULL,
  -- reason extraction did not fully succeed, in the product's own
  -- vocabulary (paywalled | login_required | robots_disallowed |
  -- not_readable | fetch_failed). Surfaced honestly in the Reader —
  -- never replaced with fabricated body text.
  failure_reason    TEXT,
  hero_image_url    TEXT,
  -- sanitized at write time against a tag/attribute allowlist. Still
  -- rendered under a restrictive CSP: defence in depth, not either/or.
  html              TEXT,
  -- plain text: the source for full-text search and for TTS
  text              TEXT,
  language          TEXT,
  word_count        INTEGER,
  extracted_at      BIGINT NOT NULL,

  CONSTRAINT chk_reader_status CHECK (extraction_status IN ('ok','partial','failed')),
  CONSTRAINT uq_reader_item UNIQUE (item_id),
  CONSTRAINT uq_reader_id_org UNIQUE (id, org_id),
  CONSTRAINT fk_reader_item FOREIGN KEY (item_id, org_id)
    REFERENCES saved_items(id, org_id) ON DELETE CASCADE
);

-- weight-D body text index, kept off the saved_items row
ALTER TABLE reader_documents
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(text, '')), 'D')) STORED;
CREATE INDEX IF NOT EXISTS idx_reader_search ON reader_documents USING GIN (search_vector);

-- ---- reader segments: the read <-> listen sync seam --------------
-- The single structural decision that makes synchronized reading and
-- listening possible later without a rewrite. V1 only needs these to
-- anchor reading position; sentence-level audio highlighting needs
-- nothing more than populating audio_segment_marks below.
CREATE TABLE IF NOT EXISTS reader_segments (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ordinal     INTEGER NOT NULL,
  kind        TEXT NOT NULL,  -- paragraph | heading | list_item | quote | caption | code
  text        TEXT NOT NULL,
  char_start  INTEGER NOT NULL,
  char_end    INTEGER NOT NULL,

  CONSTRAINT chk_segment_kind CHECK (kind IN ('paragraph','heading','list_item','quote','caption','code')),
  CONSTRAINT uq_segment_ordinal UNIQUE (document_id, ordinal),
  CONSTRAINT fk_segment_document FOREIGN KEY (document_id, org_id)
    REFERENCES reader_documents(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_segments_document ON reader_segments(document_id, ordinal);

-- ---- generated audio --------------------------------------------
-- Stored separately from the article, per the content-ownership model:
-- generated audio is a distinct artifact with its own lifecycle, its
-- own provider attribution, and its own deletion semantics.
CREATE TABLE IF NOT EXISTS audio_assets (
  id           TEXT PRIMARY KEY,
  item_id      TEXT NOT NULL,
  document_id  TEXT,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'not_requested',
  provider     TEXT,
  voice        TEXT,
  format       TEXT,
  duration_ms  INTEGER,
  url          TEXT,
  bytes        INTEGER,
  error        TEXT,
  requested_by TEXT REFERENCES users(id),
  requested_at BIGINT,
  completed_at BIGINT,
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL,

  CONSTRAINT chk_audio_status CHECK (status IN ('not_requested','queued','processing','ready','failed')),
  CONSTRAINT uq_audio_id_org UNIQUE (id, org_id),
  CONSTRAINT fk_audio_item FOREIGN KEY (item_id, org_id)
    REFERENCES saved_items(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_audio_item ON audio_assets(item_id);

-- segment -> audio timing. Empty is a valid state: a provider that
-- returns no timings simply yields no rows, and playback still works.
-- The table's existence is what keeps sentence-level highlighting a
-- feature decision rather than a migration.
CREATE TABLE IF NOT EXISTS audio_segment_marks (
  asset_id   TEXT NOT NULL,
  segment_id TEXT NOT NULL REFERENCES reader_segments(id) ON DELETE CASCADE,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  start_ms   INTEGER NOT NULL,
  end_ms     INTEGER NOT NULL,
  PRIMARY KEY (asset_id, segment_id),
  CONSTRAINT fk_marks_asset FOREIGN KEY (asset_id, org_id)
    REFERENCES audio_assets(id, org_id) ON DELETE CASCADE
);

-- ---- organization: collections + tags ----------------------------
-- Two DISTINCT concepts, deliberately not unified:
--   collections = user-curated groups, ordered, named, few
--   tags        = flexible labels, many, emergent
CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by  TEXT REFERENCES users(id),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  color       TEXT,
  icon        TEXT,
  item_count  INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL,
  CONSTRAINT uq_collections_slug UNIQUE (org_id, slug),
  CONSTRAINT uq_collections_id_org UNIQUE (id, org_id)
);
CREATE INDEX IF NOT EXISTS idx_collections_org ON collections(org_id, position, name);

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id TEXT NOT NULL,
  item_id       TEXT NOT NULL,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  added_at      BIGINT NOT NULL,
  added_by      TEXT REFERENCES users(id),
  PRIMARY KEY (collection_id, item_id),
  CONSTRAINT fk_ci_collection FOREIGN KEY (collection_id, org_id)
    REFERENCES collections(id, org_id) ON DELETE CASCADE,
  CONSTRAINT fk_ci_item FOREIGN KEY (item_id, org_id)
    REFERENCES saved_items(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ci_item ON collection_items(item_id);

CREATE TABLE IF NOT EXISTS tags (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  color       TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at  BIGINT NOT NULL,
  CONSTRAINT uq_tags_slug UNIQUE (org_id, slug),
  CONSTRAINT uq_tags_id_org UNIQUE (id, org_id)
);
CREATE INDEX IF NOT EXISTS idx_tags_org ON tags(org_id, usage_count DESC);

CREATE TABLE IF NOT EXISTS saved_item_tags (
  item_id  TEXT NOT NULL,
  tag_id   TEXT NOT NULL,
  org_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- 'user' vs 'auto' keeps a machine suggestion distinguishable from a
  -- deliberate human label, so Phase 7's auto-tagging can never
  -- silently overwrite the user's own organization of their library.
  source   TEXT NOT NULL DEFAULT 'user',
  added_at BIGINT NOT NULL,
  PRIMARY KEY (item_id, tag_id),
  CONSTRAINT chk_tag_source CHECK (source IN ('user','auto')),
  CONSTRAINT fk_sit_item FOREIGN KEY (item_id, org_id)
    REFERENCES saved_items(id, org_id) ON DELETE CASCADE,
  CONSTRAINT fk_sit_tag FOREIGN KEY (tag_id, org_id)
    REFERENCES tags(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sit_tag ON saved_item_tags(tag_id);

-- ---- ingestion jobs ----------------------------------------------
-- The save request never waits on a network fetch. It enqueues here
-- and returns; a worker tick claims rows with FOR UPDATE SKIP LOCKED,
-- so concurrent serverless instances never process the same job twice.
CREATE TABLE IF NOT EXISTS ingest_jobs (
  id              TEXT PRIMARY KEY,
  item_id         TEXT,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                    -- metadata | extract | tts | reindex
  status          TEXT NOT NULL DEFAULT 'queued',   -- queued | processing | done | failed
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 4,
  next_attempt_at BIGINT NOT NULL,
  last_error      TEXT,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  locked_by       TEXT,
  locked_until    BIGINT,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL,

  CONSTRAINT chk_job_kind CHECK (kind IN ('metadata','extract','tts','reindex')),
  CONSTRAINT chk_job_status CHECK (status IN ('queued','processing','done','failed')),
  CONSTRAINT fk_job_item FOREIGN KEY (item_id, org_id)
    REFERENCES saved_items(id, org_id) ON DELETE CASCADE
);
-- the claim query's index: only rows actually eligible to run
CREATE INDEX IF NOT EXISTS idx_jobs_claim ON ingest_jobs(next_attempt_at, id)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_jobs_item ON ingest_jobs(item_id);

-- ---- item activity -----------------------------------------------
-- Append-only. Feeds "what did I save six months ago", future
-- knowledge-cluster analysis, and honest debugging of ingestion.
CREATE TABLE IF NOT EXISTS item_events (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id     TEXT,
  user_id     TEXT REFERENCES users(id),
  type        TEXT NOT NULL,  -- saved | ingest_succeeded | ingest_failed | read | archived | favorited | ...
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_item_events_org  ON item_events(org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_events_item ON item_events(item_id, occurred_at DESC);
