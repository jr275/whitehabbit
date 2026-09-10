/**
 * Knowledge Intelligence adapter — the SINGLE seam between the /knowledge
 * UI and its data source.
 *
 * There is exactly ONE switch here: `PROVIDER`. It selects between the
 * deterministic `mock` provider (used today) and the `live` provider that
 * talks to the real Knowledge Intelligence API. Both providers implement
 * the same {@link IntelligenceProvider} interface and return the same
 * {@link Envelope} shapes, so flipping the switch changes the data source
 * and nothing else — no component, hook, or type is touched.
 *
 * Flip it in one of two ways, both resolved in `resolveProvider()` below:
 *   1. Set NEXT_PUBLIC_KNOWLEDGE_INTELLIGENCE=live in the environment, or
 *   2. Change PROVIDER_DEFAULT to "live" once the API exists.
 *
 * The mock provider tags every envelope `provenance: "preview"`; the live
 * provider returns whatever the API reports (`"live"`). The UI reads
 * `provenance` to stay honest about where the data came from.
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

/**
 * The data-source contract. Every method returns a future-API-shaped
 * {@link Envelope}. Both the mock and live providers implement this, and
 * the exported `intelligence` client is typed to it — so the two are
 * guaranteed interchangeable at compile time.
 */
export interface IntelligenceProvider {
  getOverview(signal?: AbortSignal): Promise<Envelope<KnowledgeOverview>>
  getSignals(signal?: AbortSignal): Promise<Envelope<Signal[]>>
  getConcepts(signal?: AbortSignal): Promise<Envelope<Concept[]>>
  getThemes(signal?: AbortSignal): Promise<Envelope<Theme[]>>
  getGraph(signal?: AbortSignal): Promise<Envelope<ConnectionGraph>>
  getTimeline(signal?: AbortSignal): Promise<Envelope<TimelineEvent[]>>
  getQuestions(signal?: AbortSignal): Promise<Envelope<EmergingQuestion[]>>
  getInsights(signal?: AbortSignal): Promise<Envelope<Insight[]>>
  getGaps(signal?: AbortSignal): Promise<Envelope<KnowledgeGap[]>>
  getContradictions(signal?: AbortSignal): Promise<Envelope<Contradiction[]>>
  getChanges(signal?: AbortSignal): Promise<Envelope<ChangeEntry[]>>
}

// ── Provider selection (the one switch) ───────────────────────────────

type ProviderName = "mock" | "live"

/** Default when the env flag is unset. Change to "live" once the API ships. */
const PROVIDER_DEFAULT: ProviderName = "mock"

function resolveProvider(): ProviderName {
  const flag = process.env.NEXT_PUBLIC_KNOWLEDGE_INTELLIGENCE
  if (flag === "live" || flag === "mock") return flag
  return PROVIDER_DEFAULT
}

// ── Mock provider (preview data) ──────────────────────────────────────

/** Small, fixed delay so the UI exercises real loading states. */
const PREVIEW_LATENCY_MS = 180

function preview<T>(data: T, computedDaysAgo = 0): Promise<Envelope<T>> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ data, provenance: "preview", computedDaysAgo }), PREVIEW_LATENCY_MS)
  })
}

const mockProvider: IntelligenceProvider = {
  getOverview: () => preview(mock.overview),
  getSignals: () => preview(mock.signals),
  getConcepts: () => preview(mock.concepts),
  getThemes: () => preview(mock.themes),
  getGraph: () => preview(mock.graph),
  getTimeline: () => preview(mock.timeline),
  getQuestions: () => preview(mock.questions),
  getInsights: () => preview(mock.insights),
  getGaps: () => preview(mock.gaps),
  getContradictions: () => preview(mock.contradictions),
  getChanges: () => preview(mock.changes),
}

// ── Live provider (real API) ──────────────────────────────────────────

/**
 * Talks to the real Knowledge Intelligence routes. These endpoints do not
 * exist yet — this provider is inert until PROVIDER resolves to "live".
 * Each method is a one-line GET to its route; the API is expected to
 * return an {@link Envelope} JSON body with `provenance: "live"`.
 */
const INTELLIGENCE_BASE = "/api/knowledge/intelligence"

async function getJson<T>(path: string, signal?: AbortSignal): Promise<Envelope<T>> {
  const res = await fetch(`${INTELLIGENCE_BASE}${path}`, {
    signal,
    headers: { accept: "application/json" },
  })
  if (!res.ok) throw new Error(`Knowledge Intelligence ${path} failed: ${res.status}`)
  return (await res.json()) as Envelope<T>
}

const liveProvider: IntelligenceProvider = {
  getOverview: (signal) => getJson<KnowledgeOverview>("/overview", signal),
  getSignals: (signal) => getJson<Signal[]>("/signals", signal),
  getConcepts: (signal) => getJson<Concept[]>("/concepts", signal),
  getThemes: (signal) => getJson<Theme[]>("/themes", signal),
  getGraph: (signal) => getJson<ConnectionGraph>("/graph", signal),
  getTimeline: (signal) => getJson<TimelineEvent[]>("/timeline", signal),
  getQuestions: (signal) => getJson<EmergingQuestion[]>("/questions", signal),
  getInsights: (signal) => getJson<Insight[]>("/insights", signal),
  getGaps: (signal) => getJson<KnowledgeGap[]>("/gaps", signal),
  getContradictions: (signal) => getJson<Contradiction[]>("/contradictions", signal),
  getChanges: (signal) => getJson<ChangeEntry[]>("/changes", signal),
}

// ── Exported client ───────────────────────────────────────────────────

const PROVIDERS: Record<ProviderName, IntelligenceProvider> = {
  mock: mockProvider,
  live: liveProvider,
}

/** The active provider, chosen once at module load by `resolveProvider()`. */
export const intelligence: IntelligenceProvider = PROVIDERS[resolveProvider()]

export type IntelligenceClient = typeof intelligence
