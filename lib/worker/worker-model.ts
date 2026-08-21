/* ================================================================== *
 * WORKER MODEL — the vocabulary of the entire product.
 *
 * Pure types only. Everything else (runtime, store, UI) speaks in
 * terms defined here. There is one source of truth: a Worker, its
 * configuration, and the executions it produces.
 * ================================================================== */

/* ---- lifecycle ---- */
export type WorkerStatus =
  | "draft" // exists but not built
  | "ready" // built, not released
  | "live" // released, executable, idle
  | "working" // executing a task
  | "waiting" // paused for human approval
  | "idle" // released, between tasks

export type BuildStatus = "idle" | "validating" | "building" | "ready" | "error"

export type Autonomy = "low" | "medium" | "high"
export type Permission = "allow" | "ask" | "block"
export type RiskLevel = "low" | "medium" | "high"

/* ---- configurable worker components ---- */
export interface Capability {
  id: string
  name: string
  description: string
  purpose: string
  category: string
  enabled: boolean
  version: string
  status: "healthy" | "degraded" | "new"
  tools: string[]
  successCriteria: string
  riskLevel: RiskLevel
}

export interface KnowledgeItem {
  id: string
  type: "text" | "url" | "document"
  title: string
  content: string
  createdAt: number
}

export interface Tool {
  id: string
  name: string
  description: string
  enabled: boolean
  permission: Permission
  status: "idle" | "connected" | "running"
}

export type PolicyKind = "confidence_threshold" | "custom"

export interface Policy {
  id: string
  text: string
  kind: PolicyKind
  /** for confidence_threshold policies: the % floor for outbound actions */
  threshold?: number
  /** what the policy governs, e.g. "outbound_email" */
  appliesTo?: string
}

export interface MemoryItem {
  id: string
  text: string
  confidence: number
  createdAt: number
}

export interface Worker {
  name: string
  objective: string
  version: string // "0.1", "0.2", ...
  status: WorkerStatus
  capabilities: Capability[]
  knowledge: KnowledgeItem[]
  tools: Tool[]
  policies: Policy[]
  memory: MemoryItem[]
  autonomy: Autonomy
  createdAt: number
}

/* ================================================================== *
 * EXECUTION — events and their derived result.
 * ================================================================== */

export type ExecutionEventType =
  | "TASK_CREATED"
  | "TASK_STARTED"
  | "RESEARCH_STARTED"
  | "TOOL_CALLED"
  | "SOURCE_FOUND"
  | "EVIDENCE_CREATED"
  | "REASONING_STARTED"
  | "DECISION_CREATED"
  | "ACTION_PREPARED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_GRANTED"
  | "ACTION_REJECTED"
  | "ACTION_EXECUTED"
  | "MEMORY_PROPOSED"
  | "MEMORY_CREATED"
  | "NEXT_ACTION_PROPOSED"
  | "TASK_COMPLETED"
  | "EXECUTION_ERROR"

export type EventStatus = "info" | "ok" | "warn" | "error"

export interface ExecutionEvent {
  id: string
  taskId: string
  timestamp: number
  type: ExecutionEventType
  status: EventStatus
  /** capability this event flows into (for the fabric projection) */
  capability?: string
  message: string
  metadata?: Record<string, unknown>
}

export type RunStatus =
  | "running"
  | "awaiting_approval"
  | "complete"
  | "rejected"
  | "error"

export type Decision = "QUALIFIED" | "NOT_QUALIFIED" | "INCONCLUSIVE"

export interface ProposedMemory {
  text: string
  confidence: number
}

export interface RunResult {
  id: string // task id, e.g. "4281"
  workerVersion: string
  objective: string
  status: RunStatus
  currentStep: string
  currentAction: string
  activeCapability: string | null
  /** running metrics, updated as events arrive */
  sources: number
  signals: number
  evidence: number
  positiveSignals: number
  negativeSignals: number
  confidence: number | null
  decision: Decision | null
  decisionFactors: string[]
  action: string | null
  actionExecuted: boolean
  outcome: string | null
  approvalReason: string | null
  proposedMemory: ProposedMemory | null
  nextActionProposed: string | null
  startedAt: number
  completedAt: number | null
  events: ExecutionEvent[]
}

/* ---- catalogs used by the builder ---- */
export const TOOL_CATALOG: Omit<Tool, "enabled" | "permission" | "status">[] = [
  { id: "web_search", name: "Web Search", description: "Search the public web for company and market data." },
  { id: "crm", name: "CRM", description: "Read and update customer records." },
  { id: "email", name: "Email", description: "Draft and send outbound email." },
  { id: "calendar", name: "Calendar", description: "Check availability and book meetings." },
  { id: "database", name: "Database", description: "Query the internal accounts database." },
]

export const CAPABILITY_TEMPLATES: Omit<Capability, "id" | "enabled">[] = [
  {
    name: "Research",
    description: "Gathers evidence about companies, people and markets.",
    purpose: "Perceive the world and collect signals.",
    category: "Perception",
    version: "1.0",
    status: "healthy",
    tools: ["web_search", "database"],
    successCriteria: "At least 8 credible sources per account.",
    riskLevel: "low",
  },
  {
    name: "Reasoning",
    description: "Scores fit and forms qualification decisions.",
    purpose: "Turn evidence into a defensible decision.",
    category: "Cognition",
    version: "1.0",
    status: "healthy",
    tools: [],
    successCriteria: "Decision confidence is calibrated to outcomes.",
    riskLevel: "low",
  },
  {
    name: "Communication",
    description: "Drafts outreach and messages to prospects.",
    purpose: "Express the worker's intent to humans.",
    category: "Expression",
    version: "1.0",
    status: "healthy",
    tools: ["email"],
    successCriteria: "Reply rate above 30%.",
    riskLevel: "medium",
  },
  {
    name: "Execution",
    description: "Takes actions in external systems (CRM, calendar).",
    purpose: "Act on the world.",
    category: "Action",
    version: "1.0",
    status: "healthy",
    tools: ["crm", "calendar"],
    successCriteria: "Actions complete without policy violations.",
    riskLevel: "high",
  },
]

export const AUTONOMY_LABEL: Record<Autonomy, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
}

export const AUTONOMY_DESCRIPTION: Record<Autonomy, string> = {
  low: "Requires human approval for every important action.",
  medium: "Executes low-risk actions; proposes the next task.",
  high: "Executes autonomously and creates its own follow-up tasks.",
}

export const STATUS_LABEL: Record<WorkerStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  live: "Live",
  working: "Working",
  waiting: "Waiting",
  idle: "Idle",
}
