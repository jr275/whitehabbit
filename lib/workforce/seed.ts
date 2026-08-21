/* ================================================================== *
 * WORKFORCE SEED — Atlas, Nova and Helix arrive pre-built and already
 * live, with a real day of outputs behind them. This is what makes
 * Outputs Hub feel operational on first load instead of empty; every
 * number here is a real WorkerOutput record, not a hand-typed KPI.
 * ================================================================== */

import { CHANNEL_CATALOG, SKILL_CATALOG, TOOL_CATALOG } from "./catalog"
import { generateOutput } from "./content"
import type {
  ChannelId,
  KnowledgeSource,
  Skill,
  Worker,
  WorkerChannel,
  WorkerExecution,
  WorkerOutput,
  WorkerTask,
  WorkforceTool,
} from "./model"

let seq = 0
function uid(prefix: string): string {
  seq += 1
  return `${prefix}_seed_${seq}`
}

function makeSkills(enabled: string[]): Skill[] {
  return SKILL_CATALOG.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    produces: t.produces,
    enabled: enabled.includes(t.id),
  }))
}

function makeTools(enabled: string[]): WorkforceTool[] {
  return TOOL_CATALOG.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    connected: enabled.includes(t.id),
    risk: t.risk,
    actions: t.actions.map((label, i) => ({ id: `${t.id}_a${i}`, label, enabled: enabled.includes(t.id) })),
  }))
}

function makeChannels(enabled: ChannelId[]): WorkerChannel[] {
  return CHANNEL_CATALOG.map((c) => ({ id: c.id, name: c.name, connected: enabled.includes(c.id) }))
}

function knowledge(items: { name: string; type: KnowledgeSource["type"]; documents: number }[]): KnowledgeSource[] {
  return items.map((i, idx) => ({ id: uid(`kn${idx}`), name: i.name, type: i.type, documents: i.documents, addedAt: Date.now() - (idx + 1) * 86_400_000 }))
}

const DAY_AGO = 86_400_000 * 9

const ATLAS: Worker = {
  id: "worker_atlas",
  identity: {
    name: "Atlas",
    role: "AI Growth Worker",
    description: "Research prospects, create content, manage social communication and execute growth tasks.",
    persona: "A senior growth operator — direct, evidence-driven, never oversells.",
    tone: ["Analytical", "Concise", "Confident"],
    accent: "#5a6ef0",
    initials: "AT",
  },
  mission:
    "Research prospects, create content, manage Instagram conversations and identify qualified sales opportunities.",
  objectives: [
    { id: uid("obj"), text: "Prospect research", done: true },
    { id: uid("obj"), text: "Content generation", done: true },
    { id: uid("obj"), text: "Instagram communication", done: true },
    { id: uid("obj"), text: "Lead qualification", done: true },
    { id: uid("obj"), text: "Sales opportunity detection", done: true },
  ],
  knowledge: knowledge([
    { name: "Company website", type: "website", documents: 42 },
    { name: "Sales playbook", type: "playbook", documents: 16 },
    { name: "Product documentation", type: "docs", documents: 128 },
    { name: "CRM export", type: "crm", documents: 5210 },
    { name: "Brand guidelines", type: "brand", documents: 9 },
    { name: "Support FAQ", type: "faq", documents: 64 },
    { name: "Q3 pitch deck.pdf", type: "pdf", documents: 1 },
  ]),
  skills: makeSkills([
    "skill_prospect_research",
    "skill_company_research",
    "skill_web_research",
    "skill_blog_writing",
    "skill_reel_scripts",
    "skill_instagram_dm",
    "skill_email_responses",
    "skill_lead_qualification",
    "skill_opportunity_detection",
    "skill_meeting_scheduling",
  ]),
  tools: makeTools(["tool_instagram", "tool_crm", "tool_email", "tool_google_search", "tool_calendar", "tool_cms"]),
  behaviors: [
    { id: uid("beh"), raw: "IF lead score > 80 → prioritize outreach", condition: "lead score > 80", action: "prioritize outreach" },
    { id: uid("beh"), raw: "IF pricing objection detected → use Sales Playbook", condition: "pricing objection detected", action: "use Sales Playbook" },
    { id: uid("beh"), raw: "IF confidence < 70% → request human review", condition: "confidence < 70%", action: "request human review" },
    { id: uid("beh"), raw: "IF irreversible action → require approval", condition: "irreversible action", action: "require approval" },
    { id: uid("beh"), raw: "IF quiet hours (20:00–08:00) → hold outreach until morning", condition: "quiet hours (20:00–08:00)", action: "hold outreach until morning" },
  ],
  channels: makeChannels(["instagram", "email", "web"]),
  autonomy: "medium",
  status: "live",
  tested: true,
  createdAt: Date.now() - DAY_AGO,
  releasedAt: Date.now() - DAY_AGO + 3_600_000,
}

const NOVA: Worker = {
  id: "worker_nova",
  identity: {
    name: "Nova",
    role: "Instagram Content Worker",
    description: "Plans, writes and publishes Instagram content, and answers inbound DMs in the brand voice.",
    persona: "A social-first creative — playful, on-brand, fast.",
    tone: ["Playful", "Confident", "Friendly"],
    accent: "#e0577d",
    initials: "NV",
  },
  mission: "Create Instagram Reels and posts, and respond to inbound DMs to keep engagement high.",
  objectives: [
    { id: uid("obj"), text: "Reel scripting", done: true },
    { id: uid("obj"), text: "Post creation", done: true },
    { id: uid("obj"), text: "Instagram communication", done: true },
  ],
  knowledge: knowledge([
    { name: "Brand guidelines", type: "brand", documents: 9 },
    { name: "Company website", type: "website", documents: 42 },
    { name: "Support FAQ", type: "faq", documents: 64 },
  ]),
  skills: makeSkills(["skill_reel_scripts", "skill_instagram_posts", "skill_instagram_dm"]),
  tools: makeTools(["tool_instagram", "tool_cms", "tool_analytics"]),
  behaviors: [
    { id: uid("beh"), raw: "IF confidence < 70% → request human review", condition: "confidence < 70%", action: "request human review" },
    { id: uid("beh"), raw: "IF DM mentions a complaint → escalate to support", condition: "DM mentions a complaint", action: "escalate to support" },
  ],
  channels: makeChannels(["instagram"]),
  autonomy: "high",
  status: "live",
  tested: true,
  createdAt: Date.now() - DAY_AGO * 0.6,
  releasedAt: Date.now() - DAY_AGO * 0.6 + 3_600_000,
}

const HELIX: Worker = {
  id: "worker_helix",
  identity: {
    name: "Helix",
    role: "Research Worker",
    description: "Researches target companies and prospects, and produces competitive analyses.",
    persona: "A meticulous analyst — thorough, sourced, no speculation.",
    tone: ["Analytical", "Formal", "Direct"],
    accent: "#3a9e6d",
    initials: "HX",
  },
  mission: "Research target companies and prospects, and flag the strongest buying signals.",
  objectives: [
    { id: uid("obj"), text: "Prospect research", done: true },
    { id: uid("obj"), text: "Competitive research", done: true },
  ],
  knowledge: knowledge([
    { name: "CRM export", type: "crm", documents: 5210 },
    { name: "Sales playbook", type: "playbook", documents: 16 },
  ]),
  skills: makeSkills(["skill_prospect_research", "skill_company_research", "skill_competitive_research", "skill_web_research"]),
  tools: makeTools(["tool_google_search", "tool_crm", "tool_analytics"]),
  behaviors: [
    { id: uid("beh"), raw: "IF confidence < 70% → request human review", condition: "confidence < 70%", action: "request human review" },
  ],
  channels: makeChannels(["web"]),
  autonomy: "medium",
  status: "live",
  tested: true,
  createdAt: Date.now() - DAY_AGO * 1.4,
  releasedAt: Date.now() - DAY_AGO * 1.4 + 3_600_000,
}

/** Seed a completed batch of outputs for one skill, split across `batches` runs today. */
function seedSkillOutputs(
  worker: Worker,
  skillId: string,
  total: number,
  batches: number,
  tasks: WorkerTask[],
  executions: WorkerExecution[],
  outputs: WorkerOutput[],
) {
  const skill = worker.skills.find((s) => s.id === skillId)
  const template = SKILL_CATALOG.find((t) => t.id === skillId)
  if (!skill || !template) return
  const counts = splitCount(total, batches)
  counts.forEach((count, i) => {
    if (count <= 0) return
    const agoMs = (i + 1) * (2.2 * 3_600_000) + Math.random() * 1_200_000
    const startedAt = Date.now() - agoMs
    const task: WorkerTask = {
      id: uid("task"),
      workerId: worker.id,
      skillId: skill.id,
      type: skill.category,
      title: template.taskTitle,
      status: "completed",
      createdAt: startedAt,
    }
    const execution: WorkerExecution = {
      id: uid("exec"),
      workerId: worker.id,
      taskId: task.id,
      status: "completed",
      progress: 100,
      target: count,
      done: count,
      label: template.taskTitle,
      startedAt,
      completedAt: startedAt + count * 40_000,
    }
    tasks.push(task)
    executions.push(execution)
    for (let n = 0; n < count; n++) {
      const generated = generateOutput(skill.produces, worker, startedAt + n)
      outputs.push({
        id: uid("out"),
        workerId: worker.id,
        taskId: task.id,
        executionId: execution.id,
        type: skill.produces,
        title: generated.title,
        content: generated.content,
        channel: generated.channel,
        status: generated.status,
        qualityScore: generated.qualityScore,
        confidenceScore: generated.confidenceScore,
        taskSuccess: generated.taskSuccess,
        policyCompliance: generated.policyCompliance,
        brandAdherence: generated.brandAdherence,
        factuality: generated.factuality,
        input: generated.input,
        toolsUsed: generated.toolsUsed,
        knowledgeUsed: generated.knowledgeUsed,
        policyChecks: generated.policyChecks,
        approval: generated.approval,
        durationMs: generated.durationMs,
        model: generated.model,
        createdAt: execution.startedAt + Math.round(((n + 1) / count) * (execution.completedAt! - execution.startedAt)),
      })
    }
  })
}

function splitCount(total: number, parts: number): number[] {
  if (parts <= 1) return [total]
  const first = Math.round(total * 0.62)
  return [first, total - first]
}

export interface WorkforceSeed {
  workers: Worker[]
  tasks: WorkerTask[]
  executions: WorkerExecution[]
  outputs: WorkerOutput[]
}

export function buildSeedWorkforce(): WorkforceSeed {
  const tasks: WorkerTask[] = []
  const executions: WorkerExecution[] = []
  const outputs: WorkerOutput[] = []

  seedSkillOutputs(ATLAS, "skill_blog_writing", 8, 1, tasks, executions, outputs)
  seedSkillOutputs(ATLAS, "skill_reel_scripts", 4, 1, tasks, executions, outputs)
  seedSkillOutputs(ATLAS, "skill_instagram_dm", 19, 2, tasks, executions, outputs)
  seedSkillOutputs(ATLAS, "skill_prospect_research", 37, 2, tasks, executions, outputs)
  seedSkillOutputs(ATLAS, "skill_email_responses", 12, 2, tasks, executions, outputs)
  seedSkillOutputs(ATLAS, "skill_meeting_scheduling", 6, 1, tasks, executions, outputs)
  seedSkillOutputs(ATLAS, "skill_opportunity_detection", 3, 1, tasks, executions, outputs)

  seedSkillOutputs(NOVA, "skill_reel_scripts", 4, 1, tasks, executions, outputs)
  seedSkillOutputs(NOVA, "skill_instagram_posts", 6, 1, tasks, executions, outputs)
  seedSkillOutputs(NOVA, "skill_instagram_dm", 11, 1, tasks, executions, outputs)

  seedSkillOutputs(HELIX, "skill_prospect_research", 37, 2, tasks, executions, outputs)
  seedSkillOutputs(HELIX, "skill_company_research", 14, 1, tasks, executions, outputs)
  seedSkillOutputs(HELIX, "skill_competitive_research", 5, 1, tasks, executions, outputs)

  outputs.sort((a, b) => b.createdAt - a.createdAt)

  return { workers: [ATLAS, NOVA, HELIX], tasks, executions, outputs }
}
