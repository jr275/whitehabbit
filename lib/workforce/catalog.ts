/* ================================================================== *
 * WORKFORCE CATALOG — the fixed menu the Studio Builder offers.
 * Real, executable work skills (never abstract capability scores),
 * tools with concrete actions + risk, channels, and behavior-rule
 * presets. Pure data — no rendering, no store.
 * ================================================================== */

import type { ChannelId, OutputKind, SkillCategory, ToolRisk } from "./model"

/* ---- skills, grouped exactly as the builder presents them ---- */
export interface SkillTemplate {
  id: string
  name: string
  category: SkillCategory
  produces: OutputKind
  /** the work item run in Studio, e.g. "Research prospects" */
  taskTitle: string
  /** plural unit noun for progress, e.g. "prospects", "posts", "DMs" */
  unit: string
  /** past-tense verb for the activity timeline, e.g. "researched" */
  verb: string
}

export const SKILL_CATALOG: SkillTemplate[] = [
  // Research
  { id: "skill_prospect_research", name: "Prospect research", category: "research", produces: "research", taskTitle: "Research prospects", unit: "prospects", verb: "researched" },
  { id: "skill_company_research", name: "Company research", category: "research", produces: "research", taskTitle: "Research companies", unit: "companies", verb: "researched" },
  { id: "skill_competitive_research", name: "Competitive research", category: "research", produces: "analysis", taskTitle: "Analyze competitors", unit: "analyses", verb: "completed" },
  { id: "skill_web_research", name: "Web research", category: "research", produces: "research", taskTitle: "Research the web", unit: "sources", verb: "found" },
  // Content
  { id: "skill_blog_writing", name: "Blog writing", category: "content", produces: "blog", taskTitle: "Write blog posts", unit: "posts", verb: "wrote" },
  { id: "skill_instagram_posts", name: "Instagram posts", category: "content", produces: "social_post", taskTitle: "Create Instagram posts", unit: "posts", verb: "created" },
  { id: "skill_reel_scripts", name: "Reel scripts", category: "content", produces: "reel", taskTitle: "Create Instagram Reels", unit: "Reels", verb: "created" },
  { id: "skill_email_copy", name: "Email copy", category: "content", produces: "email", taskTitle: "Write email copy", unit: "emails", verb: "wrote" },
  // Communication
  { id: "skill_instagram_dm", name: "Instagram DM responses", category: "communication", produces: "dm", taskTitle: "Reply to Instagram DMs", unit: "replies", verb: "replied to" },
  { id: "skill_email_responses", name: "Email responses", category: "communication", produces: "email", taskTitle: "Reply to emails", unit: "replies", verb: "replied to" },
  { id: "skill_lead_qualification", name: "Lead qualification", category: "communication", produces: "lead", taskTitle: "Qualify leads", unit: "leads", verb: "qualified" },
  // Sales
  { id: "skill_lead_scoring", name: "Lead scoring", category: "sales", produces: "lead", taskTitle: "Score leads", unit: "leads", verb: "scored" },
  { id: "skill_opportunity_detection", name: "Opportunity detection", category: "sales", produces: "lead", taskTitle: "Detect opportunities", unit: "opportunities", verb: "detected" },
  { id: "skill_meeting_scheduling", name: "Meeting scheduling", category: "sales", produces: "meeting", taskTitle: "Schedule meetings", unit: "meetings", verb: "scheduled" },
]

/* ---- tools, each with concrete actions + a risk rating ---- */
export interface ToolTemplate {
  id: string
  name: string
  category: string
  risk: ToolRisk
  actions: string[]
}

export const TOOL_CATALOG: ToolTemplate[] = [
  { id: "tool_instagram", name: "Instagram", category: "Social", risk: "medium", actions: ["Read DMs", "Reply to DMs", "Create posts", "Publish Reels"] },
  { id: "tool_crm", name: "CRM", category: "Sales", risk: "medium", actions: ["Read records", "Update records", "Create records"] },
  { id: "tool_email", name: "Email", category: "Communication", risk: "medium", actions: ["Read inbox", "Draft email", "Send email"] },
  { id: "tool_google_search", name: "Google Search", category: "Research", risk: "low", actions: ["Search the web"] },
  { id: "tool_calendar", name: "Calendar", category: "Scheduling", risk: "low", actions: ["Check availability", "Book meetings"] },
  { id: "tool_cms", name: "CMS", category: "Content", risk: "low", actions: ["Save drafts", "Publish posts"] },
  { id: "tool_analytics", name: "Analytics", category: "Insights", risk: "low", actions: ["Read reports"] },
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
  "IF lead score > 80 → prioritize outreach",
  "IF pricing objection detected → use Sales Playbook",
  "IF confidence < 70% → request human review",
  "IF irreversible action → require approval",
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
  { name: "CRM export", type: "crm", documents: 3120 },
]
