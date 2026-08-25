/* ================================================================== *
 * MARKETING SUPER AGENT — domain types for the WORLD -> BRAND ->
 * AUDIENCE -> OPPORTUNITY -> CREATIVE loop.
 *
 * These are NOT new database entities. Every one of them lives inside
 * a real WorkerOutput.structured payload — exactly like TrendsPayload
 * (skill_trend_research) or LeadsPayload (skill_lead_qualification)
 * already do. That means IntelligenceSignal/CreativeOpportunity/
 * CreativeConcept get the full existing provenance chain (WorkerOutput
 * -> WorkerExecution -> BusinessEvent -> MetricRecord), org isolation,
 * and the Outputs Hub for free — no parallel architecture, no new
 * migration, no new table. See lib/agent/skills/cultural-intelligence.ts
 * and lib/agent/skills/creative-territory-generation.ts for where these
 * are actually produced, and lib/marketing/opportunity-engine.ts for
 * the real, deterministic scoring that turns a signal into an
 * opportunity.
 *
 * client+server safe — no "server-only" import, so the Command Center
 * UI can share these shapes directly.
 * ================================================================== */

/** A real, observed cultural/market signal. `velocity`/`acceleration`/
 * `volume`/`sentiment`/`novelty`/`confidence` are the LLM's own
 * structural read of the real search results it was given for THIS
 * execution — the same honesty pattern as `confidence` on an existing
 * skill's structured output (skill_trend_research, skill_seo_
 * opportunity): a real, cited judgment grounded in real sources, never
 * a random or invented number. `source` is "web_search" today — the
 * only real signal source this deployment has; adding Brazil Intel /
 * Google Trends / X later means a new `source` value and a new tool,
 * never a rewrite of this shape (section 4 of the Marketing brief). */
export interface IntelligenceSignal {
  id: string
  source: "web_search" | "brazil_intel" | "google_trends" | "x" | "news"
  sourceEventId?: string
  topic: string
  category: string
  geography?: string
  velocity: number // 0-100
  acceleration: number // 0-100
  volume: number // 0-100
  sentiment: number // -100..100
  novelty: number // 0-100
  /** real, deterministic keyword-overlap against this worker's own
   * real mission/objectives text (lib/marketing/opportunity-engine.ts)
   * — never LLM-guessed. */
  marketRelevance: number // 0-100
  trendScore: number // 0-100, derived from velocity+novelty+confidence
  confidence: number // 0-100 — the model's own structural confidence
  sourceUrl?: string
  sourceIndices: number[]
}

export type OpportunityStatus = "open" | "rejected"

/** WHY NOW / WHY THIS BRAND / WHY THIS AUDIENCE, as a real, scored
 * object — never a trend treated as an opportunity by default (section
 * 5). Produced by lib/marketing/opportunity-engine.ts's
 * scoreOpportunity(), a pure function over one real IntelligenceSignal
 * plus this worker's own real brand/audience grounding text. A signal
 * can score `status: "rejected"` — high velocity is not, by itself, a
 * reason to create; the rationale explains why either way. */
export interface CreativeOpportunity {
  id: string
  signalIds: string[]
  topic: string
  detectedAt: number
  trendVelocity: number
  trendAcceleration: number
  audienceRelevance: number
  brandRelevance: number
  creativePotential: number
  novelty: number
  /** Always 0 today — no real competitive-intelligence source is
   * connected. Never guessed; see notYetConnected in the Marketing
   * product catalog entry. */
  competitiveSaturation: number
  safetyRisk: number
  expirationProbability: number
  estimatedHalfLifeHours: number
  opportunityScore: number
  rationale: string
  recommendedAction: string
  status: OpportunityStatus
}

/** One of the (exactly 6, per the Marketing brief) distinct creative
 * territories generated for a given opportunity. `noveltyScore`/
 * `brandFitScore`/`audienceFitScore` are real, structural computations
 * — never the LLM's own self-rating — see lib/agent/skills/creative-
 * territory-generation.ts. `predictedPerformanceScore` is explicitly a
 * prediction (an average of the three above); it must never be
 * displayed as, or mixed with, a real measured performance metric. */
export interface CreativeConcept {
  id: string
  opportunityTopic: string
  title: string
  thesis: string
  hook: string
  story: string
  emotionalIntent: string
  audience: string
  brandRole: string
  productRole: string
  visualStyle: string
  world: string
  characters: string[]
  cameraLanguage: string
  duration: string
  platform: string
  cta: string
  rationale: string
  noveltyScore: number
  brandFitScore: number
  audienceFitScore: number
  /** average of noveltyScore/brandFitScore/audienceFitScore — a
   * prediction, not a measurement. */
  predictedPerformanceScore: number
  productionStatus: "not_connected"
}

/* ---- production abstraction (section 10) — architecture only. No
 * provider is connected in this deployment; nothing here fabricates a
 * production run. Mirrors the exact honest-disclosure pattern already
 * established for Connectors (lib/connectors/registry.ts) and Tools
 * (ToolDefinition.isConnected()). ---- */
export type ProductionProviderStatus = "connected" | "not_connected" | "demo" | "error" | "syncing"

export interface ProductionProviderDefinition {
  id: string
  name: string
  kind: "video" | "image"
  status: ProductionProviderStatus
  notConnectedReason?: string
}

export const PRODUCTION_PROVIDERS: ProductionProviderDefinition[] = [
  {
    id: "google_flow",
    name: "Google Flow / Veo",
    kind: "video",
    status: "not_connected",
    notConnectedReason: "No production credential configured — creative concepts stay at the concept stage until a real production provider is connected.",
  },
]

/* ---- signal sources (section 4/19) — real state per source, never a
 * faked "connected". Only web_search is real today; the rest are the
 * architecture's real, honest "not connected" state. ---- */
export type IntelligenceSourceStatus = "connected" | "not_connected" | "demo" | "error" | "syncing"

export interface IntelligenceSourceDefinition {
  id: IntelligenceSignal["source"]
  name: string
  status: IntelligenceSourceStatus
  notConnectedReason?: string
}

export const INTELLIGENCE_SOURCES: IntelligenceSourceDefinition[] = [
  { id: "web_search", name: "Web Search", status: "connected" },
  { id: "brazil_intel", name: "Brazil Intel", status: "not_connected", notConnectedReason: "Connect Brazil Intel to bring its signals into the Marketing Super Agent." },
  { id: "google_trends", name: "Google Trends", status: "not_connected", notConnectedReason: "Connect Google Trends to bring its signals into the Marketing Super Agent." },
  { id: "x", name: "X / social conversation", status: "not_connected", notConnectedReason: "Connect X to bring its signals into the Marketing Super Agent." },
  { id: "news", name: "News / web signals", status: "not_connected", notConnectedReason: "Connect a news source to bring its signals into the Marketing Super Agent." },
]

/* ---- the two real, persisted output shapes the two Marketing skills
 * produce — see WorkerOutput.structured in lib/workforce/model.ts. ---- */
export interface IntelligenceReportPayload {
  query: string
  signals: IntelligenceSignal[]
  opportunities: CreativeOpportunity[]
}

export interface CreativeConceptsPayload {
  opportunityTopic: string
  concepts: CreativeConcept[]
}
