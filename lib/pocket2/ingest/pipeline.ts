import "server-only"

/* ================================================================== *
 * INGESTION PIPELINE — what one queued job actually does.
 *
 *   robots.txt -> guarded fetch -> metadata -> classify
 *              -> article extraction -> sanitize -> segment
 *              -> tag suggestion -> persist
 *
 * Two rules govern every branch below:
 *
 *  1. NEVER claim content was extracted when it was not. Every failure
 *     path records a real reason and leaves reader_status at
 *     'not_available', so the Reader offers "Open original" instead of
 *     an empty page pretending to be an article.
 *
 *  2. NEVER route around an access control. A paywall, a login wall, a
 *     robots disallow and a noarchive header are ANSWERS, not
 *     obstacles: the link and the metadata the user could see
 *     themselves are saved, and no stored copy is made.
 * ================================================================== */

import { logger } from "@/lib/observability/logger"
import { readingTimeSeconds } from "@/lib/pocket2/domain/url"
import type { ExtractionFailureReason } from "@/lib/pocket2/domain/types"
import { applyIngestResult, recordIngestFailure } from "@/lib/pocket2/repo/ingest-writes"
import { EXTRACTOR_VERSION, extractArticle } from "./extract"
import { fetchForIngest, type FetchFailureReason, type FetchResult } from "./fetch"
import { classifyContent, extractMetadata } from "./metadata"
import { checkRobots } from "./robots"
import { suggestTags } from "./tags"

export interface IngestOutcome {
  status: "ready" | "failed"
  retryable: boolean
  reason?: string
  contentType?: string
  readerAvailable?: boolean
}

/** Which fetch failures are worth asking about again. A blocked
 * address or an unsupported content type will answer the same way
 * forever; a timeout or a 5xx may not. Retrying a permanent failure
 * wastes the queue and repeatedly bothers someone else's server. */
const RETRYABLE_FETCH: Record<FetchFailureReason, boolean> = {
  blocked_unsafe_url: false,
  too_many_redirects: false,
  unsupported_content_type: false,
  too_large: false,
  robots_disallowed: false,
  paywalled: false,
  login_required: false,
  timeout: true,
  network_error: true,
  http_error: true,
}

/** Fetch failures that are really access decisions, mapped into the
 * Reader's own vocabulary so the UI can explain them in plain words. */
const FETCH_TO_EXTRACTION_REASON: Partial<Record<FetchFailureReason, ExtractionFailureReason>> = {
  paywalled: "paywalled",
  login_required: "login_required",
  robots_disallowed: "robots_disallowed",
  unsupported_content_type: "unsupported_content_type",
  too_large: "too_large",
  blocked_unsafe_url: "fetch_failed",
  too_many_redirects: "fetch_failed",
}

/** How a page is retrieved. The default is the guarded HTTP fetcher;
 * the seam exists so a headless-browser fetcher can be added later for
 * pages that render their body in JavaScript, without the rest of the
 * pipeline knowing. It also lets the pipeline be tested end to end
 * against fixture HTML rather than against the live internet. */
export type PageFetcher = (url: string, requestId?: string) => Promise<FetchResult>

/** Same seam, same reason: robots is asked over the network, and the
 * pipeline's decision logic should be testable without it. */
export type RobotsChecker = (url: string) => Promise<{ allowed: boolean; unknown: boolean; unsafe?: boolean }>

export interface IngestInput {
  orgId: string
  itemId: string
  url: string
  domain: string
  /** true on the final attempt, so a failure is recorded as terminal
   * rather than leaving the item stuck in 'pending' forever */
  lastAttempt: boolean
  requestId?: string
  fetcher?: PageFetcher
  robotsChecker?: RobotsChecker
}

export async function runMetadataIngest(input: IngestInput): Promise<IngestOutcome> {
  const { orgId, itemId, url, domain, lastAttempt, requestId } = input
  const fetchPage = input.fetcher ?? fetchForIngest
  const askRobots = input.robotsChecker ?? checkRobots
  const log = { requestId, organizationId: orgId, itemId, domain }

  // ---- 1. ask before fetching -------------------------------------
  const robots = await askRobots(url)
  if (robots.unsafe) {
    // The SSRF guard refused the address while fetching robots.txt.
    // Report it as such: saying "this site asks automated tools not to
    // fetch this page" would attribute our own refusal to a publisher.
    logger.warn("pocket2_ingest_blocked_url", { ...log, stage: "robots" })
    await recordIngestFailure(orgId, itemId, "That address can't be fetched safely.", true, "fetch_failed")
    return { status: "failed", retryable: false, reason: "blocked_unsafe_url" }
  }
  if (!robots.allowed && !robots.unknown) {
    logger.info("pocket2_ingest_robots_disallowed", log)
    await recordIngestFailure(orgId, itemId,
      "This site asks automated tools not to fetch this page, so only the link was saved.",
      true, "robots_disallowed")
    return { status: "failed", retryable: false, reason: "robots_disallowed" }
  }
  if (robots.unknown) {
    // robots.txt exists but could not be read (5xx, network). That is
    // the site being unwell, not the site consenting — try later.
    const message = "Couldn't check this site's crawl rules; will try again shortly."
    await recordIngestFailure(orgId, itemId, message, lastAttempt)
    return { status: "failed", retryable: !lastAttempt, reason: "robots_unreadable" }
  }

  // ---- 2. fetch ----------------------------------------------------
  const fetched = await fetchPage(url, requestId)
  if (!fetched.ok) {
    const retryable = RETRYABLE_FETCH[fetched.reason] && !lastAttempt
    const terminal = !retryable
    logger.info("pocket2_ingest_fetch_failed", { ...log, reason: fetched.reason, status: fetched.status })
    await recordIngestFailure(orgId, itemId, fetched.message, terminal,
      terminal ? FETCH_TO_EXTRACTION_REASON[fetched.reason] ?? "fetch_failed" : null)
    return { status: "failed", retryable, reason: fetched.reason }
  }

  // ---- 3. metadata -------------------------------------------------
  const meta = extractMetadata(fetched.html, fetched.finalUrl)

  // ---- 4. article body ---------------------------------------------
  // Skipped entirely when the publisher asked not to be archived —
  // metadata is a description of the page, a stored body is a copy of
  // it, and only the second is being declined.
  const noArchive = fetched.noArchive || meta.noArchive
  const extraction = noArchive ? null : extractArticle(fetched.html, fetched.finalUrl)

  const hasArticle = extraction?.ok === true
  const articleText = hasArticle ? extraction.text : null
  const wordCount = hasArticle ? extraction.wordCount : null

  const contentType = classifyContent(fetched.finalUrl, meta, {
    hasArticleText: hasArticle,
    wordCount: wordCount ?? 0,
  })

  // ---- 5. persist ---------------------------------------------------
  await applyIngestResult(
    orgId,
    itemId,
    {
      // A publisher's OpenGraph values were written by a person for
      // sharing, so they are authoritative. The extractor's own title,
      // excerpt and byline are passed separately as FALLBACKS, applied
      // only where nothing is stored yet — see IngestMetadataPatch.
      title: meta.title,
      description: meta.description,
      author: meta.author,
      fallbackTitle: hasArticle ? extraction.title : null,
      fallbackDescription: hasArticle ? extraction.excerpt : null,
      fallbackAuthor: hasArticle ? extraction.author : null,
      contentType,
      imageUrl: meta.imageUrl,
      faviconUrl: meta.faviconUrl,
      publishedAt: meta.publishedAt,
      // The URL after redirects is the real address of this page.
      canonicalUrl: fetched.finalUrl !== url ? fetched.finalUrl : null,
      wordCount,
      readingTimeSeconds: wordCount ? readingTimeSeconds(wordCount) : null,
      readerStatus: hasArticle ? "available" : "not_available",
      metadata: {
        siteName: meta.siteName,
        declaredType: meta.declaredType,
        language: meta.language,
        finalUrl: fetched.finalUrl,
        httpStatus: fetched.status,
        bytes: fetched.bytes,
        noArchive,
        fetchedAt: Date.now(),
        extractorVersion: EXTRACTOR_VERSION,
      },
    },
    hasArticle
      ? {
          extractionStatus: extraction.status,
          extractorVersion: EXTRACTOR_VERSION,
          failureReason: null,
          heroImageUrl: meta.imageUrl,
          html: extraction.html,
          text: extraction.text,
          language: extraction.language ?? meta.language,
          wordCount: extraction.wordCount,
          segments: extraction.segments,
        }
      : {
          // Records WHY there is no reader copy, so the Reader can say
          // "this publisher requires a subscription" rather than
          // showing a blank page or, worse, inventing one.
          extractionStatus: "failed",
          extractorVersion: EXTRACTOR_VERSION,
          failureReason: noArchive
            ? "robots_disallowed"
            : extraction && !extraction.ok
              ? extraction.reason
              : "not_readable",
          heroImageUrl: meta.imageUrl,
          html: null,
          text: null,
          language: meta.language,
          wordCount: null,
          segments: [],
        },
    suggestTags({ title: meta.title, description: meta.description, articleText, domain }),
  )

  logger.info("pocket2_ingest_ready", { ...log, contentType, readerAvailable: hasArticle, wordCount })
  return { status: "ready", retryable: false, contentType, readerAvailable: hasArticle }
}
