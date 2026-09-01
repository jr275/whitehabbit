/* ================================================================== *
 * KNOWLEDGE OBJECT — the canonical internal representation.
 *
 * One saved thing. Deliberately EXCLUDES the content bytes (they are
 * large and read only in the reader) and all per-user state (a
 * person's relationship with an article is not a property of the
 * article — see Phase 2 §8).
 *
 * Only five fields are genuinely mandatory: submittedUrl, canonicalUrl,
 * urlHash, domain and status. Everything else may legitimately be
 * null, and every consumer must render correctly when it is. That is a
 * data contract, not a styling preference.
 * ================================================================== */

import type { ObjectStatus } from "../ingestion/state.ts"

export interface KnowledgeObject {
  id: string
  workspaceId: string
  createdBy: string | null

  // ---- source identity ----
  submittedUrl: string
  canonicalUrl: string
  urlHash: string
  resolvedUrl: string | null
  originUrl: string | null
  domain: string

  // ---- extracted metadata (all optional) ----
  title: string | null
  authors: string[]
  excerpt: string | null
  publishedAt: number | null
  language: string | null
  siteName: string | null
  imageUrl: string | null
  faviconUrl: string | null
  wordCount: number | null
  readingTimeSeconds: number | null

  // ---- ingestion state ----
  status: ObjectStatus
  failureCode: string | null
  /** Plain language, safe to show a user. Never a stack trace. */
  failureMessage: string | null
  extractor: string | null
  httpStatus: number | null

  createdAt: number
  updatedAt: number
}

/** The bytes. Split from the root; fetched only for the reader. */
export interface KnowledgeContent {
  objectId: string
  /** Sanitised on write — never raw source HTML. */
  contentHtml: string | null
  contentText: string | null
  contentHash: string | null
  extractedAt: number
}

/** A person's relationship with an object, never the object itself. */
export interface KnowledgeUserState {
  userId: string
  objectId: string
  lastOpenedAt: number | null
  openedCount: number
}

export interface KnowledgeObjectWithContent {
  object: KnowledgeObject
  content: KnowledgeContent | null
  userState: KnowledgeUserState | null
}
