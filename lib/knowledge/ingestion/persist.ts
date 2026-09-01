import "server-only"

/* ================================================================== *
 * EXTRACTION PERSISTENCE
 *
 * One writer for "an extraction succeeded", shared by first ingestion
 * and by re-extraction. Shared deliberately: two copies of this would
 * drift, and the drift would show up as a re-extracted article that
 * quietly differs from a freshly-ingested one.
 *
 * The two callers differ in exactly one way, which the shape below
 * makes explicit: ingestion has just been to the network and has fetch
 * metadata to record; re-extraction has not, and must not overwrite
 * the recorded provenance of a fetch it did not perform.
 *
 * LAST KNOWN GOOD. This function is only ever called with a SUCCESSFUL
 * extraction. A failed re-extraction never reaches here, so the
 * previously stored content stays exactly as it was — the reader keeps
 * working while we work out why the new attempt was worse.
 * ================================================================== */

import { createHash } from "node:crypto"
import { withTransaction } from "@/lib/platform/db"
import type { AccessScope } from "../access/types.ts"
import type { ExtractionResult } from "./extraction/types.ts"
import { countWords, readingTimeSeconds } from "./extraction/sanitize.ts"

/** Present only when this extraction followed an actual fetch. */
export interface FetchProvenance {
  resolvedUrl: string
  originUrl: string | null
  httpStatus: number
}

export interface PersistExtractionInput {
  objectId: string
  extracted: ExtractionResult
  /** The artifact these bytes came from. Null only for M1 rows being
   * re-extracted before they had one. */
  artifactId: string | null
  /** Omitted by re-extraction, which performed no fetch. */
  fetch?: FetchProvenance
}

export interface PersistedExtraction {
  wordCount: number
  revision: number
}

/**
 * Write the object row and its content in ONE transaction.
 *
 * Atomic because the two together are what a reader renders: a
 * committed object row pointing at the previous revision's body is a
 * visibly wrong article, and it is exactly what a crash between two
 * separate statements would produce.
 */
export async function persistExtraction(
  scope: AccessScope,
  input: PersistExtractionInput,
): Promise<PersistedExtraction> {
  const { objectId, extracted, artifactId } = input
  const now = Date.now()
  const wordCount = countWords(extracted.contentText)
  const contentHash =
    extracted.contentText.length > 0 ? createHash("sha256").update(extracted.contentText).digest("hex") : null

  return withTransaction(async (client) => {
    await client.query(
      `UPDATE knowledge_objects SET
         resolved_url            = COALESCE($1, resolved_url),
         origin_url              = COALESCE($2, origin_url),
         http_status             = COALESCE($3, http_status),
         title                   = $4,
         authors                 = $5,
         excerpt                 = $6,
         published_at            = $7,
         language                = $8,
         site_name               = $9,
         image_url               = $10,
         favicon_url             = $11,
         publisher_canonical_url = $12,
         word_count              = $13,
         reading_time_seconds    = $14,
         extractor               = $15,
         status                  = 'completed',
         failure_code            = NULL,
         failure_message         = NULL,
         updated_at              = $16
       WHERE id = $17 AND org_id = $18`,
      [
        input.fetch?.resolvedUrl ?? null,
        input.fetch?.originUrl ?? null,
        input.fetch?.httpStatus ?? null,
        extracted.title,
        extracted.authors,
        extracted.excerpt,
        extracted.publishedAt,
        extracted.language,
        extracted.siteName,
        extracted.imageUrl,
        extracted.faviconUrl,
        extracted.canonicalUrl,
        wordCount > 0 ? wordCount : null,
        wordCount > 0 ? readingTimeSeconds(wordCount) : null,
        // Kept for continuity with M1 rows and with anything reading
        // this column; the split fields below are what M2 reasons on.
        extracted.extractorVersion,
        now,
        objectId,
        scope.workspaceId,
      ],
    )

    const result = await client.query<{ revision: number }>(
      `INSERT INTO knowledge_content (
         object_id, org_id, content_html, content_text, content_hash, extracted_at,
         artifact_id, extraction_method, extractor_version, extraction_confidence,
         site_config_matched, images, revision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1)
       ON CONFLICT (object_id) DO UPDATE SET
         content_html          = EXCLUDED.content_html,
         content_text          = EXCLUDED.content_text,
         content_hash          = EXCLUDED.content_hash,
         extracted_at          = EXCLUDED.extracted_at,
         artifact_id           = EXCLUDED.artifact_id,
         extraction_method     = EXCLUDED.extraction_method,
         extractor_version     = EXCLUDED.extractor_version,
         extraction_confidence = EXCLUDED.extraction_confidence,
         site_config_matched   = EXCLUDED.site_config_matched,
         images                = EXCLUDED.images,
         -- Counts re-extractions, so "this article changed" is
         -- distinguishable from "this article was read again".
         revision              = knowledge_content.revision + 1
       RETURNING revision`,
      [
        objectId,
        scope.workspaceId,
        extracted.contentHtml,
        extracted.contentText,
        contentHash,
        now,
        artifactId,
        extracted.method,
        extracted.extractorVersion,
        extracted.confidence,
        extracted.siteConfigMatched,
        extracted.images,
      ],
    )

    return { wordCount, revision: Number(result.rows[0]?.revision ?? 1) }
  })
}
