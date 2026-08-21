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
 * This is intentionally small: ONE vertical (Marketing Intelligence),
 * 3 real skills, 4 real tools. Every entry here has a real, working
 * (or honestly not-yet-connected) implementation on the server — there
 * is no metadata for a skill or tool that doesn't actually exist.
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
