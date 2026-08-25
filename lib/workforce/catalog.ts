/* ================================================================== *
 * WORKFORCE CATALOG — the client-safe menu the Studio Builder offers.
 *
 * This mirrors lib/agent/skills/registry.ts and lib/agent/tools/
 * registry.ts by id — metadata only, so it can be imported from
 * client components without pulling server-only execution code (LLM
 * calls, DB access) into the browser bundle. The ids must match the
 * server registries exactly; that correspondence is what lets Studio
 * show real inputs/instructions for a skill that actually executes.
 *
 * Every entry here has a real, working (or honestly not-yet-connected)
 * implementation on the server — there is no metadata for a skill or
 * tool that doesn't actually exist.
 * ================================================================== */

import type { ChannelId, SkillCategory, ToolPermission, ToolRisk } from "./model"

export interface SkillTemplate {
  id: string
  name: string
  category: SkillCategory
  description: string
  outputType: string
  taskTitle: string
  requiredTools: string[]
  inputs: { key: string; label: string; type: "text" | "textarea"; required: boolean; placeholder?: string }[]
}

export const SKILL_CATALOG: SkillTemplate[] = [
  {
    id: "skill_trend_research",
    name: "Trend Research",
    category: "research",
    description: "Searches real sources and uses an LLM to identify, rank and explain genuine trends.",
    outputType: "trend_report",
    taskTitle: "Research trends",
    requiredTools: ["tool_web_search", "tool_llm"],
    inputs: [{ key: "query", label: "What should it research?", type: "text", required: true, placeholder: "The most important trends in AI agents today" }],
  },
  {
    id: "skill_content_intelligence",
    name: "Content Intelligence",
    category: "content",
    description: "Analyzes which published content is actually performing, using real analytics data.",
    outputType: "content_analysis",
    taskTitle: "Analyze content performance",
    requiredTools: ["tool_analytics", "tool_llm"],
    inputs: [{ key: "query", label: "Which content should it analyze?", type: "text", required: false, placeholder: "Last 30 days of blog posts" }],
  },
  {
    id: "skill_engagement_analysis",
    name: "Engagement Analysis",
    category: "communication",
    description: "Analyzes real audience engagement (reach, comments, saves) from a connected analytics provider.",
    outputType: "engagement_analysis",
    taskTitle: "Analyze engagement",
    requiredTools: ["tool_analytics", "tool_llm"],
    inputs: [{ key: "query", label: "What should it look at?", type: "text", required: false, placeholder: "Last week's posts" }],
  },
  {
    id: "skill_lead_qualification",
    name: "Lead Research & Qualification",
    category: "sales",
    description: "Searches real sources and uses an LLM to identify and score genuine candidate companies against a target profile.",
    outputType: "lead_qualification",
    taskTitle: "Research and qualify leads",
    requiredTools: ["tool_web_search", "tool_llm"],
    inputs: [{ key: "query", label: "What kind of leads should it find?", type: "text", required: true, placeholder: "Enterprise SaaS companies expanding into new markets" }],
  },
  {
    id: "skill_seo_opportunity",
    name: "SEO Opportunity Planning",
    category: "content",
    description: "Searches real sources and uses an LLM to identify genuine topic/page opportunities and produce a structured page plan.",
    outputType: "seo_opportunity_plan",
    taskTitle: "Plan SEO page opportunities",
    requiredTools: ["tool_web_search", "tool_llm"],
    inputs: [{ key: "query", label: "What topic area or site focus should it plan for?", type: "text", required: true, placeholder: "Comparison and how-to pages for a project management tool" }],
  },
  {
    id: "skill_customer_conversation",
    name: "Customer Conversation",
    category: "communication",
    description: "Responds to a real customer request using an LLM grounded in this worker's real Domain Profile and rules, and records a real, honest handling decision.",
    outputType: "conversation_response",
    taskTitle: "Handle a customer request",
    requiredTools: ["tool_llm"],
    inputs: [{ key: "query", label: "What is the customer asking or saying?", type: "textarea", required: true, placeholder: "Hi, I need to change my reservation to next weekend instead — is that possible?" }],
  },
  {
    id: "skill_cultural_intelligence",
    name: "Cultural Intelligence",
    category: "research",
    description: "Searches real sources, identifies genuine cultural/market signals, and scores each one into a real, brand-relevance-checked opportunity — trend velocity alone is never treated as a reason to create.",
    outputType: "intelligence_report",
    taskTitle: "Scan for cultural and market signals",
    requiredTools: ["tool_web_search", "tool_llm"],
    inputs: [{ key: "query", label: "What cultural or market space should it monitor?", type: "text", required: true, placeholder: "Consumer trends among Gen Z in short-form video" }],
  },
  {
    id: "skill_creative_territory_generation",
    name: "Creative Territory Generation",
    category: "content",
    description: "Generates exactly 6 genuinely distinct creative territories for a real opportunity, grounded in this worker's real brand context — never minor variations of the same idea.",
    outputType: "creative_concepts",
    taskTitle: "Generate creative territories",
    requiredTools: ["tool_llm"],
    inputs: [{ key: "query", label: "Which opportunity or cultural moment should it develop creative territories for?", type: "text", required: true, placeholder: "A surge of interest in retro gaming nostalgia among 25-34 year olds" }],
  },
]

export interface ToolTemplate {
  id: string
  name: string
  provider: string
  description: string
  risk: ToolRisk
  permission: ToolPermission
}

export const TOOL_CATALOG: ToolTemplate[] = [
  { id: "tool_web_search", name: "Web Search", provider: "npm registry", description: "Searches real, current package activity as a signal for what's trending.", risk: "low", permission: "read" },
  { id: "tool_browser", name: "Browser", provider: "HTTP fetch", description: "Opens a real URL and extracts its page text.", risk: "low", permission: "read" },
  { id: "tool_analytics", name: "Analytics", provider: "Not connected", description: "Reads engagement and performance metrics from a connected provider.", risk: "low", permission: "read" },
  // "provider" here is only the seed default — the server overwrites it
  // live on every read (lib/agent/hydrate.ts) with whichever LLM_PROVIDER
  // is actually configured (Anthropic or Gemini).
  { id: "tool_llm", name: "LLM", provider: "Anthropic", description: "Reasons over collected information to analyze, rank and explain.", risk: "low", permission: "read" },
]

/* ---- channels ---- */
export const CHANNEL_CATALOG: { id: ChannelId; name: string }[] = [
  { id: "instagram", name: "Instagram" },
  { id: "email", name: "Email" },
  { id: "whatsapp", name: "WhatsApp" },
  { id: "web", name: "Web" },
  { id: "slack", name: "Slack" },
  { id: "voice", name: "Voice" },
]

/* ---- natural-language behavior rule presets ---- */
export const BEHAVIOR_PRESETS: string[] = [
  "IF confidence < 70% → request human review",
  "IF a required tool is not connected → block and explain why",
  "IF analysis cites no real source → discard the trend",
]

/** Split "IF x → y" into a condition and an action for display. */
export function parseBehavior(raw: string): { condition: string; action: string } {
  const m = raw.match(/^\s*IF\s+(.+?)\s*(?:→|->)\s*(.+?)\s*$/i)
  if (m) return { condition: m[1], action: m[2] }
  return { condition: raw, action: "" }
}

export const TONE_PRESETS = ["Analytical", "Concise", "Confident", "Friendly", "Formal", "Playful", "Empathetic", "Direct"]

type KnowledgeSourceType = "website" | "pdf" | "playbook" | "docs" | "crm" | "faq" | "brand"

export const KNOWLEDGE_TEMPLATES: { name: string; type: KnowledgeSourceType; documents: number }[] = [
  { name: "Company website", type: "website", documents: 42 },
  { name: "Product documentation", type: "docs", documents: 128 },
  { name: "Sales playbook", type: "playbook", documents: 16 },
  { name: "Brand guidelines", type: "brand", documents: 9 },
  { name: "Support FAQ", type: "faq", documents: 64 },
]
