/* ================================================================== *
 * API CONTRACTS
 *
 * The wire shapes the Knowledge API returns. Deliberately a narrower
 * projection than the domain types: internal columns (url_hash,
 * content_hash, extractor version, workspace id) are NOT exposed.
 * Clients get what they need to render, nothing about how it is
 * stored.
 *
 * Pure module — importable by both server routes and client
 * components, and by tests.
 * ================================================================== */

import type { KnowledgeObject, KnowledgeObjectWithContent } from "../content/types.ts"

/** A card in the library list. */
export interface KnowledgeItemDto {
  id: string
  submittedUrl: string
  /** The URL actually fetched, once known. */
  url: string
  domain: string
  title: string | null
  authors: string[]
  excerpt: string | null
  publishedAt: number | null
  siteName: string | null
  imageUrl: string | null
  faviconUrl: string | null
  wordCount: number | null
  readingTimeSeconds: number | null
  status: KnowledgeObject["status"]
  failureCode: string | null
  failureMessage: string | null
  createdAt: number
}

export interface KnowledgeItemDetailDto extends KnowledgeItemDto {
  contentHtml: string | null
  contentText: string | null
  hasContent: boolean
}

export interface KnowledgeListResponse {
  items: KnowledgeItemDto[]
  nextCursor: string | null
}

export interface SaveResponse {
  item: KnowledgeItemDto
  /** True when this URL was already saved: no fetch was performed. */
  duplicate: boolean
}

export interface ProcessingResponse {
  id: string
  status: KnowledgeObject["status"]
  failureCode: string | null
  failureMessage: string | null
  /** Present while work is outstanding. */
  attempt: number | null
  maxAttempts: number | null
  nextAttemptAt: number | null
  updatedAt: number
}

export function toItemDto(object: KnowledgeObject): KnowledgeItemDto {
  return {
    id: object.id,
    submittedUrl: object.submittedUrl,
    url: object.resolvedUrl ?? object.canonicalUrl,
    domain: object.domain,
    title: object.title,
    authors: object.authors,
    excerpt: object.excerpt,
    publishedAt: object.publishedAt,
    siteName: object.siteName,
    imageUrl: object.imageUrl,
    faviconUrl: object.faviconUrl,
    wordCount: object.wordCount,
    readingTimeSeconds: object.readingTimeSeconds,
    status: object.status,
    failureCode: object.failureCode,
    failureMessage: object.failureMessage,
    createdAt: object.createdAt,
  }
}

export function toDetailDto(result: KnowledgeObjectWithContent): KnowledgeItemDetailDto {
  return {
    ...toItemDto(result.object),
    contentHtml: result.content?.contentHtml ?? null,
    contentText: result.content?.contentText ?? null,
    hasContent: Boolean(result.content?.contentHtml || result.content?.contentText),
  }
}
