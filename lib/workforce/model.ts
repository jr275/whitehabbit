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

/* ---- integration permissions — the real, per-Worker, per-Action
 * decision an operator makes in Studio's Integrations step. Distinct
 * from ToolExecutionBoundary (which only ever answers "would the
 * blanket HIGH_RISK_PERMISSIONS rule require approval"): an explicit
 * decision here always wins over that blanket rule — "allow" lets an
 * operator knowingly authorize a normally-high-risk action to run
 * without a human gate every time, "deny" blocks an action this
 * worker's skills could otherwise reach, and "requires_approval" is
 * the safe default an unconfigured action already gets. Enforced
 * server-side in lib/agent/tool-runner.ts's runToolAction() — never
 * just a hidden/shown button in the UI. */
export type ActionPermissionDecision = "allow" | "deny" | "requires_approval"

export interface WorkerIntegrationAction {
  actionId: string
  enabled: boolean
  permission: ActionPermissionDecision
}

/** One Connector this Worker has been given access to, and exactly
 * which of that Connector's real actions it may use and how. Lives on
 * Worker/WorkerDefinitionSnapshot as ordinary JSONB — no migration —
 * the same zero-schema-change extensibility every other Worker field
 * already relies on. `connectionId` ties this to a real, org-scoped
 * Connection row (lib/connectors/types.ts); a Worker is never wired to
 * a Connector that doesn't have one. */
export interface WorkerIntegrationConfig {
  connectorId: string
  connectionId: string
  actions: WorkerIntegrationAction[]
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
  /** Real Connector access this Worker has been given, and exactly
   * which real actions it may use and how — the Studio Integrations
   * step's persisted state. Undefined/empty = no Connector access,
   * same as an empty array; a skill reaching for a connector tool this
   * Worker was never granted simply won't find it (lib/agent/tools/
   * connector-tools.ts only ever merges a CONNECTED Connection's
   * tools, unconditionally — this is the finer-grained, per-action
   * layer on top of that). */
  integrations: WorkerIntegrationConfig[]
  behaviors: BehaviorRule[]
  channels: WorkerChannel[]
  outcome: OutcomeDefinition
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
  integrations: WorkerIntegrationConfig[]
  behaviors: BehaviorRule[]
  channels: WorkerChannel[]
  outcome: OutcomeDefinition
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
  /** Full state machine (section 1 of the runtime-hardening brief):
   *   queued              -> not yet started
   *   running             -> the initial run is actively executing
   *   waiting_for_approval-> real terminal-for-now state; alias of
   *                          the prior phase's "pending_approval",
   *                          kept as the same string for backward
   *                          compatibility with every existing query/
   *                          UI branch — "pending_approval" IS
   *                          "waiting for approval", never a second
   *                          concept
   *   resuming            -> a real Approve decision is actively
   *                          re-running this exact execution
   *   retrying            -> a real "retry failed step" is actively
   *                          re-running one stage of this execution
   *   completed           -> every attempted stage succeeded
   *   partially_completed -> at least one real external action
   *                          completed AND at least one real stage
   *                          failed/was blocked — never silently
   *                          reported as either "everything worked"
   *                          or "everything failed"
   *   failed              -> the run failed with no real external
   *                          action having completed
   *   blocked             -> a required capability was never
   *                          configured (missing_credential)
   *   cancelled           -> a human rejected a pending approval */
  status: "queued" | "running" | "pending_approval" | "resuming" | "retrying" | "completed" | "partially_completed" | "failed" | "blocked" | "cancelled"
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
  /** Real, per-stage state for a skill that runs as a named, resumable
   * pipeline (see PipelineState below) — undefined for every other
   * skill. This is the execution graph's actual source of truth: each
   * node's status here is real, persisted, server-computed state, never
   * inferred or animated client-side. */
  pipelineState?: PipelineState
}

/* ---- Pipeline execution graph — real, named stages for a skill that
 * runs as an explicit multi-step operational flow (currently: the
 * Marketing Agent's Salesforce Lead Operations skill) rather than one
 * opaque execute() call. Persisted on WorkerExecution.pipelineState
 * and updated after every stage transition, so:
 *   - the execution graph UI renders real per-node state, never a
 *     fabricated animation
 *   - an Approve decision can CONTINUE the same execution past the
 *     approved stage (see Approval.resumeState) instead of only
 *     running the one captured action in isolation
 *   - "retry failed step" can re-run exactly one stage using the
 *     already-completed prior stages' real output, never replaying a
 *     real external action that already succeeded ---- */
export type PipelineStageStatus = "queued" | "running" | "completed" | "failed" | "blocked" | "waiting_for_approval" | "rejected" | "skipped"

export type PipelineStageKey = "objective_intake" | "research" | "qualification" | "llm_scoring" | "decision" | "salesforce_action" | "slack_notify" | "record_action"

export interface PipelineStageRecord {
  key: PipelineStageKey
  label: string
  status: PipelineStageStatus
  startedAt?: number
  completedAt?: number
  latencyMs?: number
  /** Human-readable, real detail — a result summary, or the real reason for failed/blocked/skipped/rejected. */
  detail?: string
  reasonCode?: ExecutionReasonCode
  provider?: string
  action?: string
  /** Set only for a stage that performed (or attempted) a real
   * external write — the idempotency ledger key used, so a retry of
   * this exact stage can be proven never to double-perform it. */
  idempotencyKey?: string
  attempts?: number
  /** This stage's own real output, for the next stage/the retry
   * mechanism/the UI to read — never re-derived or guessed. */
  output?: unknown
}

export interface PipelineObjective {
  objective: string
  target?: string
  constraints: string[]
  criteria: string[]
  requestedActions: string[]
}

export interface PipelineState {
  objective: PipelineObjective
  stages: PipelineStageRecord[]
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

export type OutputKind =
  | "trend_report"
  | "content_analysis"
  | "engagement_analysis"
  | "lead_qualification"
  | "seo_opportunity_plan"
  | "conversation_response"
  | "intelligence_report"
  | "creative_concepts"

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
  | "tool_failed"
  | "reasoning_started"
  | "reasoning_completed"
  | "output_created"
  | "business_event_recorded"
  | "metric_recorded"
  | "task_completed"
  | "task_failed"
  | "task_blocked"
  | "approval_required"
  | "approval_approved"
  | "approval_rejected"
  | "permission_checked"
  /** A named pipeline stage's own lifecycle — see PipelineStageRecord.
   * payload always carries { stage: PipelineStageKey, label }, plus
   * whatever that transition adds (detail/reasonCode/idempotencyKey). */
  | "stage_started"
  | "stage_completed"
  | "stage_failed"
  | "stage_blocked"
  | "stage_skipped"

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

/* ---- Human-in-the-loop approval — a real, persisted decision queue.
 * Created the instant runToolAction() (lib/agent/tool-runner.ts)
 * throws ApprovalRequiredError, capturing the exact real action/input
 * that was blocked. There is no durable workflow engine here to
 * literally suspend and resume the interrupted execution generator —
 * approving instead runs that exact captured action for real, right
 * now (see POST /api/approvals/[id]/decide), which is the honest,
 * buildable meaning of "the agent's intended real-world effect
 * actually happens once a human says yes" for this architecture. ---- */
export type ApprovalStatus = "pending" | "approved" | "rejected"

export interface Approval {
  id: string
  workerId: string
  executionId?: string
  toolId: string
  toolName: string
  actionId: string
  actionLabel: string
  permission: ToolPermission
  reason: string
  /** The real input the blocked call would have used — never a
   * secret, the same input an operator already configured/typed. */
  input: unknown
  status: ApprovalStatus
  /** The real ToolActionResult once Approve actually runs the action —
   * undefined until decided, or if rejected. */
  result?: unknown
  requestedAt: number
  decidedAt?: number
  decidedBy?: string
  /** Which real skill this blocked action belongs to — set so Approve
   * knows which SkillDefinition.resume() to call, if any. Undefined
   * for an approval created before this field existed. */
  skillId?: string
  /** A resumable skill's own real, in-progress PipelineState at the
   * moment it hit this approval gate — never a secret, the same
   * research/qualification/score data an operator can already see in
   * the execution. Undefined means this approval has no resumable
   * continuation: Approve runs the one captured action in isolation,
   * exactly like the prior phase's honestly-scoped behavior. */
  resumeState?: PipelineState
}

/* ---- Business Event -> Metric -> Outcome ----
 *
 * WorkerExecution -> WorkerOutput -> BusinessEvent -> MetricRecord is
 * the real provenance chain (section 4/13 of the Business Impact
 * brief): a BusinessEvent is derived from one real WorkerOutput
 * (lib/workforce/business-events.ts's deriveBusinessEvents(), called
 * once per completed execution in lib/agent/runtime.ts — never
 * invented when a skill's output doesn't support one), and a
 * MetricRecord that summarizes it carries that BusinessEvent's id in
 * `businessEventId` — the literal, queryable link the "click a metric,
 * see its evidence" experience walks backwards. */
export interface BusinessEvent {
  id: string
  workerId: string
  outputId?: string
  /** The exact execution this event came from — never inferred, never
   * shared across executions (section 10: "the same execution should
   * not create multiple contradictory business results" — each
   * execution's real events are its own). */
  executionId?: string
  /** e.g. "lead_qualified", "page_opportunity_planned",
   * "ticket_resolved" — an open, extensible vocabulary (section 6),
   * never a fixed enum a new Skill would be blocked on. */
  type: string
  /** What real, named thing this event is about, when the output
   * names one — a company, a page topic, a conversation. Never a
   * fabricated identifier. */
  entityId?: string
  entityType?: string
  /** The real count/score this event represents (e.g. 1 qualified
   * lead, a 91 ICP score) — never a dollar estimate unless the skill
   * itself produced one as an explicit, labeled estimate. */
  numericValue?: number
  currency?: string
  /** The skill's own real, structural confidence for this event —
   * never a second, invented confidence number. */
  confidence?: number
  /** Real provenance label — "skill:skill_lead_qualification" today;
   * "connector:google" once a Connection can emit one. Never a
   * fabricated integration name. */
  source?: string
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
  source?: string
  currency?: string
  confidence?: number
  recordedAt: number
}

/* ---- output presentation metadata ---- */
export const OUTPUT_TYPE_META: Record<string, { label: string; plural: string; filter: string }> = {
  trend_report: { label: "Trend report", plural: "Trend reports", filter: "Research" },
  content_analysis: { label: "Content analysis", plural: "Content analyses", filter: "Content" },
  engagement_analysis: { label: "Engagement analysis", plural: "Engagement analyses", filter: "Communication" },
  lead_qualification: { label: "Lead qualification", plural: "Lead qualifications", filter: "Sales" },
  seo_opportunity_plan: { label: "SEO opportunity plan", plural: "SEO opportunity plans", filter: "Content" },
  conversation_response: { label: "Conversation response", plural: "Conversation responses", filter: "Communication" },
  intelligence_report: { label: "Intelligence report", plural: "Intelligence reports", filter: "Research" },
  creative_concepts: { label: "Creative concepts", plural: "Creative concept batches", filter: "Content" },
  lead_pipeline_sync: { label: "Lead pipeline sync", plural: "Lead pipeline syncs", filter: "Sales" },
}

export const OUTPUT_STATUS_META: Record<OutputStatus, { label: string; tone: "good" | "info" | "warn" | "bad" | "muted" }> = {
  completed: { label: "Completed", tone: "good" },
  failed: { label: "Failed", tone: "bad" },
}

export const EXECUTION_STATUS_META: Record<WorkerExecution["status"], { label: string; tone: "good" | "info" | "warn" | "bad" | "muted" }> = {
  queued: { label: "Queued", tone: "muted" },
  running: { label: "Running", tone: "info" },
  completed: { label: "Completed", tone: "good" },
  partially_completed: { label: "Partially completed", tone: "warn" },
  failed: { label: "Failed", tone: "bad" },
  blocked: { label: "Blocked", tone: "warn" },
  pending_approval: { label: "Waiting for approval", tone: "warn" },
  resuming: { label: "Resuming", tone: "info" },
  retrying: { label: "Retrying", tone: "info" },
  cancelled: { label: "Cancelled", tone: "muted" },
}

/* ---- outcome KPI presets, per vertical (section 8) ---- */
export const OUTCOME_PRESETS: { vertical: string; primaryKPI: string; secondaryKPIs: string[] }[] = [
  { vertical: "Marketing", primaryKPI: "Qualified Leads", secondaryKPIs: ["Reach", "Engagement", "CTR", "Revenue"] },
  { vertical: "Sales", primaryKPI: "Pipeline Generated", secondaryKPIs: ["Meetings", "Qualified Opportunities", "Revenue"] },
  { vertical: "Customer Support", primaryKPI: "Resolution Rate", secondaryKPIs: ["CSAT", "Response Time", "Escalation Rate"] },
  { vertical: "Recruiting", primaryKPI: "Qualified Candidates", secondaryKPIs: ["Interview Completion", "Time to Hire", "Hiring Conversion"] },
]
