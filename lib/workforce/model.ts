/* ================================================================== *
 * WORKFORCE MODEL — the single vocabulary behind Studio + Outputs.
 *
 * Multiple Workers, each composed of skills/tools/knowledge/behavior/
 * channels, produce Tasks → Executions → Outputs. Every operational
 * surface (Studio, Outputs Hub, Worker Overview, Evolve) reads the same
 * shape from the same store — never independent mock numbers per page.
 * ================================================================== */

export type SkillCategory = "research" | "content" | "communication" | "sales"

export const SKILL_CATEGORIES: SkillCategory[] = ["research", "content", "communication", "sales"]

export const SKILL_CATEGORY_LABEL: Record<SkillCategory, string> = {
  research: "Research",
  content: "Content",
  communication: "Communication",
  sales: "Sales",
}

export interface Skill {
  id: string
  name: string
  category: SkillCategory
  enabled: boolean
  /** the kind of output this skill produces when the worker runs */
  produces: OutputKind
}

export type ToolRisk = "low" | "medium" | "high"

export interface ToolAction {
  id: string
  label: string
  enabled: boolean
}

export interface WorkforceTool {
  id: string
  name: string
  category: string
  connected: boolean
  risk: ToolRisk
  actions: ToolAction[]
}

export interface KnowledgeSource {
  id: string
  name: string
  type: "website" | "pdf" | "playbook" | "docs" | "crm" | "faq" | "brand"
  documents: number
  addedAt: number
}

export interface BehaviorRule {
  id: string
  raw: string
  condition: string
  action: string
}

export type ChannelId = "instagram" | "email" | "whatsapp" | "web" | "slack" | "voice"

export interface WorkerChannel {
  id: ChannelId
  name: string
  connected: boolean
}

export interface Objective {
  id: string
  text: string
  done: boolean
}

export interface WorkerIdentity {
  name: string
  role: string
  description: string
  persona: string
  tone: string[]
  accent: string
  initials: string
}

export type Autonomy = "low" | "medium" | "high"
export type WorkerStatus = "draft" | "ready" | "live" | "working" | "idle"

export interface Worker {
  id: string
  identity: WorkerIdentity
  mission: string
  objectives: Objective[]
  knowledge: KnowledgeSource[]
  skills: Skill[]
  tools: WorkforceTool[]
  behaviors: BehaviorRule[]
  channels: WorkerChannel[]
  autonomy: Autonomy
  status: WorkerStatus
  tested: boolean
  createdAt: number
  releasedAt: number | null
}

/* ---- capabilities: WHAT the worker CAN do (never mixed with outputs) --- */
export interface WorkerCapabilityScore {
  id: string
  label: string
  score: number
}

/* ================================================================== *
 * EXECUTION — Task -> Execution -> Output(s), and the event stream that
 * drives every projection in real time.
 * ================================================================== */

export interface WorkerTask {
  id: string
  workerId: string
  skillId: string
  type: SkillCategory
  title: string
  status: "queued" | "running" | "completed" | "failed"
  createdAt: number
}

export interface WorkerExecution {
  id: string
  workerId: string
  taskId: string
  status: "running" | "completed" | "failed"
  progress: number // 0-100
  target: number // total units of work (e.g. 20 prospects)
  done: number // units completed so far
  label: string // "Researching prospects"
  startedAt: number
  completedAt: number | null
}

export type OutputKind =
  | "research"
  | "blog"
  | "reel"
  | "social_post"
  | "dm"
  | "email"
  | "lead"
  | "meeting"
  | "crm"
  | "analysis"
  | "support"

export type OutputChannel = ChannelId | "cms" | "crm" | "web"

export type OutputStatus = "completed" | "draft" | "published" | "awaiting_approval" | "failed"

export interface WorkerOutput {
  id: string
  workerId: string
  taskId: string
  executionId: string
  type: OutputKind
  title: string
  content: string
  channel?: OutputChannel
  status: OutputStatus
  qualityScore?: number
  confidenceScore?: number
  taskSuccess?: number
  policyCompliance?: number
  brandAdherence?: number
  factuality?: number
  input?: string
  toolsUsed?: string[]
  knowledgeUsed?: string[]
  policyChecks?: string[]
  approval?: "not_required" | "approved" | "pending"
  durationMs?: number
  model?: string
  createdAt: number
}

export type WorkerEventType =
  | "task_started"
  | "progress"
  | "tool_called"
  | "output_created"
  | "task_completed"
  | "task_failed"

export interface WorkerEvent {
  id: string
  workerId: string
  executionId: string
  taskId: string
  type: WorkerEventType
  timestamp: number
  payload: Record<string, unknown>
}

/* ---- output presentation metadata ---- */
export const OUTPUT_TYPE_META: Record<OutputKind, { label: string; plural: string; filter: string }> = {
  research: { label: "Research report", plural: "Prospects researched", filter: "Research" },
  blog: { label: "Blog post", plural: "Blog posts", filter: "Content" },
  reel: { label: "Instagram Reel", plural: "Instagram Reels", filter: "Social" },
  social_post: { label: "Social post", plural: "Social posts", filter: "Social" },
  dm: { label: "Instagram DM", plural: "Instagram DMs", filter: "Communication" },
  email: { label: "Email", plural: "Emails", filter: "Communication" },
  lead: { label: "Qualified lead", plural: "Qualified leads", filter: "Sales" },
  meeting: { label: "Meeting", plural: "Meetings scheduled", filter: "Sales" },
  crm: { label: "CRM update", plural: "CRM updates", filter: "CRM" },
  analysis: { label: "Analysis", plural: "Analyses", filter: "Analysis" },
  support: { label: "Support response", plural: "Support responses", filter: "Communication" },
}

export const OUTPUT_STATUS_META: Record<OutputStatus, { label: string; tone: "good" | "info" | "warn" | "bad" | "muted" }> = {
  completed: { label: "Completed", tone: "good" },
  published: { label: "Published", tone: "good" },
  draft: { label: "Draft", tone: "muted" },
  awaiting_approval: { label: "Awaiting approval", tone: "warn" },
  failed: { label: "Failed", tone: "bad" },
}
