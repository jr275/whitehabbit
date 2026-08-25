import "server-only"

/* ================================================================== *
 * SKILL: MARKETING LEAD OPERATIONS (id kept as skill_salesforce_lead_
 * pipeline for continuity with everything already wired to it —
 * Studio, the catalog, business-events.ts's output.type mapping) —
 * the Marketing Agent's real operational pipeline:
 *
 *   objective_intake -> research -> qualification -> llm_scoring ->
 *   decision -> salesforce_action -> slack_notify
 *
 * Every stage is real: web search results structured into candidates
 * (no LLM at this stage — nothing to fabricate), a deterministic
 * qualification pass BEFORE any LLM call, one schema-validated LLM
 * scoring call (retried on invalid output, never exposing chain-of-
 * thought — only a short reasoningSummary is ever persisted), a
 * deterministic decision engine that is the only thing allowed to
 * decide whether a real external write is attempted, then the real
 * Integration Runtime for the Salesforce write and the Slack
 * notification — both permission-gated exactly like every other
 * connector action (lib/agent/tool-runner.ts), both idempotent
 * (lib/agent/pipeline/idempotency.ts) against a retry or a resume.
 *
 * RESUMABILITY: unlike the prior phase's flow (which unwound the
 * whole skill the instant ApprovalRequiredError fired), this skill
 * implements resume() — the runtime's one real, honest way to
 * "continue the same execution" after a human approves an action
 * (see runtime.ts's resumeTask/Approval.resumeState doc comments). A
 * blocked stage's PipelineState is attached to the re-thrown
 * ApprovalRequiredError; Approve calls resume() with that exact state
 * back, which performs the approved action for real and CONTINUES to
 * whatever stage comes next (e.g. Slack after a Salesforce approval)
 * instead of stopping.
 *
 * HONEST INFRASTRUCTURE LIMIT (disclosed, not hidden): this
 * deployment's only real, keyless web-search provider is the public
 * npm registry (see lib/agent/tools/web-search.ts's own header) — not
 * a company/firmographic research API. A "research candidate" below
 * carries only the real signal npm package metadata can support
 * (name, url, description); industry/location/employeeRange are
 * genuinely null unless real evidence text happens to support them —
 * never guessed. This is the same honest constraint lead-
 * qualification.ts already discloses, carried through here.
 * ================================================================== */

import { foldStageEvent } from "@/lib/agent/pipeline/driver"
import { runIdempotent } from "@/lib/agent/pipeline/idempotency"
import { qualifyAll } from "@/lib/agent/pipeline/qualify"
import { decide } from "@/lib/agent/pipeline/decide"
import { STAGE_ORDER } from "@/lib/agent/pipeline/types"
import type { Decision, LlmScoreResult, MarketingLeadOpsPayload, QualificationResult, ResearchCandidate } from "@/lib/agent/pipeline/types"
import { DEFAULT_RETRY_POLICY, isTransientToolFailure, withRetry } from "@/lib/agent/retry"
import { runToolAction } from "@/lib/agent/tool-runner"
import type { MetricEmission, RuntimeEventType, SkillDefinition, SkillEvaluation, SkillExecutionContext, SkillExecutionResult, ToolContext, WorkerContext } from "@/lib/agent/types"
import { ApprovalRequiredError, InvalidCredentialError, ProviderError, SkillBlockedError } from "@/lib/agent/types"
import type { PipelineObjective, PipelineStageKey, PipelineState } from "@/lib/workforce/model"

/* ---- structured input -> PipelineObjective (section 1) ---- */
function splitList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export function parseObjective(input: Record<string, string>): PipelineObjective {
  return {
    objective: (input.objective ?? input.query ?? "").trim(),
    target: input.target?.trim() || undefined,
    constraints: splitList(input.constraints),
    criteria: splitList(input.criteria),
    requestedActions: splitList(input.requestedActions),
  }
}

/* ---- local pipeline-state mirror: the skill emits through ctx.emit
 * (which the runtime persists) AND folds the same event through the
 * exact same pure function to keep a local copy — needed only to
 * attach a real, current resumeState to ApprovalRequiredError. ---- */
function step(ctx: SkillExecutionContext, state: PipelineState, type: RuntimeEventType, payload: Record<string, unknown>): PipelineState {
  ctx.emit(type, payload)
  return foldStageEvent(state, type, payload, Date.now()) ?? state
}

/* ---- stage 2: research — real web search, structured, no LLM ---- */
async function runResearchStage(ctx: SkillExecutionContext, toolCtx: ToolContext, objective: PipelineObjective, state: PipelineState): Promise<{ state: PipelineState; candidates: ResearchCandidate[] }> {
  state = step(ctx, state, "stage_started", { stage: "research", label: "Research" })

  const search = ctx.tools.get("tool_web_search")
  if (!search) {
    state = step(ctx, state, "stage_blocked", { stage: "research", label: "Research", detail: "RESEARCH PROVIDER NOT CONFIGURED — no web search tool is registered on this worker." })
    throw new SkillBlockedError("RESEARCH PROVIDER NOT CONFIGURED — connect a web search tool to run this skill.")
  }

  const query = [objective.objective, objective.target, ...objective.criteria].filter(Boolean).join(" ").trim() || "companies"
  const searchAction = search.actions.find((a) => a.id === "search")!
  const { result: searchResult, attempts } = await withRetry(
    () => runToolAction<{ results: { title: string; url: string; provider: string; snippet?: string }[] }>(search.id, search.name, searchAction, { query, limit: 10 }, toolCtx),
    isTransientToolFailure,
    DEFAULT_RETRY_POLICY,
    (r) => r.retryAfterMs,
  )
  if (!searchResult.ok) {
    if (searchResult.blocked) {
      state = step(ctx, state, "stage_blocked", { stage: "research", label: "Research", detail: `RESEARCH PROVIDER NOT CONFIGURED — ${searchResult.blockedReason ?? "web search is not connected."}` })
      throw new SkillBlockedError(`RESEARCH PROVIDER NOT CONFIGURED — ${searchResult.blockedReason ?? "web search is not connected."}`)
    }
    state = step(ctx, state, "stage_failed", { stage: "research", label: "Research", detail: searchResult.error ?? "Web search failed.", reasonCode: "provider_error" })
    throw new ProviderError(searchResult.error ?? "Web search failed.")
  }

  const candidates: ResearchCandidate[] = searchResult.data!.results.map((r, i) => ({
    id: `cand_${i}`,
    company: r.title,
    website: r.url || null,
    industry: null,
    location: null,
    employeeRange: null,
    evidence: r.snippet ?? "",
    source: r.url,
    confidence: r.snippet ? 40 : 15, // real, modest confidence — this data source is not firmographic
  }))

  state = step(ctx, state, "stage_completed", { stage: "research", label: "Research", detail: `${candidates.length} real candidate${candidates.length === 1 ? "" : "s"} found.`, provider: search.provider, action: "search", attempts, output: candidates })
  return { state, candidates }
}

/* ---- stage 3: deterministic qualification (no LLM) ---- */
function runQualificationStage(ctx: SkillExecutionContext, objective: PipelineObjective, candidates: ResearchCandidate[], state: PipelineState): { state: PipelineState; qualifications: QualificationResult[] } {
  state = step(ctx, state, "stage_started", { stage: "qualification", label: "Qualification" })
  const qualifications = qualifyAll(candidates, objective)
  state = step(ctx, state, "stage_completed", {
    stage: "qualification",
    label: "Qualification",
    detail: `${qualifications.length} candidate${qualifications.length === 1 ? "" : "s"} scored deterministically.`,
    output: qualifications,
  })
  return { state, qualifications }
}

/* ---- stage 4: LLM scoring — schema validated + retried ---- */
const SYSTEM_PROMPT = `You are a B2B sales analyst scoring real candidate companies found via research, against a real target profile. You are given real candidates with whatever real evidence is available — evidence may be sparse; score honestly on what's actually there, never invent a fact not supported by the evidence.

Respond with ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{"scores":[{"id": string (the real candidate id given to you), "leadScore": number (0-100), "qualification": "qualified" | "not_qualified", "reasoningSummary": string (1-2 sentences — a SAFE SUMMARY only, never raw chain-of-thought), "recommendedAction": string (one short sentence)}]}

Score every candidate you were given, using its exact given id.`

function buildSystemPrompt(worker: WorkerContext): string {
  const extra: string[] = []
  if (worker.mission.trim()) extra.push(`The worker executing this task has this mission: "${worker.mission.trim()}"`)
  if (worker.behaviors.length) extra.push(`It must follow these operator-defined behavior rules:\n${worker.behaviors.map((b) => `- IF ${b.condition} THEN ${b.action}`).join("\n")}`)
  return extra.length ? `${SYSTEM_PROMPT}\n\n${extra.join("\n\n")}` : SYSTEM_PROMPT
}

export function validateScores(text: string, candidateIds: string[]): LlmScoreResult[] | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }
  const raw = (parsed as { scores?: unknown }).scores
  if (!Array.isArray(raw) || raw.length === 0) return null
  const idSet = new Set(candidateIds)
  const out: LlmScoreResult[] = []
  for (const item of raw as Record<string, unknown>[]) {
    const id = typeof item.id === "string" ? item.id : null
    const leadScore = typeof item.leadScore === "number" ? item.leadScore : null
    const qualification = item.qualification === "qualified" || item.qualification === "not_qualified" ? item.qualification : null
    const reasoningSummary = typeof item.reasoningSummary === "string" ? item.reasoningSummary : null
    const recommendedAction = typeof item.recommendedAction === "string" ? item.recommendedAction : null
    if (!id || !idSet.has(id) || leadScore == null || leadScore < 0 || leadScore > 100 || !qualification || !reasoningSummary || !recommendedAction) return null
    out.push({ id, leadScore, qualification, reasoningSummary, recommendedAction })
  }
  return out
}

async function runLlmScoringStage(
  ctx: SkillExecutionContext,
  toolCtx: ToolContext,
  objective: PipelineObjective,
  candidates: ResearchCandidate[],
  qualifications: QualificationResult[],
  state: PipelineState,
): Promise<{ state: PipelineState; scores: LlmScoreResult[]; model?: string; inputTokens?: number; outputTokens?: number; provider?: string; executionMode?: "development" }> {
  state = step(ctx, state, "stage_started", { stage: "llm_scoring", label: "LLM scoring" })

  const llm = ctx.tools.get("tool_llm")
  if (!llm) {
    state = step(ctx, state, "stage_blocked", { stage: "llm_scoring", label: "LLM scoring", detail: "No LLM tool is registered on this worker." })
    throw new SkillBlockedError("LLM tool is not registered on this worker.")
  }
  const analyzeAction = llm.actions.find((a) => a.id === "analyze")!

  // Score the top candidates by deterministic qualification only — an
  // honest, bounded batch, never every candidate regardless of scale.
  const byId = new Map(qualifications.map((q) => [q.candidateId, q]))
  const ranked = [...candidates].sort((a, b) => (byId.get(b.id)?.qualificationScore ?? 0) - (byId.get(a.id)?.qualificationScore ?? 0)).slice(0, 8)
  const candidatesBlock = ranked
    .map((c) => {
      const q = byId.get(c.id)
      return `[${c.id}] ${c.company} — evidence: ${c.evidence || "(none)"} — source: ${c.source || "(none)"} — deterministic qualification: ${q?.qualificationScore ?? "—"}/100 (${q?.qualificationReasons.join("; ") ?? ""})`
    })
    .join("\n")
  const objectiveBlock = `Objective: ${objective.objective}${objective.target ? `\nTarget: ${objective.target}` : ""}${objective.criteria.length ? `\nCriteria: ${objective.criteria.join(", ")}` : ""}${objective.constraints.length ? `\nConstraints: ${objective.constraints.join(", ")}` : ""}`

  let lastText = ""
  let llmMeta: { model: string; inputTokens: number; outputTokens: number; provider: string; executionMode?: "development" } | undefined
  const { result: scores, attempts } = await withRetry(
    async (attempt) => {
      const correction = attempt > 0 ? `\n\nYour previous response did not match the required JSON schema exactly. Return ONLY the JSON object described, with every field present and correctly typed.` : ""
      const prompt = `${objectiveBlock}\n\nReal candidates:\n${candidatesBlock}${correction}\n\nScore each candidate.`
      const llmResult = await runToolAction<{ text: string; model: string; inputTokens: number; outputTokens: number; provider: string; executionMode?: "development" }>(llm.id, llm.name, analyzeAction, { system: buildSystemPrompt(ctx.worker), prompt, maxTokens: 2000 }, toolCtx)
      if (!llmResult.ok) {
        if (llmResult.blocked) throw new SkillBlockedError(llmResult.blockedReason ?? "LLM is blocked.")
        if (llmResult.errorCode === "invalid_credential") throw new InvalidCredentialError(llmResult.error ?? "The configured LLM credential was rejected.")
        throw new ProviderError(llmResult.error ?? "LLM scoring failed.")
      }
      const data = llmResult.data!
      llmMeta = { model: data.model, inputTokens: data.inputTokens, outputTokens: data.outputTokens, provider: data.provider, executionMode: data.executionMode }
      lastText = data.text
      // The development fixture uses placeholder ids — remap them
      // positionally onto the real ranked candidates so dev-mode
      // testing exercises the real downstream decision/CRM/approval
      // path. Never active outside executionMode "development".
      const text = data.executionMode === "development" ? remapDevFixtureIds(data.text, ranked.map((c) => c.id)) : data.text
      return validateScores(text, ranked.map((c) => c.id))
    },
    (result) => result === null,
    DEFAULT_RETRY_POLICY,
  )

  if (!scores) {
    state = step(ctx, state, "stage_failed", { stage: "llm_scoring", label: "LLM scoring", detail: `The LLM response failed schema validation after ${attempts} attempt${attempts === 1 ? "" : "s"}.`, reasonCode: "execution_error" })
    throw new Error(`The LLM response was not valid structured lead-score data after ${attempts} attempt(s). Raw: ${lastText.slice(0, 200)}`)
  }

  state = step(ctx, state, "stage_completed", {
    stage: "llm_scoring",
    label: "LLM scoring",
    detail: `${scores.length} candidate${scores.length === 1 ? "" : "s"} scored${attempts > 1 ? ` (${attempts} attempts)` : ""}.`,
    provider: llmMeta?.provider,
    action: "analyze",
    attempts,
    output: scores,
  })
  return { state, scores, ...llmMeta }
}

function remapDevFixtureIds(text: string, realIds: string[]): string {
  try {
    const parsed = JSON.parse(text) as { scores: { id: string }[] }
    parsed.scores.forEach((s, i) => {
      if (realIds[i]) s.id = realIds[i]
    })
    return JSON.stringify(parsed)
  } catch {
    return text
  }
}

/* ---- stage 5: deterministic decision (section 5) ---- */
function runDecisionStage(ctx: SkillExecutionContext, objective: PipelineObjective, scores: LlmScoreResult[], state: PipelineState): { state: PipelineState; decision: Decision | null; topScore: LlmScoreResult | null } {
  state = step(ctx, state, "stage_started", { stage: "decision", label: "Decision" })
  if (scores.length === 0) {
    state = step(ctx, state, "stage_completed", { stage: "decision", label: "Decision", detail: "No scored candidates — nothing to decide." })
    return { state, decision: null, topScore: null }
  }
  const topScore = [...scores].sort((a, b) => b.leadScore - a.leadScore)[0]
  const decision = decide(topScore, objective)
  state = step(ctx, state, "stage_completed", { stage: "decision", label: "Decision", detail: decision.reason, output: decision })
  return { state, decision, topScore }
}

/* ---- stage 6: Salesforce action (permission-gated, idempotent) ---- */
async function runSalesforceStage(
  ctx: SkillExecutionContext,
  toolCtx: ToolContext,
  topCandidate: ResearchCandidate | null,
  score: LlmScoreResult | null,
  decision: Decision | null,
  state: PipelineState,
  opts: { preApproved: boolean },
): Promise<{ state: PipelineState; outcome: MarketingLeadOpsPayload["salesforceAction"] }> {
  if (!decision || decision.action === "no_action" || !topCandidate) {
    state = step(ctx, state, "stage_skipped", { stage: "salesforce_action", label: "Salesforce action", detail: decision ? decision.reason : "No decision reached." })
    return { state, outcome: null }
  }

  const salesforce = ctx.tools.get("connector_salesforce.actions")
  if (!salesforce) {
    state = step(ctx, state, "stage_blocked", { stage: "salesforce_action", label: "Salesforce action", detail: "Salesforce connection required." })
    throw new SkillBlockedError("Salesforce connection required. Connect Salesforce to complete this action.")
  }

  state = step(ctx, state, "stage_started", { stage: "salesforce_action", label: "Salesforce action" })

  const searchAction = salesforce.actions.find((a) => a.id === "search_leads")!
  const searchResult = await runToolAction<{ records: { Id: string; Name: string; Company: string; Rating?: string }[] }>(salesforce.id, salesforce.name, searchAction, { query: topCandidate.company }, toolCtx)
  if (!searchResult.ok) {
    if (searchResult.blocked) {
      state = step(ctx, state, "stage_blocked", { stage: "salesforce_action", label: "Salesforce action", detail: "Salesforce connection required." })
      throw new SkillBlockedError("Salesforce connection required. Connect Salesforce to complete this action.")
    }
    state = step(ctx, state, "stage_failed", { stage: "salesforce_action", label: "Salesforce action", detail: searchResult.error ?? "Salesforce search failed.", reasonCode: "provider_error" })
    throw new ProviderError(searchResult.error ?? "Salesforce search_leads failed.")
  }

  const existing = searchResult.data!.records.find((r) => r.Company?.toLowerCase() === topCandidate.company.toLowerCase())
  const rating = score && score.leadScore >= 80 ? "Hot" : score && score.leadScore >= 60 ? "Warm" : "Cold"
  const description = score ? `${score.reasoningSummary} (score ${score.leadScore}/100)` : undefined

  const idempResource = existing ? existing.Id : topCandidate.company
  const actionId = existing ? "update_lead" : "create_lead"
  const actionDef = salesforce.actions.find((a) => a.id === actionId)!

  try {
    // Retries wrap the idempotent call itself: a transient failure's
    // ledger row is reclaimed (attempt incremented, per section 8) and
    // genuinely retried; a completed row is never called again; an
    // ApprovalRequiredError throw (not-yet-approved) propagates
    // through untouched, on the first attempt, unretried.
    const { result: idempOutcome, attempts } = await withRetry(
      () =>
        runIdempotent(
          ctx.executionId,
          "salesforce",
          actionId,
          idempResource,
          async () => {
            if (opts.preApproved) {
              // A human already approved this exact action — run it for
              // real directly, bypassing the permission gate a second time
              // (matches the prior phase's Approve behavior exactly).
              return actionDef.run(existing ? { id: existing.Id, fields: { Rating: rating, Description: description } } : { LastName: topCandidate.company, Company: topCandidate.company, Rating: rating }, toolCtx)
            }
            return runToolAction(salesforce.id, salesforce.name, actionDef, existing ? { id: existing.Id, fields: { Rating: rating, Description: description } } : { LastName: topCandidate.company, Company: topCandidate.company, Rating: rating }, toolCtx)
          },
          { stepId: "salesforce_action", integrationId: "connector_salesforce" },
        ),
      (outcome) => isTransientToolFailure(outcome.result),
      DEFAULT_RETRY_POLICY,
      (outcome) => outcome.result.retryAfterMs,
    )
    const { result: actionResult, deduped } = idempOutcome
    if (!actionResult.ok) {
      state = step(ctx, state, "stage_failed", { stage: "salesforce_action", label: "Salesforce action", detail: actionResult.error ?? "Salesforce write failed.", reasonCode: "provider_error" })
      throw new ProviderError(actionResult.error ?? "Salesforce write failed.")
    }
    const leadId = existing ? existing.Id : String((actionResult.data as { id?: string } | undefined)?.id ?? "")
    const outcome: MarketingLeadOpsPayload["salesforceAction"] = { mode: existing ? "updated" : "created", leadId, fields: { Rating: rating, Description: description }, status: "completed" }
    state = step(ctx, state, "stage_completed", {
      stage: "salesforce_action",
      label: "Salesforce action",
      detail: `${outcome.mode === "updated" ? "Updated" : "Created"} Salesforce Lead ${leadId}${deduped ? " (idempotent — already performed)" : ""}.`,
      provider: "salesforce",
      action: actionId,
      idempotencyKey: `${ctx.executionId}:salesforce:${actionId}:${idempResource}`,
      attempts,
      output: outcome,
    })
    return { state, outcome }
  } catch (err) {
    if (err instanceof ApprovalRequiredError) {
      const withResume = new ApprovalRequiredError(err.toolId, err.toolName, err.actionLabel, err.permission, err.actionId, err.input, state, "salesforce_action")
      throw withResume
    }
    throw err
  }
}

/* ---- stage 7: Slack notification — never blocks the whole run ---- */
async function runSlackStage(
  ctx: SkillExecutionContext,
  toolCtx: ToolContext,
  topCandidate: ResearchCandidate | null,
  score: LlmScoreResult | null,
  decision: Decision | null,
  salesforceOutcome: MarketingLeadOpsPayload["salesforceAction"],
  state: PipelineState,
  opts: { preApproved: boolean },
): Promise<{ state: PipelineState; outcome: MarketingLeadOpsPayload["slackNotification"] }> {
  if (!decision || decision.action !== "update_lead_and_notify" || !salesforceOutcome || salesforceOutcome.status !== "completed" || !topCandidate) {
    state = step(ctx, state, "stage_skipped", { stage: "slack_notify", label: "Slack notification", detail: !decision || decision.action !== "update_lead_and_notify" ? "Decision policy did not call for a notification." : "No completed Salesforce action to notify about." })
    return { state, outcome: null }
  }

  const slack = ctx.tools.get("connector_slack.actions")
  if (!slack) {
    state = step(ctx, state, "stage_blocked", { stage: "slack_notify", label: "Slack notification", detail: "SLACK NOT CONFIGURED" })
    return { state, outcome: { channel: "", ts: "", status: "blocked", detail: "SLACK NOT CONFIGURED" } }
  }

  state = step(ctx, state, "stage_started", { stage: "slack_notify", label: "Slack notification" })
  const sendMessageAction = slack.actions.find((a) => a.id === "send_message")!
  const text = `High-priority lead identified\nCompany: ${topCandidate.company}\nScore: ${score?.leadScore ?? "—"}/100\nQualification: ${score?.qualification ?? "—"}\nRecommended next step: ${score?.recommendedAction ?? "—"}`

  try {
    const { result: idempOutcome, attempts } = await withRetry(
      () =>
        runIdempotent(
          ctx.executionId,
          "slack",
          "send_message",
          topCandidate.company,
          async () => {
            if (opts.preApproved) return sendMessageAction.run({ channel: "#sales", text }, toolCtx)
            return runToolAction<{ ok: boolean; ts: string; channel: string }>(slack.id, slack.name, sendMessageAction, { channel: "#sales", text }, toolCtx)
          },
          { stepId: "slack_notify", integrationId: "connector_slack" },
        ),
      (outcome) => isTransientToolFailure(outcome.result),
      DEFAULT_RETRY_POLICY,
      (outcome) => outcome.result.retryAfterMs,
    )
    const { result: notifyResult, deduped } = idempOutcome
    if (!notifyResult.ok) {
      state = step(ctx, state, "stage_failed", { stage: "slack_notify", label: "Slack notification", detail: notifyResult.error ?? "Slack notification failed.", reasonCode: "provider_error" })
      return { state, outcome: { channel: "#sales", ts: "", status: "failed", detail: notifyResult.error } }
    }
    const data = notifyResult.data as { ts?: string; channel?: string } | undefined
    const outcome: MarketingLeadOpsPayload["slackNotification"] = { channel: data?.channel ?? "#sales", ts: data?.ts ?? "", status: "completed" }
    state = step(ctx, state, "stage_completed", { stage: "slack_notify", label: "Slack notification", detail: `Notified ${outcome.channel}${deduped ? " (idempotent — already sent)" : ""}.`, provider: "slack", action: "send_message", idempotencyKey: `${ctx.executionId}:slack:send_message:${topCandidate.company}`, attempts, output: outcome })
    return { state, outcome }
  } catch (err) {
    if (err instanceof ApprovalRequiredError) {
      throw new ApprovalRequiredError(err.toolId, err.toolName, err.actionLabel, err.permission, err.actionId, err.input, state, "slack_notify")
    }
    throw err
  }
}

/* ---- final structured payload + summary ---- */
function buildResult(
  objective: PipelineObjective,
  candidates: ResearchCandidate[],
  qualifications: QualificationResult[],
  scores: LlmScoreResult[],
  decision: Decision | null,
  topCandidate: ResearchCandidate | null,
  topScore: LlmScoreResult | null,
  salesforceOutcome: MarketingLeadOpsPayload["salesforceAction"],
  slackOutcome: MarketingLeadOpsPayload["slackNotification"],
  llmMeta: { model?: string; inputTokens?: number; outputTokens?: number; provider?: string; executionMode?: "development" },
): SkillExecutionResult {
  const payload: MarketingLeadOpsPayload = {
    objective,
    candidatesFound: candidates.length,
    research: candidates,
    qualifications,
    scores,
    decision,
    topCandidate: topCandidate ? { ...topCandidate, qualification: qualifications.find((q) => q.candidateId === topCandidate.id), score: topScore ?? undefined } : null,
    salesforceAction: salesforceOutcome,
    slackNotification: slackOutcome,
  }
  const lines: string[] = [`Objective: "${objective.objective}"`, `${candidates.length} candidate(s) researched.`]
  if (decision && topCandidate) lines.push(`Top candidate: ${topCandidate.company} — score ${topScore?.leadScore ?? "—"}/100, ${decision.tier.replace("_", " ").toUpperCase()}.`)
  if (salesforceOutcome) lines.push(`Salesforce: ${salesforceOutcome.status}${salesforceOutcome.detail ? ` — ${salesforceOutcome.detail}` : ""}.`)
  if (slackOutcome) lines.push(`Slack: ${slackOutcome.status}${slackOutcome.detail ? ` — ${slackOutcome.detail}` : ""}.`)

  // Section 9 — partial failure: at least one real external action
  // completed AND at least one other real, ATTEMPTED action failed
  // (never counting "skipped"/"blocked" — those were never attempted,
  // so their absence doesn't make an otherwise-successful run
  // "partial"). The canonical case: Salesforce completed, Slack failed.
  const anyCompleted = salesforceOutcome?.status === "completed" || slackOutcome?.status === "completed"
  const anyFailed = salesforceOutcome?.status === "failed" || slackOutcome?.status === "failed"
  const partial = anyCompleted && anyFailed

  return {
    structured: payload,
    summary: lines.join("\n"),
    sources: candidates.map((c) => ({ title: c.company, url: c.source, provider: "web_search", snippet: c.evidence })),
    model: llmMeta.model,
    inputTokens: llmMeta.inputTokens,
    outputTokens: llmMeta.outputTokens,
    provider: llmMeta.provider,
    executionMode: llmMeta.executionMode,
    partial,
  }
}

/** Shared continuation logic for both resume() (an approved action)
 * and retryStage() (a failed action being retried) — reconstructs
 * research/qualification/score/decision from the given PipelineState
 * (never re-derived, never re-run) and proceeds from `fromKey` through
 * the rest of the real pipeline. */
async function continuePipelineFrom(ctx: SkillExecutionContext, state: PipelineState, fromKey: PipelineStageKey, opts: { preApproved: boolean }): Promise<SkillExecutionResult> {
  const objective = state.objective
  const toolCtx: ToolContext = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit, integrations: ctx.worker.integrations }

  const stageOutput = <T,>(key: PipelineStageKey): T | undefined => state.stages.find((s) => s.key === key)?.output as T | undefined
  const candidates = stageOutput<ResearchCandidate[]>("research") ?? []
  const qualifications = stageOutput<QualificationResult[]>("qualification") ?? []
  const scores = stageOutput<LlmScoreResult[]>("llm_scoring") ?? []
  const decision = stageOutput<Decision>("decision") ?? null
  const topScore = decision ? (scores.find((s) => s.id === decision.candidateId) ?? null) : null
  const topCandidate = topScore ? (candidates.find((c) => c.id === topScore.id) ?? null) : null

  let salesforceOutcome: MarketingLeadOpsPayload["salesforceAction"] = stageOutput("salesforce_action") ?? null
  let slackOutcome: MarketingLeadOpsPayload["slackNotification"] = stageOutput("slack_notify") ?? null

  if (fromKey === "salesforce_action") {
    const sf = await runSalesforceStage(ctx, toolCtx, topCandidate, topScore, decision, state, opts)
    state = sf.state
    salesforceOutcome = sf.outcome
    const slack = await runSlackStage(ctx, toolCtx, topCandidate, topScore, decision, salesforceOutcome, state, { preApproved: false })
    state = slack.state
    slackOutcome = slack.outcome
  } else if (fromKey === "slack_notify") {
    const slack = await runSlackStage(ctx, toolCtx, topCandidate, topScore, decision, salesforceOutcome, state, opts)
    state = slack.state
    slackOutcome = slack.outcome
  }

  // No new LLM call happens on resume/retry — nothing new to attribute cost/tokens to.
  return buildResult(objective, candidates, qualifications, scores, decision, topCandidate, topScore, salesforceOutcome, slackOutcome, {})
}

export const salesforceLeadPipelineSkill: SkillDefinition = {
  id: "skill_salesforce_lead_pipeline",
  name: "Marketing Lead Operations",
  description: "The Marketing Agent's real operational pipeline: research real candidates, qualify them deterministically, score with a schema-validated LLM call, apply a deterministic decision policy, and act on Salesforce/Slack through the real, permission-gated Integration Runtime.",
  category: "sales",
  outputType: "lead_pipeline_sync",
  taskTitle: "Research, qualify, and act on leads",
  inputs: [
    { key: "objective", label: "Business objective", type: "textarea", required: true, placeholder: "Find high-quality enterprise leads in Brazil and identify which ones are most likely to book a meeting." },
    { key: "target", label: "Target (optional)", type: "text", required: false, placeholder: "Brazil, enterprise segment" },
    { key: "criteria", label: "Criteria (comma-separated, optional)", type: "text", required: false, placeholder: "high likelihood to book a meeting, enterprise scale" },
    { key: "constraints", label: "Constraints (comma-separated, optional)", type: "text", required: false, placeholder: "exclude existing customers" },
    { key: "requestedActions", label: "Requested actions (comma-separated, optional)", type: "text", required: false, placeholder: "update_lead, notify_slack" },
  ],
  requiredTools: ["connector_salesforce.actions", "tool_web_search", "tool_llm"],
  instructions: SYSTEM_PROMPT,
  constraints: ["Never fabricate a research candidate, a Salesforce record, or a Slack delivery.", "Only the deterministic decision engine may authorize a real external write.", "update_lead/create_lead and send_message are real high-risk actions and may require human approval."],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const objective = parseObjective(ctx.input)
    if (!objective.objective) throw new Error("A business objective is required.")
    const toolCtx: ToolContext = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit, integrations: ctx.worker.integrations }

    let state = step(ctx, { objective, stages: STAGE_ORDER.map(({ key, label }) => ({ key, label, status: "queued" as const })) }, "stage_started", { stage: "objective_intake" as PipelineStageKey, label: "Objective intake", objective })
    state = step(ctx, state, "stage_completed", { stage: "objective_intake" as PipelineStageKey, label: "Objective intake", detail: objective.target ? `Target: ${objective.target}` : "No explicit target given.", output: objective })

    const research = await runResearchStage(ctx, toolCtx, objective, state)
    state = research.state
    const qualification = runQualificationStage(ctx, objective, research.candidates, state)
    state = qualification.state
    const scoring = await runLlmScoringStage(ctx, toolCtx, objective, research.candidates, qualification.qualifications, state)
    state = scoring.state
    const decisionResult = runDecisionStage(ctx, objective, scoring.scores, state)
    state = decisionResult.state

    const topCandidate = decisionResult.topScore ? (research.candidates.find((c) => c.id === decisionResult.topScore!.id) ?? null) : null

    const sf = await runSalesforceStage(ctx, toolCtx, topCandidate, decisionResult.topScore, decisionResult.decision, state, { preApproved: false })
    state = sf.state
    const slack = await runSlackStage(ctx, toolCtx, topCandidate, decisionResult.topScore, decisionResult.decision, sf.outcome, state, { preApproved: false })

    return buildResult(objective, research.candidates, qualification.qualifications, scoring.scores, decisionResult.decision, topCandidate, decisionResult.topScore, sf.outcome, slack.outcome, scoring)
  },

  resume: async (ctx, resumeStateRaw): Promise<SkillExecutionResult> => {
    const state = resumeStateRaw as PipelineState
    const pendingKey = state.stages.find((s) => s.status === "waiting_for_approval")?.key
    if (!pendingKey) throw new Error("This execution has no pending approval to resume from.")
    return continuePipelineFrom(ctx, state, pendingKey, { preApproved: true })
  },

  /** Section 19: "retry failed step" — re-runs exactly one FAILED
   * external-action stage (Salesforce or Slack), using this
   * execution's own already-completed prior stages, never replaying a
   * real external action that already succeeded. Normal permission
   * gating applies (this was never approved — it failed) — a repeat
   * ApprovalRequiredError just re-enters the ordinary approval gate.
   * Called by POST /api/executions/[id]/retry-step. */
  retryStage: async (ctx, resumeStateRaw, stage): Promise<SkillExecutionResult> => {
    const state = resumeStateRaw as PipelineState
    const target = state.stages.find((s) => s.key === stage)
    if (!target || target.status !== "failed") throw new Error(`Stage "${stage}" is not in a failed state — nothing to retry.`)
    if (stage !== "salesforce_action" && stage !== "slack_notify") throw new Error(`Stage "${stage}" does not support retry.`)
    return continuePipelineFrom(ctx, state, stage, { preApproved: false })
  },

  evaluate: (result): SkillEvaluation => {
    const payload = result.structured as MarketingLeadOpsPayload
    const researchScore = payload.candidatesFound > 0 ? 100 : 0
    const decisionScore = payload.decision ? 100 : 0
    const actionScore = payload.salesforceAction?.status === "completed" ? 100 : payload.salesforceAction?.status === "waiting_for_approval" ? 60 : payload.salesforceAction ? 20 : payload.decision?.action === "no_action" ? 100 : 0
    const overall = Math.round(researchScore * 0.3 + decisionScore * 0.3 + actionScore * 0.4)
    return {
      qualityScore: overall,
      breakdown: [
        { label: "Research", score: researchScore, note: `${payload.candidatesFound} real candidates researched` },
        { label: "Decision reached", score: decisionScore, note: payload.decision ? payload.decision.reason : "No candidates to decide on" },
        { label: "CRM action", score: actionScore, note: payload.salesforceAction ? `${payload.salesforceAction.status}${payload.salesforceAction.detail ? ` — ${payload.salesforceAction.detail}` : ""}` : "No CRM action attempted" },
      ],
    }
  },

  metrics: (result, evaluation) => {
    const payload = result.structured as MarketingLeadOpsPayload
    const emissions: MetricEmission[] = [
      { key: "leads_researched", kind: "operational", value: payload.candidatesFound },
      { key: "pipeline_sync_quality", kind: "quality", value: evaluation.qualityScore, unit: "%" },
    ]
    if (payload.salesforceAction?.status === "completed") emissions.push({ key: "leads_updated", kind: "business", value: 1 })
    return emissions
  },
}
