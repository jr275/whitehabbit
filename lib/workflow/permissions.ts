/* ================================================================== *
 * AGENT CAPABILITY PERMISSIONS (§11) — formalized, enforced in code,
 * never relied on via a prompt. Extends (does not replace) the
 * existing ToolPermission/RiskLevel model in lib/agent/types.ts, which
 * governs Worker Skills; this governs the Phase-4 system agents
 * (WebsiteDiscoveryAgent, ContentGenerationAgent, PublisherAgent) that
 * run as workflow steps rather than Worker skills.
 * ================================================================== */

export type AgentCapability =
  | "crawl_website"
  | "read_robots"
  | "read_sitemap"
  | "extract_entities"
  | "write_discovery_profile"
  | "write_opportunity"
  | "detect_trends"
  | "run_ai_visibility_prompt"
  | "ingest_external_data"
  | "write_page_brief"
  | "write_content_draft"
  | "write_page_version"
  | "publish_page_version"
  | "invalidate_cache"
  | "request_revalidation"
  | "change_facts"
  | "change_evidence"
  | "change_opportunity_score"
  | "change_tenant_settings"
  | "delete_tenant_data"
  | "modify_billing"
  | "write_internal_links" // Phase 7 (ADR-038) — real, new execution path for the ADD_INTERNAL_LINKS Decision action
  | "run_research" // Phase 7 (ADR-038) — real, new execution path for the INVESTIGATE_ENTITY Decision action (Deep Research, never content-writing)

export type AgentType = "WebsiteDiscoveryAgent" | "ContentGenerationAgent" | "PublisherAgent" | "TrendAnalysisAgent" | "AIVisibilityAgent" | "DataIngestionAgent"

/** One explicit allow-list per agent type — everything not listed is
 * denied by default (assertCapability below), never inferred. */
const AGENT_CAPABILITIES: Record<AgentType, ReadonlySet<AgentCapability>> = {
  WebsiteDiscoveryAgent: new Set(["crawl_website", "read_robots", "read_sitemap", "extract_entities", "write_discovery_profile", "write_opportunity", "run_research"]),
  ContentGenerationAgent: new Set(["write_page_brief", "write_content_draft", "write_page_version"]),
  PublisherAgent: new Set(["publish_page_version", "invalidate_cache", "request_revalidation", "write_internal_links"]),
  TrendAnalysisAgent: new Set(["detect_trends", "write_opportunity"]),
  AIVisibilityAgent: new Set(["run_ai_visibility_prompt"]),
  DataIngestionAgent: new Set(["ingest_external_data"]),
}

export class CapabilityDeniedError extends Error {
  constructor(agentType: AgentType, capability: AgentCapability) {
    super(`${agentType} does not have the "${capability}" capability.`)
    this.name = "CapabilityDeniedError"
  }
}

/** Throws CapabilityDeniedError (never silently no-ops) if `agentType`
 * doesn't have `capability`. Call this at the exact point a real
 * side-effecting action is about to happen — not just once at the top
 * of a pipeline — so a future step accidentally added to the wrong
 * agent's code path is caught immediately. */
export function assertCapability(agentType: AgentType, capability: AgentCapability): void {
  if (!AGENT_CAPABILITIES[agentType].has(capability)) {
    throw new CapabilityDeniedError(agentType, capability)
  }
}

export function hasCapability(agentType: AgentType, capability: AgentCapability): boolean {
  return AGENT_CAPABILITIES[agentType].has(capability)
}
