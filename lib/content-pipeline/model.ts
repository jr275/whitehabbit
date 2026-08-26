/* ================================================================== *
 * CONTENT PIPELINE — artifact types (§15). Research -> Outline ->
 * Draft -> SEO -> GEO/AEO -> Quality. Every artifact is persisted to
 * content_artifacts with its producing agent_run_id (§15).
 * ================================================================== */

export interface ResearchClaim {
  text: string
  entityId: string
  evidenceIds: string[]
  sourceUrl: string | null
  confidence: number
}

export interface ResearchArtifact {
  claims: ResearchClaim[]
  sources: string[]
  /** average confidence across all claims — 0 if no evidence exists at all (never fabricated). */
  confidence: number
}

export interface OutlineSection {
  heading: string
  claimIndices: number[]
}

export interface OutlineArtifact {
  sections: OutlineSection[]
}

export interface DraftSection {
  heading: string
  body: string
  /** indices into ResearchArtifact.claims the model reports using in this section's body. */
  claimIndices: number[]
}

export interface DraftArtifact {
  title: string
  metaDescription: string
  sections: DraftSection[]
  model: string
  provider: string
  inputTokens?: number
  outputTokens?: number
  executionMode?: "development"
}

export interface SeoCheck {
  name: string
  passed: boolean
  detail: string
}

export interface SeoArtifact {
  score: number
  checks: SeoCheck[]
  recommendations: string[]
}

export interface GeoArtifact {
  geoScore: number
  aeoScore: number
  checks: SeoCheck[]
  recommendations: string[]
}

export interface QualityGateResult {
  name: string
  passed: boolean
  value: number | boolean | null
  threshold: number | boolean | null
}

export interface QualityArtifact {
  passed: boolean
  qualityScore: number
  gates: QualityGateResult[]
  reasons: string[]
}
