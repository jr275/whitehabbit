/**
 * Knowledge Intelligence — frontend data contracts.
 *
 * These are the shapes the /knowledge experience renders. TODAY they are
 * fed by deterministic preview data (see `mock.ts`) behind the async
 * adapter in `client.ts`. NOTHING in the UI reads mock data directly, so
 * when the real Knowledge Intelligence backend exists, only `client.ts`
 * changes — every component keeps working against these exact types.
 *
 * Provenance is a first-class field on every envelope so the UI can be
 * honest about where the data came from ("Preview data") and never
 * pretends generated intelligence is real user data.
 */

export type Provenance = "preview" | "live"

/** Every adapter call returns data wrapped like a future API response. */
export interface Envelope<T> {
  data: T
  provenance: Provenance
  /** Days before "now" this view was computed (kept relative + deterministic). */
  computedDaysAgo: number
}

// ── Overview + Signals ────────────────────────────────────────────────

export interface KnowledgeOverview {
  totalItems: number
  readItems: number
  favoriteItems: number
  conceptCount: number
  connectionCount: number
  openQuestionCount: number
  /** Saves per week, oldest → newest, for a sparkline. */
  weeklySaves: number[]
  topThemes: { id: string; label: string; weight: number }[]
}

export interface Signal {
  id: string
  label: string
  value: number
  /** Change vs the previous comparable period, as a signed integer. */
  delta: number
  unit?: string
  hint: string
}

// ── Concepts ──────────────────────────────────────────────────────────

export type ConceptKind = "person" | "technology" | "theory" | "event" | "organization" | "method"

export interface Concept {
  id: string
  label: string
  kind: ConceptKind
  /** Number of saved items that reference this concept. */
  mentions: number
  /** 0..1 centrality within the graph. */
  strength: number
  summary: string
  relatedConceptIds: string[]
  sourceItemIds: string[]
}

// ── Themes ────────────────────────────────────────────────────────────

export type Momentum = "rising" | "steady" | "cooling"

export interface ThemeChild {
  id: string
  label: string
  type: "subtheme" | "item"
  weight: number
}

export interface Theme {
  id: string
  label: string
  description: string
  itemCount: number
  conceptIds: string[]
  momentum: Momentum
  /** 0..1 share of the library this theme covers. */
  coverage: number
  children: ThemeChild[]
}

// ── Connections (graph) ───────────────────────────────────────────────

export type NodeType = "concept" | "item" | "theme"
export type EdgeKind = "supports" | "relates" | "contradicts" | "extends"

export interface GraphNode {
  id: string
  label: string
  type: NodeType
  weight: number
  /** Deterministic layout coordinates in a 0..100 viewbox space. */
  x: number
  y: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  kind: EdgeKind
  strength: number
}

export interface ConnectionGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// ── Timeline ──────────────────────────────────────────────────────────

export type TimelineKind = "saved" | "concept-emerged" | "theme-shift" | "milestone"

export interface TimelineEvent {
  id: string
  daysAgo: number
  title: string
  kind: TimelineKind
  detail: string
  itemIds: string[]
}

// ── Emerging Questions ────────────────────────────────────────────────

export interface EmergingQuestion {
  id: string
  question: string
  rationale: string
  /** 0..1 how strongly the library implies this question. */
  confidence: number
  relatedConceptIds: string[]
  /** Pre-composed text for the existing Ask surface. */
  suggestedAsk: string
}

// ── Insights ──────────────────────────────────────────────────────────

export type InsightType = "pattern" | "trend" | "outlier" | "synthesis"

export interface Insight {
  id: string
  title: string
  body: string
  type: InsightType
  confidence: number
  evidenceItemIds: string[]
  conceptIds: string[]
}

// ── Knowledge Gaps ────────────────────────────────────────────────────

export type Severity = "low" | "medium" | "high"

export interface KnowledgeGap {
  id: string
  label: string
  description: string
  severity: Severity
  suggestion: string
  relatedThemeId?: string
}

// ── Contradictions ────────────────────────────────────────────────────

export interface ContradictionSide {
  claim: string
  itemId: string
  sourceLabel: string
}

export interface Contradiction {
  id: string
  topic: string
  a: ContradictionSide
  b: ContradictionSide
  status: "unresolved" | "reviewing"
}

// ── What Changed ──────────────────────────────────────────────────────

export type ChangeType =
  | "concept-added"
  | "connection-formed"
  | "theme-rising"
  | "insight-generated"
  | "gap-detected"

export interface ChangeEntry {
  id: string
  daysAgo: number
  type: ChangeType
  summary: string
  refId?: string
}

// ── Drawer object (shared detail view) ────────────────────────────────

/** A normalized shape any surface can hand to the object drawer. Keeps the
 *  drawer decoupled from each surface's concrete type. */
export interface DrawerObject {
  id: string
  kind: string
  title: string
  subtitle?: string
  chips: { label: string; tone?: "default" | "accent" | "warn" }[]
  sections: { heading: string; body: string }[]
  /** Pre-composed question for the existing Ask surface, if relevant. */
  ask?: string
  relatedLabels?: string[]
}
