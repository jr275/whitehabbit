/* ================================================================== *
 * WEBSITES — domain types. See §1/§9 of the vertical-slice brief.
 * ================================================================== */

export type WebsiteStatus = "pending" | "active" | "failed"
export type WebsiteDiscoveryStatus = "pending" | "discovering" | "discovered" | "crawling" | "crawled" | "analyzing" | "ready" | "failed"

export interface Website {
  id: string
  orgId: string
  projectId: string
  url: string
  normalizedUrl: string
  hostname: string
  status: WebsiteStatus
  discoveryStatus: WebsiteDiscoveryStatus
  discoveryError: string | null
  createdAt: number
  updatedAt: number
  createdBy: string | null
}
