import "server-only"

/* ================================================================== *
 * RE-EXTRACTION — run the ladder again over bytes we already have.
 *
 * THIS IS WHY THE ARCHIVE EXISTS. When a site config improves, when a
 * tier is added, when a bug in our own sanitizer is fixed, every
 * article already saved can be made better WITHOUT touching the
 * publisher again. No fetch, no rate limit, no robots question, no
 * risk that the page has since gone behind a paywall or vanished.
 *
 * Three properties this is built around:
 *
 *   1. NO NETWORK. Not a preference — a guarantee. This path never
 *      calls safeFetch and has no URL-shaped input. It reads an
 *      artifact row scoped to the tenant, decompresses it, verifies
 *      its checksum, and hands the bytes to the ladder.
 *
 *   2. LAST KNOWN GOOD SURVIVES. A re-extraction that produces
 *      nothing, or that throws, leaves the stored article exactly as
 *      it was. Losing a working article to a hopeful re-run would be
 *      strictly worse than never re-running.
 *
 *   3. IT IS ALLOWED TO DECLINE. When the new result is materially
 *      worse than the stored one, it is not written. "Better" is a
 *      documented comparison, not a vibe — see isWorthReplacing().
 * ================================================================== */

import { logger } from "@/lib/platform/logger"
import { queryOne } from "@/lib/platform/db"
import type { AccessScope } from "../access/types.ts"
import { ArchiveError, loadArtifact, loadLatestArtifact } from "../archive/index.ts"
import type { BlobStore } from "../storage/types.ts"
import { extractContent, ExtractionError } from "./extraction/index.ts"
import type { ExtractionMethod, ExtractionResult } from "./extraction/types.ts"
import { persistExtraction } from "./persist.ts"

export type ReextractStatus = "replaced" | "unchanged" | "declined" | "failed"

export interface ReextractOutcome {
  objectId: string
  status: ReextractStatus
  method?: ExtractionMethod
  extractorVersion?: string
  previousVersion?: string | null
  revision?: number
  failureCode?: string
  /** Why a "declined" outcome declined. */
  reason?: string
}

export interface ReextractOptions {
  /** Re-run a specific capture rather than the newest. */
  artifactId?: string
  /** Pin one tier — used to compare tiers on a known document. */
  only?: ExtractionMethod
  /**
   * Write the result even when it is not an improvement.
   *
   * For a deliberate, operator-initiated correction: "the stored copy
   * is wrong, replace it with whatever the current ladder produces."
   * Never the default, because the default must not be able to make
   * the library worse.
   */
  force?: boolean
  store?: BlobStore
}

interface StoredContentRow {
  content_text: string | null
  extractor_version: string | null
  extraction_method: string | null
  extraction_confidence: number | null
  site_config_matched: boolean | null
}

/**
 * Is the new result worth replacing the stored one with?
 *
 * Written down rather than left to judgement, because this decision
 * runs unattended across a whole library and a wrong "yes" is
 * invisible until someone opens an article and finds it gutted.
 *
 * The rules, in order:
 *   - A stored row with no content is replaced by anything with some.
 *   - A result from a site-specific rule beats a generic heuristic:
 *     a human wrote that rule for this domain.
 *   - Otherwise a body must not shrink by more than a third. Real
 *     improvements add or hold; a large drop means the new run lost
 *     the article, whatever its confidence says.
 *   - Ties go to the STORED copy. Rewriting an article to say the
 *     same thing burns a revision and invalidates caches for nothing.
 */
export function isWorthReplacing(
  next: ExtractionResult,
  stored: { textLength: number; siteConfigMatched: boolean } | null,
): { ok: boolean; reason: string } {
  const nextLength = next.contentText.trim().length
  if (nextLength === 0 && next.contentHtml === null && !next.title) {
    return { ok: false, reason: "new extraction produced nothing" }
  }
  if (!stored || stored.textLength === 0) {
    return { ok: true, reason: "no stored content to lose" }
  }
  if (next.siteConfigMatched && !stored.siteConfigMatched) {
    return { ok: true, reason: "a site-specific rule now matches this domain" }
  }
  if (nextLength === 0) {
    return { ok: false, reason: "new extraction has no body and the stored one does" }
  }
  if (nextLength < stored.textLength * 0.67) {
    return {
      ok: false,
      reason: `new body is ${Math.round((nextLength / stored.textLength) * 100)}% of the stored one`,
    }
  }
  return { ok: true, reason: "new extraction is at least as complete" }
}

/**
 * Re-run extraction for one object from its archived bytes.
 *
 * Never throws for an ordinary failure: like the ingest pipeline, it
 * returns a typed outcome, because an unhandled throw in a background
 * worker is a job stuck 'active' until the reaper notices.
 */
export async function reextractObject(
  scope: AccessScope,
  objectId: string,
  options: ReextractOptions = {},
): Promise<ReextractOutcome> {
  const log = { objectId, workspaceId: scope.workspaceId }

  const stored = await queryOne<StoredContentRow>(
    `SELECT content_text, extractor_version, extraction_method, extraction_confidence, site_config_matched
     FROM knowledge_content WHERE object_id = $1 AND org_id = $2`,
    [objectId, scope.workspaceId],
  )
  const previousVersion = stored?.extractor_version ?? null

  try {
    // NO FETCH. The bytes come from the archive, tenant-scoped, and
    // their checksum is verified on the way out.
    const loaded = options.artifactId
      ? await loadArtifact(scope, options.artifactId, { store: options.store })
      : await loadLatestArtifact(scope, objectId, { store: options.store })

    if (loaded.artifact.objectId !== objectId) {
      // A caller passed an artifact belonging to another object in the
      // same workspace. Scoping held; intent did not.
      return { objectId, status: "failed", failureCode: "artifact_mismatch", previousVersion }
    }

    const extracted = await extractContent(
      { url: loaded.artifact.resolvedUrl ?? loaded.artifact.requestedUrl, html: loaded.html },
      {
        only: options.only,
        onFallthrough: (method, reason) => logger.info("knowledge_reextract_fallthrough", { ...log, method, reason }),
      },
    )

    const verdict = options.force
      ? { ok: true, reason: "forced" }
      : isWorthReplacing(
          extracted,
          stored
            ? {
                textLength: (stored.content_text ?? "").trim().length,
                siteConfigMatched: stored.site_config_matched === true,
              }
            : null,
        )

    if (!verdict.ok) {
      // The stored article is untouched. This is a success for the
      // library even though it is a no-op for this object.
      logger.info("knowledge_reextract_declined", { ...log, reason: verdict.reason })
      return { objectId, status: "declined", reason: verdict.reason, previousVersion }
    }

    // An identical re-run of the same ruleset is not worth a revision.
    if (
      !options.force &&
      previousVersion === extracted.extractorVersion &&
      (stored?.content_text ?? "").trim() === extracted.contentText.trim()
    ) {
      logger.info("knowledge_reextract_unchanged", { ...log, extractorVersion: extracted.extractorVersion })
      return {
        objectId,
        status: "unchanged",
        method: extracted.method,
        extractorVersion: extracted.extractorVersion,
        previousVersion,
      }
    }

    const { revision } = await persistExtraction(scope, {
      objectId,
      extracted,
      artifactId: loaded.artifact.id,
      // No fetch happened, so the recorded fetch provenance is left
      // exactly as the ingestion that performed it wrote it.
    })

    logger.info("knowledge_reextract_replaced", {
      ...log,
      method: extracted.method,
      from: previousVersion,
      to: extracted.extractorVersion,
      revision,
    })
    return {
      objectId,
      status: "replaced",
      method: extracted.method,
      extractorVersion: extracted.extractorVersion,
      previousVersion,
      revision,
    }
  } catch (err) {
    const failureCode =
      err instanceof ArchiveError || err instanceof ExtractionError ? err.code : "reextract_error"
    // The stored article is untouched — this path never writes before
    // it has a result in hand.
    logger.warn("knowledge_reextract_failed", {
      ...log,
      failureCode,
      detail: err instanceof Error ? err.message : String(err),
    })
    return { objectId, status: "failed", failureCode, previousVersion }
  }
}
