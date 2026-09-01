/**
 * Knowledge domain types.
 *
 * These describe a *piece of knowledge* — not merely a saved URL. Components
 * are typed against these interfaces so the demo data source can be swapped
 * for the real Knowledge API without touching the UI.
 */

export type KnowledgeKind =
  | "article"
  | "video"
  | "pdf"
  | "podcast"
  | "social"
  | "document"

/** Lifecycle of a saved item as the system ingests and understands it. */
export type KnowledgeState =
  | "saved"
  | "processing"
  | "ready"
  | "failed"
  | "archived"

/** Discrete, honest processing phases — never fake percentages. */
export type ProcessingPhase =
  | "fetching" // Fetching content…
  | "understanding" // Understanding…
  | "organizing" // Organizing…

export type ReadState = "unread" | "read"

export interface KnowledgeItem {
  id: string
  kind: KnowledgeKind
  state: KnowledgeState
  /** Only meaningful while state === "processing". */
  phase?: ProcessingPhase
  readState: ReadState
  favorite: boolean

  title: string
  /** Short human excerpt pulled from the source. */
  excerpt?: string
  /** System-generated understanding of the piece. */
  aiSummary?: string

  source: string // e.g. "The Verge"
  author?: string
  /** Local cover path under /public, or undefined for text-forward variants. */
  cover?: string
  domain?: string

  topics: string[]
  collectionIds: string[]

  /** Minutes to read / watch / listen. */
  durationMin?: number
  /** ISO date string. */
  savedAt: string
}

export interface Collection {
  id: string
  name: string
  /** True when the collection was assembled automatically by the system. */
  auto: boolean
  description?: string
  itemCount: number
  /** Up to a few cover paths used to build a mosaic preview. */
  covers: string[]
  accent: "blue" | "green" | "amber" | "neutral"
}

export interface Topic {
  id: string
  label: string
  count: number
  /** 0–1 relative momentum for a subtle sparkline / emphasis. */
  momentum: number
}

/** A single editorial "Today's Intelligence" observation. */
export interface Insight {
  id: string
  kind: "connection" | "trend" | "revisit"
  body: string
  relatedItemIds: string[]
}

export type ViewMode = "masonry" | "grid" | "list"

export type PrimaryFilter =
  | "all"
  | "unread"
  | "read"
  | "favorites"
  | "recent"
