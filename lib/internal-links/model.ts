export interface InternalLink {
  id: string
  orgId: string
  projectId: string
  sourcePageId: string
  targetPageId: string | null
  targetEntityId: string | null
  reason: string
  relationshipType: string | null
  confidence: number | null
  createdAt: number
}
