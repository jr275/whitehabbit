import "server-only"

/* Writes produced by the ingestion pipeline. Org-scoped like every
 * other repository function; the composite foreign keys in
 * migrations/0002_pocket2.sql mean a reader document or tag can never
 * be attached across a tenant boundary even if a predicate here were
 * dropped. */

import { randomUUID } from "node:crypto"
import { tenantClient } from "@/lib/pocket2/repo/tenant-db"
import type { ContentType, ExtractionFailureReason, ReaderStatus } from "@/lib/pocket2/domain/types"
import { toSlug } from "@/lib/pocket2/domain/validate"
import type { ExtractedSegment } from "@/lib/pocket2/ingest/extract"

export interface IngestMetadataPatch {
  /** Values a publisher curated for sharing (OpenGraph, JSON-LD).
   * These are authoritative and overwrite what is stored. */
  title: string | null
  description: string | null
  author: string | null
  /** Values DERIVED by the extractor — Readability's own title, byline
   * and excerpt. Genuinely useful when nothing better exists, but
   * weaker than a curated one, so they are only applied to a column
   * that is currently empty. Without this distinction a re-ingest of a
   * page whose OpenGraph tags have since been removed would quietly
   * downgrade a good description to a generic first paragraph. */
  fallbackTitle?: string | null
  fallbackDescription?: string | null
  fallbackAuthor?: string | null
  contentType: ContentType
  imageUrl: string | null
  faviconUrl: string | null
  publishedAt: number | null
  canonicalUrl?: string | null
  wordCount: number | null
  readingTimeSeconds: number | null
  readerStatus: ReaderStatus
  /** the raw provenance record — retained, never rendered */
  metadata: Record<string, unknown>
}

export interface ReaderDocumentInput {
  extractionStatus: "ok" | "partial" | "failed"
  extractorVersion: string
  failureReason: ExtractionFailureReason | null
  heroImageUrl: string | null
  html: string | null
  text: string | null
  language: string | null
  wordCount: number | null
  segments: ExtractedSegment[]
}

/**
 * Persist everything one successful ingestion produced, in ONE
 * transaction: the item's metadata, the reader document and its
 * segments, and the suggested tags.
 *
 * Atomicity matters here beyond tidiness — a half-written ingestion
 * (item marked ready, reader document missing) would present as "we
 * extracted this article" with nothing to show, which is exactly the
 * dishonesty the data model is built to prevent.
 *
 * COALESCE on the metadata columns means a re-run never blanks a field
 * it merely failed to find this time.
 */
export async function applyIngestResult(
  orgId: string,
  itemId: string,
  patch: IngestMetadataPatch,
  reader: ReaderDocumentInput | null,
  suggestedTags: string[],
): Promise<void> {
  const now = Date.now()

  // Runs inside the caller's withTenant() transaction, so the whole
  // ingestion result still commits or rolls back as one unit.
  const client = tenantClient()
  {
    await client.query(
      `UPDATE saved_items SET
         -- curated value wins; otherwise keep what is stored;
         -- otherwise fall back to the extractor's derived value
         title                = coalesce($3, title, $16),
         description          = coalesce($4, description, $17),
         author               = coalesce($5, author, $18),
         content_type         = $6,
         image_url            = coalesce($7, image_url),
         favicon_url          = coalesce($8, favicon_url),
         published_at         = coalesce($9, published_at),
         canonical_url        = coalesce($10, canonical_url),
         word_count           = coalesce($11, word_count),
         reading_time_seconds = coalesce($12, reading_time_seconds),
         reader_status        = $13,
         metadata             = $14::jsonb,
         ingest_status        = 'ready',
         ingest_error         = NULL,
         updated_at           = $15
       WHERE id = $1 AND org_id = $2`,
      [itemId, orgId, patch.title, patch.description, patch.author, patch.contentType,
       patch.imageUrl, patch.faviconUrl, patch.publishedAt, patch.canonicalUrl ?? null,
       patch.wordCount, patch.readingTimeSeconds, patch.readerStatus,
       JSON.stringify(patch.metadata), now,
       patch.fallbackTitle ?? null, patch.fallbackDescription ?? null, patch.fallbackAuthor ?? null],
    )

    if (reader) {
      const documentId = `rdoc_${randomUUID()}`
      // A re-run replaces the previous extraction rather than
      // accumulating versions; segments cascade from the document.
      await client.query("DELETE FROM reader_documents WHERE item_id = $1 AND org_id = $2", [itemId, orgId])
      await client.query(
        `INSERT INTO reader_documents (
           id, item_id, org_id, extraction_status, extractor_version, failure_reason,
           hero_image_url, html, text, language, word_count, extracted_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [documentId, itemId, orgId, reader.extractionStatus, reader.extractorVersion,
         reader.failureReason, reader.heroImageUrl, reader.html, reader.text,
         reader.language, reader.wordCount, now],
      )

      if (reader.segments.length > 0) {
        // One statement for the whole article via unnest(), rather
        // than a round trip per segment — a long piece is several
        // hundred segments. char_end is derived in SQL from the text
        // actually stored, so the two can never disagree.
        await client.query(
          `INSERT INTO reader_segments (id, document_id, org_id, ordinal, kind, text, char_start, char_end)
           SELECT s.id, $1, $2, s.ordinal, s.kind, s.text, s.char_start, s.char_start + length(s.text)
             FROM unnest($3::text[], $4::int[], $5::text[], $6::text[], $7::int[])
               AS s(id, ordinal, kind, text, char_start)`,
          [
            documentId,
            orgId,
            reader.segments.map(() => `seg_${randomUUID()}`),
            reader.segments.map((segment) => segment.ordinal),
            reader.segments.map((segment) => segment.kind),
            reader.segments.map((segment) => segment.text),
            reader.segments.map((segment) => segment.charStart),
          ],
        )
      }
    }

    for (const name of suggestedTags) {
      const slug = toSlug(name)
      if (!slug) continue
      const tagId = `tag_${randomUUID()}`
      await client.query(
        `INSERT INTO tags (id, org_id, name, slug, usage_count, created_at)
         VALUES ($1,$2,$3,$4,0,$5)
         ON CONFLICT (org_id, slug) DO NOTHING`,
        [tagId, orgId, name, slug, now],
      )
      // source='auto' keeps a machine suggestion distinguishable from
      // a label the person chose. ON CONFLICT DO NOTHING means a
      // re-run never downgrades a tag the user has since confirmed.
      const linked = await client.query(
        `INSERT INTO saved_item_tags (item_id, tag_id, org_id, source, added_at)
         SELECT $1, t.id, $2, 'auto', $4 FROM tags t WHERE t.org_id = $2 AND t.slug = $3
         ON CONFLICT (item_id, tag_id) DO NOTHING
         RETURNING tag_id`,
        [itemId, orgId, slug, now],
      )
      if (linked.rows.length > 0) {
        await client.query(
          "UPDATE tags SET usage_count = usage_count + 1 WHERE org_id = $1 AND slug = $2",
          [orgId, slug],
        )
      }
    }

    await client.query(
      `INSERT INTO item_events (id, org_id, item_id, type, payload, occurred_at)
       VALUES ($1,$2,$3,'ingest_succeeded',$4::jsonb,$5)`,
      [`ev_${randomUUID()}`, orgId, itemId,
       JSON.stringify({ contentType: patch.contentType, readerStatus: patch.readerStatus }), now],
    )
  }
}

/**
 * Record an ingestion that did not succeed.
 *
 * `terminal` distinguishes "we will try again" from "this is the final
 * answer". Either way the item stays in the library with its URL
 * intact — a failed fetch loses the preview, never the save.
 */
export async function recordIngestFailure(
  orgId: string,
  itemId: string,
  message: string,
  terminal: boolean,
  failureReason: ExtractionFailureReason | null = null,
): Promise<void> {
  const now = Date.now()
  // Runs inside the caller's withTenant() transaction, so the whole
  // ingestion result still commits or rolls back as one unit.
  const client = tenantClient()
  {
    await client.query(
      `UPDATE saved_items SET
         ingest_status = $3, ingest_error = $4, reader_status = 'not_available', updated_at = $5
       WHERE id = $1 AND org_id = $2`,
      [itemId, orgId, terminal ? "failed" : "pending", message.slice(0, 500), now],
    )
    if (terminal && failureReason) {
      // Preserve WHY, in the product's own vocabulary, so the Reader
      // can explain itself instead of showing a blank page.
      const documentId = `rdoc_${randomUUID()}`
      await client.query("DELETE FROM reader_documents WHERE item_id = $1 AND org_id = $2", [itemId, orgId])
      await client.query(
        `INSERT INTO reader_documents (id, item_id, org_id, extraction_status, extractor_version, failure_reason, extracted_at)
         VALUES ($1,$2,$3,'failed','n/a',$4,$5)`,
        [documentId, itemId, orgId, failureReason, now],
      )
    }
    await client.query(
      `INSERT INTO item_events (id, org_id, item_id, type, payload, occurred_at)
       VALUES ($1,$2,$3,'ingest_failed',$4::jsonb,$5)`,
      [`ev_${randomUUID()}`, orgId, itemId, JSON.stringify({ message: message.slice(0, 200), terminal }), now],
    )
  }
}
