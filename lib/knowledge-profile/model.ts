/* ================================================================== *
 * WEBSITE KNOWLEDGE PROFILE — domain types (§5). Deliberately no fixed
 * columns for the inferred fields (sitePurpose, detectedVertical,
 * etc.) — they live inside `profile`/`confidence` JSONB because the
 * ontology must generalize across verticals (§3), not be baked into
 * the schema for one.
 * ================================================================== */

export interface WebsiteKnowledgeProfileFields {
  sitePurpose: string | null
  detectedVertical: string | null
  detectedBusinessModel: string | null
  primaryEntityTypes: string[]
  markets: string[]
  roles: string[]
  productsOrServices: string[]
  contentTypes: string[]
  pageArchetypes: Record<string, number>
  taxonomy: string[]
  navigationLabels: string[]
  schemaTypes: string[]
  language: string | null
  country: string | null
  domainSignals: {
    hostname: string
    hasRobotsTxt: boolean
    hasSitemap: boolean
    pagesCrawled: number
    httpsUsed: boolean
  }
  existingSeoStructure: {
    pagesWithTitle: number
    pagesWithDescription: number
    pagesWithCanonical: number
    pagesWithStructuredData: number
    averageWordCount: number
  }
}

/** 0-1 confidence per top-level field of WebsiteKnowledgeProfileFields
 * — every inferred field must carry one (§5). Fields that are directly
 * observed facts (domainSignals, existingSeoStructure) get confidence
 * 1; heuristically inferred fields (detectedVertical, roles, ...) get
 * a real, computed confidence that can honestly be low or even 0. */
export type WebsiteKnowledgeProfileConfidence = Record<keyof WebsiteKnowledgeProfileFields, number>

export interface WebsiteKnowledgeProfile {
  id: string
  orgId: string
  projectId: string
  websiteId: string
  version: number
  sourceCrawlId: string
  profile: WebsiteKnowledgeProfileFields
  confidence: WebsiteKnowledgeProfileConfidence
  createdAt: number
}
