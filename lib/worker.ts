/* ------------------------------------------------------------------ *
 * WhiteHabbit — WORKER STATE (pure model, no React, no rendering)
 *
 * The factual definition of a worker: its identity, its capabilities,
 * the relationships between them, and the outcomes it has produced.
 * The runtime (lib/simulation.ts) emits events against this.
 * The fabric renderer (components/fabric-canvas.tsx) draws it.
 * Nothing here knows about pixels.
 * ------------------------------------------------------------------ */

export type CapabilityId =
  | "research"
  | "reasoning"
  | "communication"
  | "execution"
  | "reliability"
  | "memory"

/* Discrete lifecycle of a single event / capability during execution. */
export type EventKind =
  | "task_created"
  | "task_started"
  | "capability_activated"
  | "research_started"
  | "source_discovered"
  | "evidence_extracted"
  | "reasoning_started"
  | "icp_analysis"
  | "decision_created"
  | "communication_started"
  | "message_prepared"
  | "execution_started"
  | "crm_updated"
  | "action_failed"
  | "action_retried"
  | "memory_updated"
  | "memory_formed"
  | "approval_requested"
  | "approval_granted"
  | "approval_rejected"
  | "task_completed"
  | "outcome_created"
  | "autonomous_action"
  // legacy generic kinds kept for compatibility
  | "tool_called"
  | "action_executed"

export type EventStatus = "start" | "ok" | "fail" | "info"

/* Every capability node can be in one of these visual states. */
export type NodeState =
  | "idle"
  | "queued"
  | "active"
  | "success"
  | "warning"
  | "error"
  | "disabled"

/* Where the worker is in a task. */
export type ExecutionStatus =
  | "idle"
  | "researching"
  | "reasoning"
  | "communicating"
  | "executing"
  | "completed"
  | "failed"
  | "thinking"

/* Top-level worker lifecycle status surfaced in the HUD. The visual
 * system responds to these — motion and geometry carry the meaning. */
export type WorkerStatus =
  | "draft"
  | "building"
  | "ready"
  | "live"
  | "thinking"
  | "working"
  | "waiting"
  | "blocked"
  | "awaiting_approval"
  | "idle"
  | "evolving"
  | "error"

export interface WorkerEvent {
  id: number
  t: number
  taskId: number
  kind: EventKind
  /** where the pulse originates ("core" or a capability) */
  from: CapabilityId | "core"
  /** the capability this event lands on */
  to: CapabilityId
  label: string
  detail?: string
  status?: EventStatus
  /** a human line that unfolds in the narrative layer */
  narrative?: string
  /** arbitrary structured payload for the event inspector */
  payload?: Record<string, string | number | string[]>
}

export interface Capability {
  id: CapabilityId
  name: string
  /** health / mastery, 0-100 */
  score: number
  /** the worker's weakest link surfaces this */
  warning?: boolean
  /** skill/tool orbs that hang off this capability — grows on evolve */
  orbs: number
}

export interface Worker {
  name: string
  role: string
  level: number
  capabilities: Capability[]
}

export interface OutcomeMetric {
  value: string
  label: string
}

/* --------------------------- demo worker --------------------------- */

export const CAPABILITY_ORDER: CapabilityId[] = [
  "research",
  "reasoning",
  "communication",
  "execution",
  "reliability",
  "memory",
]

export const CAPABILITY_META: Record<
  CapabilityId,
  { name: string; blurb: string }
> = {
  research: { name: "Research", blurb: "Finds and verifies signal" },
  reasoning: { name: "Reasoning", blurb: "Scores intent and decides" },
  communication: { name: "Communication", blurb: "Drafts and speaks" },
  execution: { name: "Execution", blurb: "Acts on systems of record" },
  reliability: { name: "Reliability", blurb: "Guards every cycle" },
  memory: { name: "Memory", blurb: "Accumulates context over time" },
}

export const ATLAS: Worker = {
  name: "Atlas",
  role: "Sales Worker",
  level: 12,
  capabilities: [
    { id: "research", name: "Research", score: 94, orbs: 3 },
    { id: "reasoning", name: "Reasoning", score: 87, orbs: 2 },
    { id: "communication", name: "Communication", score: 73, warning: true, orbs: 1 },
    { id: "execution", name: "Execution", score: 96, orbs: 3 },
    { id: "reliability", name: "Reliability", score: 98, orbs: 2 },
    { id: "memory", name: "Memory", score: 82, orbs: 2 },
  ],
}

/* The causal flow through the worker — research feeds reasoning, which
 * feeds communication, which drives execution. Reliability oversees. */
export const FLOW: CapabilityId[] = [
  "research",
  "reasoning",
  "communication",
  "execution",
]

/* Directed relationships used both for physics edges and pulse routing. */
export const RELATIONS: [CapabilityId | "core", CapabilityId][] = [
  ["core", "research"],
  ["core", "reasoning"],
  ["core", "communication"],
  ["core", "execution"],
  ["core", "reliability"],
  ["core", "memory"],
  ["research", "reasoning"],
  ["reasoning", "communication"],
  ["communication", "execution"],
  ["execution", "reliability"],
  ["execution", "memory"],
  ["memory", "reasoning"],
]

export const OUTCOMES: OutcomeMetric[] = [
  { value: "$412K", label: "Pipeline generated" },
  { value: "184", label: "Meetings booked" },
  { value: "1,284", label: "Qualified leads" },
  { value: "4,812", label: "Research tasks" },
]

/* The eight-beat loop — the worker is never "done". */
export const LOOP = [
  { id: "create", label: "Create" },
  { id: "grow", label: "Grow" },
  { id: "teach", label: "Teach" },
  { id: "test", label: "Test" },
  { id: "release", label: "Release" },
  { id: "watch", label: "Watch" },
  { id: "trace", label: "Trace" },
  { id: "evolve", label: "Evolve" },
] as const

export type LoopId = (typeof LOOP)[number]["id"]

/* Zoom levels / cinematic modes — the deeper you go, the more technical. */
export type FabricMode = "outcome" | "fabric" | "watch" | "trace"

/* Contextual interactions that overlay the fabric. */
export type Interaction = "none" | "grow" | "teach" | "evolve"

export const KIND_META: Record<
  EventKind,
  { label: string; tone: "alive" | "grow" | "warn" | "muted" | "fail" }
> = {
  task_created: { label: "task", tone: "muted" },
  task_started: { label: "task", tone: "muted" },
  capability_activated: { label: "activate", tone: "alive" },
  research_started: { label: "research", tone: "alive" },
  source_discovered: { label: "source", tone: "alive" },
  evidence_extracted: { label: "evidence", tone: "alive" },
  reasoning_started: { label: "reasoning", tone: "alive" },
  icp_analysis: { label: "analysis", tone: "alive" },
  decision_created: { label: "decision", tone: "grow" },
  communication_started: { label: "comms", tone: "alive" },
  message_prepared: { label: "message", tone: "grow" },
  execution_started: { label: "execute", tone: "alive" },
  crm_updated: { label: "crm", tone: "grow" },
  action_failed: { label: "failed", tone: "fail" },
  action_retried: { label: "retry", tone: "warn" },
  memory_updated: { label: "memory", tone: "grow" },
  memory_formed: { label: "learned", tone: "grow" },
  approval_requested: { label: "approval", tone: "warn" },
  approval_granted: { label: "approved", tone: "grow" },
  approval_rejected: { label: "rejected", tone: "fail" },
  task_completed: { label: "done", tone: "grow" },
  outcome_created: { label: "outcome", tone: "grow" },
  autonomous_action: { label: "autonomy", tone: "alive" },
  tool_called: { label: "tool", tone: "alive" },
  action_executed: { label: "action", tone: "grow" },
}

/* The causal chain of a qualification decision — read bottom-up: an
 * OUTCOME exists because of a TASK, which rests on a DECISION, which
 * rests on REASONING over RESEARCH. Powers the causality visual. */
export interface CausalLink {
  cap: CapabilityId | "outcome" | "task"
  label: string
  detail: string
}

/* ================================================================== *
 * WORKER OPERATING SYSTEM — the deeper domain model.
 *
 * A worker is a persistent computational entity, not a workflow. The
 * Fabric is a *projection* of this model, never the model itself. These
 * layers are surfaced contextually (by clicking the core, a capability,
 * a tool) — never as a permanent sidebar.
 * ================================================================== */

/* ---- Identity: who the worker is and how mature it has become ---- */
export interface WorkerIdentity {
  name: string
  role: string
  objective: string
  /** long-term intent, distinct from the current task */
  autonomy: number // 0-100, how much it acts without asking
  reliability: number // 0-100
  maturity: number // operational maturity — more meaningful than level
  health: number // composite wellbeing
  level: number
  version: string
}

export const IDENTITY: WorkerIdentity = {
  name: "Atlas",
  role: "Enterprise Sales Worker",
  objective: "Identify, qualify and engage high-value enterprise prospects.",
  autonomy: 76,
  reliability: 98,
  maturity: 94,
  health: 94,
  level: 12,
  version: "3.2",
}

/* Health is composite and inspectable — never show all at once. */
export const HEALTH_FACTORS: { label: string; value: string; good: boolean }[] = [
  { label: "Reliability", value: "96%", good: true },
  { label: "Goal attainment", value: "91%", good: true },
  { label: "Error rate", value: "2.1%", good: true },
  { label: "Human intervention", value: "4%", good: true },
]

/* ---- Tools: external systems a capability can invoke ---- */
export interface Tool {
  id: string
  name: string
  status: "idle" | "running" | "connected"
}

/* ---- Capability as a first-class, inspectable object ---- */
export interface CapabilityDetail {
  category: string
  version: string
  health: number
  executions: number
  successRate: number
  tools: string[]
  knowledgeSources: number
  memorySignals: number
}

export const CAPABILITY_DETAIL: Record<CapabilityId, CapabilityDetail> = {
  research: {
    category: "Perception",
    version: "3.2",
    health: 94,
    executions: 4812,
    successRate: 96.4,
    tools: ["Web Search", "Browser", "Data Extraction"],
    knowledgeSources: 1284,
    memorySignals: 143,
  },
  reasoning: {
    category: "Cognition",
    version: "4.0",
    health: 91,
    executions: 4120,
    successRate: 93.1,
    tools: ["ICP Model", "Scoring Engine"],
    knowledgeSources: 612,
    memorySignals: 208,
  },
  communication: {
    category: "Expression",
    version: "3.1",
    health: 73,
    executions: 2980,
    successRate: 81.7,
    tools: ["Email", "Slack", "Templates"],
    knowledgeSources: 340,
    memorySignals: 96,
  },
  execution: {
    category: "Action",
    version: "3.4",
    health: 96,
    executions: 5210,
    successRate: 97.8,
    tools: ["CRM", "Calendar", "Database"],
    knowledgeSources: 210,
    memorySignals: 54,
  },
  reliability: {
    category: "Governance",
    version: "2.9",
    health: 98,
    executions: 12481,
    successRate: 99.2,
    tools: ["Policy Engine", "Validator"],
    knowledgeSources: 88,
    memorySignals: 31,
  },
  memory: {
    category: "Learning",
    version: "3.0",
    health: 82,
    executions: 3640,
    successRate: 90.4,
    tools: ["Vector Store", "Signal Graph"],
    knowledgeSources: 1284,
    memorySignals: 512,
  },
}

/* ---- Memory: what the worker LEARNED from experience (≠ knowledge) ---- */
export interface MemorySignal {
  id: string
  text: string
  confidence: number
  source: string
}

export const MEMORY_SIGNALS: MemorySignal[] = [
  { id: "m1", text: "Enterprise prospects respond better to personalized outreach.", confidence: 87, source: "127 successful interactions" },
  { id: "m2", text: "VP-level prospects respond better to short outreach.", confidence: 84, source: "64 replies analyzed" },
  { id: "m3", text: "Series-B companies hiring RevOps convert 2.3× more often.", confidence: 79, source: "312 qualified accounts" },
]

/* ---- Knowledge: what the worker knows about the world (≠ memory) ---- */
export const KNOWLEDGE_GROUPS: { label: string; count: number }[] = [
  { label: "Companies", count: 486 },
  { label: "People", count: 312 },
  { label: "Products", count: 128 },
  { label: "Markets", count: 42 },
  { label: "Documents", count: 204 },
  { label: "Web sources", count: 112 },
]

/* ---- Policies: what the worker SHOULD do ---- */
export const POLICIES: string[] = [
  "Prioritize VP and Director contacts at enterprise accounts.",
  "Do not send outreach after 8PM local time.",
  "Never modify CRM records with confidence below 80%.",
  "Always request human approval before sending a contract.",
]

/* ---- Permissions: what it CAN do vs what it MUST ASK ---- */
export type PermissionLevel = "allowed" | "approval" | "blocked"
export const PERMISSIONS: { action: string; level: PermissionLevel }[] = [
  { action: "Web Search", level: "allowed" },
  { action: "CRM Update", level: "allowed" },
  { action: "Send Email", level: "allowed" },
  { action: "Send Contract", level: "approval" },
  { action: "Delete CRM Record", level: "blocked" },
]

/* ---- Versions: evolution history ---- */
export interface WorkerVersion {
  version: string
  changes: string[]
  when: string
}
export const VERSIONS: WorkerVersion[] = [
  { version: "3.2", when: "now", changes: ["Contextual personalization", "Enterprise qualification policy", "New memory: VP short-form outreach"] },
  { version: "3.1", when: "2d ago", changes: ["Reasoning model v4", "Reliability guardrails"] },
  { version: "3.0", when: "1w ago", changes: ["Memory capability added"] },
]

/* Rolling operational history — a temporal layer, not an activity log. */
export const HISTORY_24H = {
  tasks: 127,
  completed: 114,
  waiting: 8,
  failed: 3,
  awaitingApproval: 2,
}

/* ---- Explainability: deterministic intents for the command bar.
 * Not an LLM — an explainability layer over worker state. Each intent
 * maps a matched question to a contextual, causal answer. ---- */
export interface ExplainAnswer {
  title: string
  lines: string[]
  confidence?: number
  /** capabilities to spotlight on the fabric while answering */
  spotlight?: CapabilityId[]
  cta?: string
}

export interface ExplainIntent {
  match: RegExp
  answer: ExplainAnswer
}

export const EXPLAIN_INTENTS: ExplainIntent[] = [
  {
    match: /why.*(reject|not qualify|pass)/i,
    answer: {
      title: "Why I rejected Northwind",
      lines: [
        "Budget signal was weak — no procurement activity found.",
        "ICP confidence was 61%, below the 80% qualification bar.",
        "No verified economic buyer was identified.",
      ],
      confidence: 88,
      spotlight: ["research", "reasoning"],
      cta: "Show evidence",
    },
  },
  {
    match: /(what).*(learn|learned)/i,
    answer: {
      title: "What I learned recently",
      lines: [
        "Shorter outreach performs better for enterprise VP prospects.",
        "Series-B companies hiring RevOps convert 2.3× more often.",
      ],
      confidence: 84,
      spotlight: ["memory"],
      cta: "Open memory",
    },
  },
  {
    match: /(what).*(doing|now|current)/i,
    answer: {
      title: "What I'm doing now",
      lines: [
        "Working the enterprise qualification queue.",
        "Currently reasoning over evidence for the active account.",
      ],
      spotlight: ["reasoning", "execution"],
    },
  },
  {
    match: /(what).*(next|plan|will)/i,
    answer: {
      title: "What I'll do next",
      lines: [
        "Identify the economic buyer for each qualified account.",
        "Prepare outreach, pausing for approval before any contract.",
      ],
      spotlight: ["research", "communication"],
    },
  },
  {
    match: /(improve|better).*(comm|outreach|writing)/i,
    answer: {
      title: "Improving communication",
      lines: [
        "Communication is the weakest capability at 73.",
        "Contextual personalization is projected to add +18%.",
      ],
      spotlight: ["communication"],
      cta: "Open evolve",
    },
  },
  {
    match: /(stop|pause|halt).*(outbound|outreach|action|all)/i,
    answer: {
      title: "Outbound paused",
      lines: [
        "All outbound actions are suspended.",
        "In-flight research and reasoning continue safely.",
      ],
      spotlight: ["reliability"],
    },
  },
  {
    match: /connect (salesforce|crm|slack|hubspot|gmail)/i,
    answer: {
      title: "Connecting tool",
      lines: [
        "A tool connection would attach to the Execution capability.",
        "This is a prototype — no external system is contacted.",
      ],
      spotlight: ["execution"],
    },
  },
]

export function explain(query: string): ExplainAnswer | null {
  const q = query.trim()
  if (!q) return null
  for (const it of EXPLAIN_INTENTS) if (it.match.test(q)) return it.answer
  return {
    title: "I can explain myself",
    lines: [
      "Try: why did you reject that lead?",
      "Try: what did you learn? · what are you doing? · improve communication.",
    ],
  }
}
