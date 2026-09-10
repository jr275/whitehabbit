/* ================================================================== *
 * UNDERSTAND — the data contract for the editorial Knowledge surface.
 *
 * Every shape here is written as if it already came from the server,
 * because the whole point is that the components cannot tell. The
 * adapter hooks in ./hooks.ts currently resolve deterministic demo
 * data; swapping them for real fetches must not require touching a
 * single component.
 *
 * Two rules the shapes enforce, both learned from how this kind of
 * surface goes wrong:
 *
 *  1. NOTHING IS A BARE NUMBER. Every count that a person reads as a
 *     claim ("18 items mention both") carries the ids it was counted
 *     from, so the UI can always show its work and a later real
 *     implementation cannot quietly stop being able to.
 *  2. EVERY EDGE HAS A REASON. A connection without `evidence` is not
 *     representable — which is what stops this from becoming a
 *     decorative network graph.
 * ================================================================== */

/** Marks a value the demo currently supplies. The UI reads this to
 *  label the surface honestly rather than presenting invented counts
 *  as though they were the viewer's real library. */
export type DataOrigin = "demo" | "live"

export interface KnowledgeOverview {
  origin: DataOrigin
  savedCount: number
  conceptCount: number
  themeCount: number
  questionCount: number
  /** ISO date of the earliest saved item — anchors the timeline. */
  since: string
}

export interface KnowledgeConcept {
  id: string
  label: string
  /** How many saved objects this concept was found in. */
  itemCount: number
  themeId: string
}

export interface KnowledgeTheme {
  id: string
  label: string
  /** One sentence: what this theme actually is, in the user's terms. */
  summary: string
  itemCount: number
  sourceCount: number
  conceptIds: string[]
  /** Human-readable recency, e.g. "4 saves this month". */
  recentActivity: string
  /** The open question this theme keeps circling, if there is one. */
  emergingQuestionId?: string
  /** 0-1. Drives typographic weight in the cluster list — a theme the
   *  library keeps returning to should LOOK heavier than a passing one. */
  intensity: number
}

/** A relationship between two concepts. `evidence` is required: an
 *  edge that cannot say why it exists has no business being drawn. */
export interface KnowledgeConnection {
  id: string
  sourceId: string
  targetId: string
  /** Number of saved objects mentioning both ends. */
  coOccurrences: number
  /** The sentence shown when the edge is selected. */
  evidence: string
  objectIds: string[]
}

export interface KnowledgeTimelineEvent {
  id: string
  /** Year bucket. Coarse on purpose — this is about eras of interest,
   *  not a changelog. */
  year: number
  label: string
  themeId: string
  /** What actually changed in the library when this appeared. */
  detail: string
  itemCount: number
  objectIds: string[]
}

export interface KnowledgeQuestion {
  id: string
  question: string
  /** Which themes produced it — the question is *derived*, not asked. */
  themeIds: string[]
  /** How many saved items touch it without resolving it. */
  supportingCount: number
}

export type InsightKind =
  | "emerging_topic"
  | "recurring_theme"
  | "knowledge_gap"
  | "contradiction"
  | "new_connection"
  | "changed_interest"

/** A contradiction needs two named sides; a gap needs a present set and
 *  an absent one. Rather than one loose bag of optional fields, each
 *  kind carries exactly the payload it can actually render. */
export type InsightDetail =
  | { kind: "contradiction"; claimA: InsightClaim; claimB: InsightClaim }
  | { kind: "knowledge_gap"; explored: string[]; missing: string[] }
  | { kind: "changed_interest"; alreadyKnown: string[]; newlyAdded: string[]; sourceCount: number }
  | { kind: "plain" }

export interface InsightClaim {
  statement: string
  source: string
  savedAt: string
}

export interface KnowledgeInsight {
  id: string
  kind: InsightKind
  /** The short editorial line: what Keeply noticed. */
  headline: string
  /** Two or three sentences of explanation. */
  body: string
  callToAction: string
  themeIds: string[]
  detail: InsightDetail
}

export type KnowledgeObjectKind = "article" | "video" | "pdf" | "note"

export interface KnowledgeObject {
  id: string
  title: string
  source: string
  kind: KnowledgeObjectKind
  savedAt: string
  /** Concept ids this object was found to contain. */
  conceptIds: string[]
  /** One line of what Keeply took from it. Never a summary of the
   *  whole piece — the point is what it ADDED. */
  insight: string
  revisits: number
  /** 0-1 relevance for the "Relevant" sort. */
  relevance: number
}

export interface KnowledgeEvidence {
  objectId: string
  title: string
  source: string
  /** The passage that supports the answer. */
  excerpt: string
}

export interface AskResult {
  question: string
  /** The answer, in paragraphs. Rendered as prose, never as chat. */
  answer: string[]
  /** The ideas that recur across the evidence. */
  recurringIdeas: string[]
  evidence: KnowledgeEvidence[]
  relatedObjectIds: string[]
  connectedConceptIds: string[]
}

/* ---- research state machine ---------------------------------------- */

export const RESEARCH_STAGES = [
  "understanding",
  "searching",
  "analyzing",
  "comparing",
] as const

export type ResearchStage = (typeof RESEARCH_STAGES)[number]

export type ResearchStatus = "idle" | "running" | "complete" | "error"

export interface ResearchFinding {
  /** What the library already held on this question. */
  existingSourceCount: number
  existingSummary: string
  /** What a web pass would add. */
  webSourceCount: number
  webSummary: string
  /** The delta — the reason to run it at all. */
  whatChanged: string[]
  sources: { title: string; domain: string; isNew: boolean }[]
}

export interface ResearchState {
  status: ResearchStatus
  objective: string
  stage: ResearchStage | null
  /** Stages already finished, in order. */
  completed: ResearchStage[]
  finding: ResearchFinding | null
  error: string | null
}

/* ---- voice ---------------------------------------------------------- */

export type VoiceStatus = "idle" | "listening" | "processing" | "understood" | "answering" | "error"

/** What the transcript was understood to MEAN, expressed only in terms
 *  of capabilities Knowledge already has. There is no voice-only
 *  action, by construction. */
export type VoiceIntentKind = "ask" | "search" | "research" | "save" | "unknown"

export interface VoiceState {
  status: VoiceStatus
  transcript: string
  intent: VoiceIntentKind | null
  /** Plain-language rendering of the routing decision, e.g. "ASK → KNOWLEDGE". */
  routedTo: string | null
  error: string | null
}
