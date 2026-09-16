/**
 * Knowledge domain types.
 *
 * These describe a *piece of knowledge* — a saved URL as it moves through
 * the real ingestion pipeline (lib/knowledge/service.ts) and is persisted
 * in the `knowledge_items` table (migrations/0002_knowledge.sql).
 *
 * Components are typed against these interfaces and receive them via the
 * adapter (lib/knowledge/adapter.ts), so the UI never sees a database row
 * shape and the domain layer never imports React.
 */

export type KnowledgeKind =
  | "article"
  | "video"
  | "pdf"
  | "podcast"
  | "social"
  | "document"

/**
 * The real lifecycle state machine, matching the backend exactly:
 *   saved → fetching → extracting → ready | failed
 *
 * There are deliberately NO fabricated "AI understanding" phases — the
 * pipeline reflects what the server actually does (validate, fetch,
 * extract). Additional states can appear here only when a real service
 * produces them. `archived`/`favorite` are flags on the item, not states.
 */
export type KnowledgeState =
  | "saved"
  | "fetching"
  | "extracting"
  | "ready"
  | "failed"

export type ReadState = "unread" | "read"

export interface KnowledgeItem {
  id: string
  kind: KnowledgeKind
  state: KnowledgeState
  readState: ReadState
  favorite: boolean
  archived: boolean

  /** The URL the user saved, and the resolved display domain. */
  url: string
  domain?: string

  title: string
  /** Short human excerpt pulled from the source (meta description). */
  excerpt?: string
  /** Reserved for a real AI summary; undefined until that pipeline exists. */
  aiSummary?: string

  source: string // publication / site name, falling back to domain
  author?: string
  /** Remote lead image URL (og:image), rendered as a plain no-referrer
   *  <img>. Never with crossOrigin: nothing reads its pixels, and CORS
   *  mode makes every host that omits Access-Control-Allow-Origin — the
   *  majority — fail to load. */
  cover?: string
  /** Source site icon URL (favicon), shown as the small source glyph;
   *  falls back to the kind icon when absent or it fails to load. */
  favicon?: string

  topics: string[]

  /** Minutes to read, derived from real word count. */
  durationMin?: number
  /** Human-readable failure reason when state === "failed". */
  error?: string
  /** ISO date string. */
  savedAt: string
}

/** The full reader payload — includes the extracted body text. */
export interface KnowledgeDocument extends KnowledgeItem {
  contentText?: string
  publishedAt?: string
  wordCount?: number
  attempts: number
}

export interface Topic {
  id: string
  label: string
  count: number
  /** 0–1 relative momentum for a subtle sparkline / emphasis. */
  momentum: number
}

export type ViewMode = "masonry" | "grid" | "list"

export type PrimaryFilter =
  | "all"
  | "unread"
  | "read"
  | "favorites"
  | "recent"

/** Paginated list envelope returned by GET /api/knowledge. */
/**
 * Why a search result is here — the passage that matched, not a
 * sentence about it.
 *
 * Only ever built from a chunk the semantic retriever actually
 * returned. An item found by its title has no passage behind it, so it
 * carries no evidence and the surface shows none: inventing a snippet
 * for a lexical hit would put an explanation under a result that the
 * explanation did not cause.
 */
export interface SearchEvidence {
  /** The passage, truncated for display. The stored chunk is never
   *  altered — this is a view of it. */
  snippet: string
  chunkId: string
  /** Position of the passage within the item, 0-based, so a reader can
   *  be told roughly where in the piece it sits. */
  ordinal: number
  /** Character offsets into the extracted text, when the chunker
   *  recorded them. Null for chunks written before offsets existed. */
  charStart: number | null
  charEnd: number | null
  /** Cosine similarity in [0,1], carried through so a caller can see
   *  how strong the match was rather than trusting that it was shown. */
  similarity: number
}

export interface KnowledgeListResult {
  items: KnowledgeItem[]
  total: number
  hasMore: boolean
  nextOffset: number | null
}
