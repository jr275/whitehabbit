/* ================================================================== *
 * POCKET2 DOMAIN TYPES — pure types and constants. No I/O, no
 * database, no React. Safe to import from anywhere (server, client,
 * tests) precisely because it depends on nothing.
 *
 * Every union here is mirrored by a CHECK constraint in
 * migrations/0002_pocket2.sql — the database and these types are two
 * expressions of one contract, not two independent guesses.
 * ================================================================== */

/* ---- content classification ------------------------------------- */

export const CONTENT_TYPES = [
  "article",
  "video",
  "news",
  "blog_post",
  "document",
  "product",
  "social_post",
  "website",
  "podcast",
  "other",
  "unknown",
] as const

export type ContentType = (typeof CONTENT_TYPES)[number]

/** What the product can honestly offer for each kind of content.
 * The Reader and the Listen action read this — they never assume a
 * saved URL is readable. `readable` here means "extraction is worth
 * attempting", NOT "extraction succeeded"; only
 * SavedItem.readerStatus reports the latter. */
export const CONTENT_TYPE_CAPABILITY: Record<ContentType, { readable: boolean; listenable: boolean }> = {
  article: { readable: true, listenable: true },
  news: { readable: true, listenable: true },
  blog_post: { readable: true, listenable: true },
  document: { readable: true, listenable: true },
  social_post: { readable: true, listenable: false },
  podcast: { readable: false, listenable: true },
  video: { readable: false, listenable: false },
  product: { readable: false, listenable: false },
  website: { readable: true, listenable: true },
  other: { readable: false, listenable: false },
  unknown: { readable: false, listenable: false },
}

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  article: "Article",
  video: "Video",
  news: "News",
  blog_post: "Blog post",
  document: "Document",
  product: "Product",
  social_post: "Social post",
  website: "Website",
  podcast: "Podcast",
  other: "Other",
  unknown: "Unknown",
}

/* ---- lifecycle states -------------------------------------------- */

export const INGEST_STATUSES = ["pending", "processing", "ready", "failed"] as const
export type IngestStatus = (typeof INGEST_STATUSES)[number]

/** Whether a reader representation actually exists. Deliberately
 * independent of IngestStatus: an item can ingest perfectly (real
 * title, description, image) and still have no extractable article
 * body. Conflating the two is how a product ends up claiming it
 * extracted content it never had. */
export const READER_STATUSES = ["not_available", "available", "failed"] as const
export type ReaderStatus = (typeof READER_STATUSES)[number]

export const ITEM_STATUSES = ["unread", "read", "archived"] as const
export type ItemStatus = (typeof ITEM_STATUSES)[number]

export const AUDIO_STATUSES = ["not_requested", "queued", "processing", "ready", "failed"] as const
export type AudioStatus = (typeof AUDIO_STATUSES)[number]

export const SEGMENT_KINDS = ["paragraph", "heading", "list_item", "quote", "caption", "code"] as const
export type SegmentKind = (typeof SEGMENT_KINDS)[number]

/** Why a reader document is incomplete, in the product's own
 * vocabulary. These are shown to the user as honest explanations —
 * "This publisher requires a subscription" — never swallowed and
 * never replaced with fabricated text. */
export const EXTRACTION_FAILURE_REASONS = [
  "paywalled",
  "login_required",
  "robots_disallowed",
  "not_readable",
  "fetch_failed",
  "too_large",
  "unsupported_content_type",
] as const
export type ExtractionFailureReason = (typeof EXTRACTION_FAILURE_REASONS)[number]

/* ---- roles ------------------------------------------------------- */

export const ROLES = ["owner", "admin", "member"] as const
export type Role = (typeof ROLES)[number]

/** Ordered by privilege. requireRole() compares against this, so a
 * new tier is added in one place. */
export const ROLE_RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 }

/* ---- entities ---------------------------------------------------- */

export interface SavedItem {
  id: string
  orgId: string
  createdBy: string | null
  /** exactly what the user submitted — preserved for "open original" */
  url: string
  /** normalized form used for identity/dedupe */
  canonicalUrl: string
  domain: string
  title: string | null
  description: string | null
  author: string | null
  contentType: ContentType
  imageUrl: string | null
  faviconUrl: string | null
  publishedAt: number | null
  savedAt: number
  wordCount: number | null
  readingTimeSeconds: number | null
  ingestStatus: IngestStatus
  ingestError: string | null
  ingestAttempts: number
  readerStatus: ReaderStatus
  createdAt: number
  updatedAt: number
}

/** Per-user state. Separate from SavedItem because read/favorite/
 * position belong to (item, person), not to the item. */
export interface SavedItemState {
  itemId: string
  userId: string
  orgId: string
  status: ItemStatus
  isFavorite: boolean
  readAt: number | null
  archivedAt: number | null
  favoritedAt: number | null
  readingProgress: number
  readingSegmentId: string | null
  listeningPositionMs: number | null
  listeningSegmentId: string | null
  playbackSpeed: number
  listenCompleted: boolean
}

/** What the library and the cards actually render: the item plus this
 * viewer's state plus its labels. Assembled in the repo with joins,
 * never by N+1 lookups from a component. */
export interface SavedItemView extends SavedItem {
  state: SavedItemState | null
  tags: { id: string; name: string; slug: string }[]
  collections: { id: string; name: string; slug: string }[]
}

export interface Collection {
  id: string
  orgId: string
  createdBy: string | null
  name: string
  slug: string
  description: string | null
  color: string | null
  icon: string | null
  itemCount: number
  position: number
  createdAt: number
  updatedAt: number
}

export interface Tag {
  id: string
  orgId: string
  name: string
  slug: string
  color: string | null
  usageCount: number
  createdAt: number
}

/* ---- query shapes ------------------------------------------------ */

export const SORT_OPTIONS = ["newest", "oldest", "title", "reading_time", "domain"] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

export const DATE_RANGES = ["all", "today", "week", "month", "custom"] as const
export type DateRange = (typeof DATE_RANGES)[number]

/** Every filter dimension the library supports. They combine
 * (Articles + Unread + tag:ai), which is why this is one object
 * resolved into one SQL statement rather than chained filters. */
export interface LibraryQuery {
  search?: string
  contentTypes?: ContentType[]
  status?: ItemStatus | "favorite"
  domains?: string[]
  tagSlugs?: string[]
  collectionSlug?: string
  dateRange?: DateRange
  dateFrom?: number
  dateTo?: number
  sort?: SortOption
  limit?: number
  /** opaque keyset cursor — never an OFFSET */
  cursor?: string
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

export const DEFAULT_PAGE_SIZE = 30
export const MAX_PAGE_SIZE = 100
