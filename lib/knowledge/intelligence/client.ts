/**
 * Knowledge Intelligence adapter — the SINGLE seam between the /knowledge
 * UI and its data source.
 *
 * Today every method resolves deterministic preview data from `mock.ts`,
 * wrapped in an {@link Envelope} tagged `provenance: "preview"`. When the
 * real backend exists, each method's body is replaced with a `fetch()` to
 * the corresponding route (e.g. `/api/knowledge/intelligence/concepts`)
 * returning `provenance: "live"`. The method signatures and return types
 * do not change, so no component is rewritten.
 *
 * This mirrors the existing `lib/knowledge/client.ts` boundary that
 * already fronts the real Knowledge REST API.
 */

import * as mock from "./mock"
import type {
  ChangeEntry,
  Concept,
  ConnectionGraph,
  Contradiction,
  EmergingQuestion,
  Envelope,
  Insight,
  KnowledgeGap,
  KnowledgeOverview,
  Signal,
  Theme,
  TimelineEvent,
} from "./types"

/** Small, fixed delay so the UI exercises real loading states. */
const PREVIEW_LATENCY_MS = 180

function preview<T>(data: T, computedDaysAgo = 0): Promise<Envelope<T>> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ data, provenance: "preview", computedDaysAgo }), PREVIEW_LATENCY_MS)
  })
}

export const intelligence = {
  getOverview: (): Promise<Envelope<KnowledgeOverview>> => preview(mock.overview),
  getSignals: (): Promise<Envelope<Signal[]>> => preview(mock.signals),
  getConcepts: (): Promise<Envelope<Concept[]>> => preview(mock.concepts),
  getThemes: (): Promise<Envelope<Theme[]>> => preview(mock.themes),
  getGraph: (): Promise<Envelope<ConnectionGraph>> => preview(mock.graph),
  getTimeline: (): Promise<Envelope<TimelineEvent[]>> => preview(mock.timeline),
  getQuestions: (): Promise<Envelope<EmergingQuestion[]>> => preview(mock.questions),
  getInsights: (): Promise<Envelope<Insight[]>> => preview(mock.insights),
  getGaps: (): Promise<Envelope<KnowledgeGap[]>> => preview(mock.gaps),
  getContradictions: (): Promise<Envelope<Contradiction[]>> => preview(mock.contradictions),
  getChanges: (): Promise<Envelope<ChangeEntry[]>> => preview(mock.changes),
}

export type IntelligenceClient = typeof intelligence
