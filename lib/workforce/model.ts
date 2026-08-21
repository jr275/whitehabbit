/* ================================================================== *
 * WORKFORCE MODEL — the single vocabulary behind Studio + Outputs.
 *
 * These are the CLIENT-FACING shapes: what the Studio Builder edits
 * (Worker definition) and what the Outputs Hub reads (the real
 * execution ledger: Task, Execution, Event, Output, BusinessEvent,
 * Metric). The server (lib/agent/, lib/db/) is the only thing that
 * ever writes Task/Execution/Event/Output/BusinessEvent/Metric rows —
 * the client only ever displays what actually happened.
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
  outputType: string
}

export type ToolRisk = "low" | "medium" | "high" | "critical"
export type ToolPermission = "read" | "write" | "publish" | "delete" | "financial" | "external_communication"

export interface WorkforceTool {
  id: string
  name: string
  provider: string
  enabled: boolean
  risk: ToolRisk
  permission: ToolPermission
  /** real, computed by the server — never a client-side assumption */
  connected: boolean
  notConnectedReason?: string
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

/** What outcome should this worker produce? Defined at creation, per
 * the brief's Outcome Definition requirement — never inferred later. */
export interface OutcomeDefinition {
  primaryKPI: string
  secondaryKPIs: string[]
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
  outcome: OutcomeDefinition
  autonomy: Autonomy
  status: WorkerStatus
  tested: boolean
  createdAt: number
  releasedAt: number | null
}

/* ================================================================== *
 * RUNTIME LEDGER — every row here is written exactly once, by the
 * server, exactly when the real thing it describes actually happened.
 * ================================================================== */

export interface WorkerTask {
  id: string
  workerId: string
  skillId: string
  type: SkillCategory
  title: string
  status: "queued" | "running" | "completed" | "failed" | "blocked"
  createdAt: number
}

export interface WorkerExecution {
  id: string
  workerId: string
  taskId: string
  status: "running" | "completed" | "failed" | "blocked"
  blockedReason?: string
  startedAt: number
  completedAt: number | null
  durationMs?: number
  costUsd?: number
  inputTokens?: number
  outputTokens?: number
  model?: string
}

export interface SourceRecord {
  title: string
  url: string
  provider: string
  snippet?: string
}

export interface EvaluationBreakdown {
  qualityScore: number
  breakdown: { label: string; score: number; note: string }[]
}

export type OutputKind = "trend_report" | "content_analysis" | "engagement_analysis"

export type OutputStatus = "completed" | "failed"

export interface WorkerOutput {
  id: string
  workerId: string
  taskId: string
  executionId: string
  type: string
  title: string
  content: string
  structured?: unknown
  sources?: SourceRecord[]
  qualityScore?: number
  evaluation?: EvaluationBreakdown
  status: OutputStatus
  createdAt: number
}

export type WorkerEventType =
  | "task_started"
  | "skill_started"
  | "tool_called"
  | "tool_completed"
  | "tool_blocked"
  | "reasoning_started"
  | "reasoning_completed"
  | "output_created"
  | "metric_recorded"
  | "task_completed"
  | "task_failed"
  | "task_blocked"

export interface WorkerEvent {
  id: string
  workerId: string
  executionId: string
  taskId: string
  type: WorkerEventType
  timestamp: number
  payload: Record<string, unknown>
}

/* ---- Business Event -> Metric -> Outcome ---- */
export interface BusinessEvent {
  id: string
  workerId: string
  outputId?: string
  type: string
  payload: Record<string, unknown>
  occurredAt: number
}

export type MetricKind = "operational" | "quality" | "cost" | "business"

export interface MetricRecord {
  id: string
  workerId: string
  executionId?: string
  businessEventId?: string
  key: string
  kind: MetricKind
  value: number
  unit?: string
  recordedAt: number
}

/* ---- output presentation metadata ---- */
export const OUTPUT_TYPE_META: Record<string, { label: string; plural: string; filter: string }> = {
  trend_report: { label: "Trend report", plural: "Trend reports", filter: "Research" },
  content_analysis: { label: "Content analysis", plural: "Content analyses", filter: "Content" },
  engagement_analysis: { label: "Engagement analysis", plural: "Engagement analyses", filter: "Communication" },
}

export const OUTPUT_STATUS_META: Record<OutputStatus, { label: string; tone: "good" | "info" | "warn" | "bad" | "muted" }> = {
  completed: { label: "Completed", tone: "good" },
  failed: { label: "Failed", tone: "bad" },
}

export const EXECUTION_STATUS_META: Record<WorkerExecution["status"], { label: string; tone: "good" | "info" | "warn" | "bad" | "muted" }> = {
  running: { label: "Running", tone: "info" },
  completed: { label: "Completed", tone: "good" },
  failed: { label: "Failed", tone: "bad" },
  blocked: { label: "Blocked", tone: "warn" },
}

/* ---- outcome KPI presets, per vertical (section 8) ---- */
export const OUTCOME_PRESETS: { vertical: string; primaryKPI: string; secondaryKPIs: string[] }[] = [
  { vertical: "Marketing", primaryKPI: "Qualified Leads", secondaryKPIs: ["Reach", "Engagement", "CTR", "Revenue"] },
  { vertical: "Sales", primaryKPI: "Pipeline Generated", secondaryKPIs: ["Meetings", "Qualified Opportunities", "Revenue"] },
  { vertical: "Customer Support", primaryKPI: "Resolution Rate", secondaryKPIs: ["CSAT", "Response Time", "Escalation Rate"] },
  { vertical: "Recruiting", primaryKPI: "Qualified Candidates", secondaryKPIs: ["Interview Completion", "Time to Hire", "Hiring Conversion"] },
]
