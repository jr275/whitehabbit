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

export type SkillCategory = "research" | "content" | "communication" | "sales" | "finance"

export const SKILL_CATEGORIES: SkillCategory[] = ["research", "content", "communication", "sales", "finance"]

export const SKILL_CATEGORY_LABEL: Record<SkillCategory, string> = {
  research: "Research",
  content: "Content",
  communication: "Communication",
  sales: "Sales",
  finance: "Finance",
}

/* ================================================================== *
 * TRUST MODEL — two orthogonal dimensions, never collapsed into one.
 *
 * DataProvenance answers "where did this number come from" (was a real
 * execution involved, and was the underlying data real, connected, or
 * demo/fictional). EconomicState answers a completely different
 * question: "how far has this dollar figure actually travelled toward
 * being real, reconciled cash" — a Worker's own hypothesis, a human-
 * approved estimate, money that has actually moved, or a figure
 * reconciled against a source of truth. A metric can be
 * provenance=real (a genuine execution produced it) and still
 * economicState=estimated (nobody has approved, executed, or
 * reconciled it yet) — the two must never be merged into one enum, or
 * the UI loses the ability to say "this is a real recommendation, not
 * yet acted on" instead of implying money has already moved.
 * ================================================================== */
export type DataProvenance = "real" | "connected" | "demo" | "simulated" | "not_connected"

export type EconomicState = "estimated" | "approved" | "executed" | "realized" | "verified"

export const ECONOMIC_STATE_LABEL: Record<EconomicState, string> = {
  estimated: "Estimated",
  approved: "Approved",
  executed: "Executed",
  realized: "Realized",
  verified: "Verified",
}

/** Named categories of economic value a business-impact metric can
 * represent — lets a future Command Center group and sum dollar
 * figures meaningfully instead of showing an undifferentiated metric
 * key. Deliberately a closed, small set (see docs/financial-domain.md)
 * rather than free-form text, so it stays summable and filterable. */
export type EconomicValueCategory =
  | "cash_preserved"
  | "cash_released"
  | "cost_avoided"
  | "cost_reduced"
  | "revenue_generated"
  | "margin_increased"
  | "working_capital_released"
  | "financing_cost_reduced"
  | "risk_exposure_reduced"
  | "forecast_accuracy_improved"

export const ECONOMIC_VALUE_CATEGORY_LABEL: Record<EconomicValueCategory, string> = {
  cash_preserved: "Cash preserved",
  cash_released: "Cash released",
  cost_avoided: "Cost avoided",
  cost_reduced: "Cost reduced",
  revenue_generated: "Revenue generated",
  margin_increased: "Margin increased",
  working_capital_released: "Working capital released",
  financing_cost_reduced: "Financing cost reduced",
  risk_exposure_reduced: "Risk exposure reduced",
  forecast_accuracy_improved: "Forecast accuracy improved",
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

/** Permissions that must never fire without a human approving first —
 * shared by the runtime's real approval gate (lib/agent/tool-runner.ts)
 * and the Studio UI's tool-boundary badge, so they can never disagree
 * about which actions are "high risk". */
export const HIGH_RISK_PERMISSIONS: ToolPermission[] = ["write", "publish", "delete", "financial", "external_communication"]

/** The real, current relationship between a worker and a tool — distinct
 * from the single "connected" boolean, per the product requirement that
 * a tool must never be treated as executable just because it's listed:
 *   not_available    — the worker hasn't enabled this tool at all
 *   not_connected     — enabled, but the real credential/integration isn't present
 *   requires_approval — connected, but its permission (write/publish/delete/
 *                        financial/external_communication) means the runtime
 *                        will halt with PENDING_APPROVAL rather than auto-run it
 *   executable         — connected, read-permission (or otherwise low-risk):
 *                        the runtime will actually call it
 */
export type ToolExecutionBoundary = "not_available" | "not_connected" | "requires_approval" | "executable"

export function toolExecutionBoundary(tool: WorkforceTool): ToolExecutionBoundary {
  if (!tool.enabled) return "not_available"
  if (!tool.connected) return "not_connected"
  if (HIGH_RISK_PERMISSIONS.includes(tool.permission)) return "requires_approval"
  return "executable"
}

export const TOOL_BOUNDARY_META: Record<ToolExecutionBoundary, { label: string; tone: "good" | "warn" | "muted" }> = {
  not_available: { label: "Not enabled", tone: "muted" },
  not_connected: { label: "Not connected", tone: "warn" },
  requires_approval: { label: "Requires approval", tone: "warn" },
  executable: { label: "Executable", tone: "good" },
}

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
  /** "memory" is distinct from the operator-authored types above it:
   * its content is appended to by the runtime itself (see
   * lib/db/repo.ts's appendWorkerMemory(), called from
   * lib/agent/runtime.ts after a real evaluated execution) — real,
   * accumulated facts about what actually happened, never invented,
   * never pre-seeded with placeholder history. */
  type: "website" | "pdf" | "playbook" | "docs" | "crm" | "faq" | "brand" | "memory"
  documents: number
  addedAt: number
  /** Real, operator-authored reference text — never auto-fetched or
   * invented. Only sources with real content here can ever be surfaced
   * to a skill's execution context; a source with no content is real
   * metadata (a catalog entry) but contributes no retrievable text. */
  content?: string
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

/** What real economic result is this Worker pursuing — distinct from
 * OutcomeDefinition (an operational KPI, e.g. "Qualified Leads") the
 * same way a financial mission is distinct from an activity target.
 * Optional and additive: undefined for any Worker created before this
 * field existed, or one whose operator hasn't set it — never inferred,
 * never defaulted to a plausible-looking value. Phase UX-2 creates
 * this contract; it does not implement optimization against it (see
 * docs/product-experience-blueprint.md's Phase C-J roadmap). */
export interface EconomicObjective {
  /** e.g. "Maximize free cash flow" — the real, operator-authored goal. */
  objective: string
  /** e.g. "Free cash flow" — what's actually being measured. */
  targetMetric: string
  /** e.g. "Reduce avoidable financing cost by 15%" — optional because a
   * real numeric target may not exist yet; never a placeholder number. */
  targetValue?: string
  /** e.g. "Quarterly" — optional for the same reason. */
  targetPeriod?: string
  /** e.g. "Maintain minimum liquidity threshold" — real, operator-
   * authored guardrails, not a generated list. */
  constraints: string[]
  riskTolerance: "low" | "moderate" | "high"
}

export type Autonomy = "low" | "medium" | "high"

/** Explicit lifecycle — draft (editable) -> building (Build in
 * progress) -> ready (has an immutable, buildable version but not
 * live) -> live (a version has actually been released). `live` is
 * ONLY ever set by the release action; nothing may infer it from
 * `status !== "draft"` — that was the ReleaseStep bug. See
 * `releasedVersionId` below, which is the actual source of truth for
 * "is this worker live". */
export type WorkerStatus = "draft" | "building" | "ready" | "live"

export interface Worker {
  id: string
  /** Which Product (lib/products/catalog.ts) this Worker was
   * provisioned for, if any — undefined for a Worker created the
   * general-purpose way (homepage "Assemble Worker", or built by hand
   * in Studio). This is an identity fact about the Worker record
   * itself, not a versioned configuration detail — it lives here, not
   * in WorkerDefinitionSnapshot, the same way status/releasedVersionId
   * do. A product-provisioned Worker is still a completely ordinary
   * Worker everywhere else: same runtime, same Studio, same execution
   * ledger — the product layer sits above this, it never forks it. */
  productId?: string
  identity: WorkerIdentity
  mission: string
  objectives: Objective[]
  knowledge: KnowledgeSource[]
  skills: Skill[]
  tools: WorkforceTool[]
  behaviors: BehaviorRule[]
  channels: WorkerChannel[]
  outcome: OutcomeDefinition
  /** Optional — see EconomicObjective's own doc comment. */
  economicObjective?: EconomicObjective
  autonomy: Autonomy
  status: WorkerStatus
  tested: boolean
  createdAt: number
  releasedAt: number | null
  /** The one authoritative "is this worker live" fact — the id of the
   * WorkerVersion currently released, or null. Run Worker always
   * executes this exact frozen version, never the live-editable
   * draft, so an in-flight or completed execution's configuration can
   * never be changed retroactively by a later edit. */
  releasedVersionId: string | null
}

/** An immutable Build artifact — a frozen snapshot of a Worker's
 * definition at the moment it was built, plus a reproducibility
 * fingerprint. Release promotes exactly one version's id into
 * Worker.releasedVersionId. A later draft edit never mutates a past
 * version. */
export interface WorkerVersion {
  id: string
  workerId: string
  versionNumber: number
  definition: WorkerDefinitionSnapshot
  fingerprint: string
  status: "ready" | "released" | "archived"
  createdAt: number
  releasedAt: number | null
}

/** The portion of Worker that Build actually freezes — everything
 * that determines runtime behavior. Deliberately excludes the fields
 * that are about the Worker record itself (id/status/timestamps),
 * not its configuration. */
export interface WorkerDefinitionSnapshot {
  identity: WorkerIdentity
  mission: string
  objectives: Objective[]
  knowledge: KnowledgeSource[]
  skills: Skill[]
  tools: WorkforceTool[]
  behaviors: BehaviorRule[]
  channels: WorkerChannel[]
  outcome: OutcomeDefinition
  economicObjective?: EconomicObjective
  autonomy: Autonomy
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
  status: "queued" | "running" | "completed" | "failed" | "blocked" | "pending_approval"
  createdAt: number
}

/** Mirrors lib/agent/types.ts ExecutionReasonCode — redeclared here so
 * client components can import it without pulling in server-only code. */
export type ExecutionReasonCode = "missing_credential" | "invalid_credential" | "provider_error" | "execution_error"

export interface WorkerExecution {
  id: string
  workerId: string
  /** The exact immutable WorkerVersion this execution ran (or is
   * running) — never the live-editable draft. Undefined only for
   * executions persisted before versioning existed. */
  workerVersionId?: string
  taskId: string
  status: "queued" | "running" | "completed" | "failed" | "blocked" | "pending_approval" | "cancelled"
  reasonCode?: ExecutionReasonCode
  blockedReason?: string
  startedAt: number
  completedAt: number | null
  durationMs?: number
  costUsd?: number
  inputTokens?: number
  outputTokens?: number
  model?: string
  /** "development" = this ran through the local development LLM provider
   * (LLM_DEV_MODE=true) — a deterministic fixture, never a real Anthropic
   * or Gemini call. Undefined = a real production execution. Persisted so
   * a past development run can never be mistaken for a real one, even
   * after LLM_DEV_MODE is turned back off. */
  executionMode?: "development"
  /** What the skill itself honestly reported its underlying DATA was —
   * distinct from executionMode, which is only about the LLM call. A
   * financial skill can make a real (non-development) LLM call while
   * still operating on a "demo" fictional ledger; that must show up
   * here, not be inferred from executionMode. Undefined for skills that
   * never set it (the original six marketing skills) — callers fall
   * back to the executionMode-based inference (see
   * business-results.ts's provenanceForExecution()). */
  dataProvenance?: DataProvenance
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

export type OutputKind = "trend_report" | "content_analysis" | "engagement_analysis" | "lead_qualification" | "seo_opportunity_plan" | "conversation_response"

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
  | "approval_required"

export interface WorkerEvent {
  id: string
  workerId: string
  executionId: string
  taskId: string
  type: WorkerEventType
  timestamp: number
  payload: Record<string, unknown>
  /** Monotonic per-execution order, assigned at persistence time —
   * the durable ordering guarantee a reconnecting client relies on,
   * independent of network/delivery order. */
  sequence?: number
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
  /** Only meaningful when kind === "business" — see EconomicState above.
   * Undefined for operational/quality/cost metrics, and for any
   * business metric emitted before this concept existed. */
  economicState?: EconomicState
  valueCategory?: EconomicValueCategory
}

/* ---- output presentation metadata ---- */
export const OUTPUT_TYPE_META: Record<string, { label: string; plural: string; filter: string }> = {
  trend_report: { label: "Trend report", plural: "Trend reports", filter: "Research" },
  content_analysis: { label: "Content analysis", plural: "Content analyses", filter: "Content" },
  engagement_analysis: { label: "Engagement analysis", plural: "Engagement analyses", filter: "Communication" },
  lead_qualification: { label: "Lead qualification", plural: "Lead qualifications", filter: "Sales" },
  seo_opportunity_plan: { label: "SEO opportunity plan", plural: "SEO opportunity plans", filter: "Content" },
  conversation_response: { label: "Conversation response", plural: "Conversation responses", filter: "Communication" },
  cash_position_summary: { label: "Cash position summary", plural: "Cash position summaries", filter: "Finance" },
  cash_forecast: { label: "Cash forecast", plural: "Cash forecasts", filter: "Finance" },
  working_capital_opportunities: { label: "Working capital opportunities", plural: "Working capital opportunities", filter: "Finance" },
  receivables_risk_analysis: { label: "Receivables risk analysis", plural: "Receivables risk analyses", filter: "Finance" },
}

export const OUTPUT_STATUS_META: Record<OutputStatus, { label: string; tone: "good" | "info" | "warn" | "bad" | "muted" }> = {
  completed: { label: "Completed", tone: "good" },
  failed: { label: "Failed", tone: "bad" },
}

export const EXECUTION_STATUS_META: Record<WorkerExecution["status"], { label: string; tone: "good" | "info" | "warn" | "bad" | "muted" }> = {
  queued: { label: "Queued", tone: "muted" },
  running: { label: "Running", tone: "info" },
  completed: { label: "Completed", tone: "good" },
  failed: { label: "Failed", tone: "bad" },
  blocked: { label: "Blocked", tone: "warn" },
  pending_approval: { label: "Pending approval", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "muted" },
}

/* ---- outcome KPI presets, per vertical (section 8) ---- */
export const OUTCOME_PRESETS: { vertical: string; primaryKPI: string; secondaryKPIs: string[] }[] = [
  { vertical: "Marketing", primaryKPI: "Qualified Leads", secondaryKPIs: ["Reach", "Engagement", "CTR", "Revenue"] },
  { vertical: "Sales", primaryKPI: "Pipeline Generated", secondaryKPIs: ["Meetings", "Qualified Opportunities", "Revenue"] },
  { vertical: "Customer Support", primaryKPI: "Resolution Rate", secondaryKPIs: ["CSAT", "Response Time", "Escalation Rate"] },
  { vertical: "Recruiting", primaryKPI: "Qualified Candidates", secondaryKPIs: ["Interview Completion", "Time to Hire", "Hiring Conversion"] },
  { vertical: "Finance", primaryKPI: "Cash Preserved", secondaryKPIs: ["Liquidity Risk Exposure", "Working Capital Released", "Forecast Accuracy"] },
]
