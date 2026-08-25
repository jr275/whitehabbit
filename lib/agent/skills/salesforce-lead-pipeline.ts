import "server-only"

/* ================================================================== *
 * SKILL: SALESFORCE LEAD PIPELINE — the golden flow (section "PHASE
 * 7"): Salesforce.search_leads -> real web research -> real LLM
 * scoring -> Salesforce.update_lead -> Slack.send_message.
 *
 * Every step is a real call through the real Integration Runtime
 * (lib/agent/tools/connector-tools.ts's toolsMapForOrg(), wired into
 * lib/agent/runtime.ts) — this skill never fabricates a Salesforce
 * record, a Slack response, or a successful call. If Salesforce isn't
 * connected, this throws SkillBlockedError("Connect Salesforce...")
 * exactly like every other skill's missing-tool case — the runtime
 * reports NOT_CONFIGURED, never silently substitutes demo data.
 *
 * update_lead and send_message are both real HIGH_RISK_PERMISSIONS
 * actions (write / external_communication) — lib/agent/tool-runner.ts
 * throws ApprovalRequiredError BEFORE either ever runs, unless this
 * Worker's Studio Integrations config explicitly set that exact
 * action to "allow". There is no durable workflow engine here to
 * resume a suspended execution — a run that hits an approval gate
 * genuinely stops there; Slack notification is only reached in the
 * SAME run if update_lead was pre-approved (permission "allow"), or
 * in a later run after update_lead's own approval has run for real
 * via POST /api/approvals/[id]/decide. That is the honest, correct
 * behavior for a human-in-the-loop gate, not a limitation to hide.
 * ================================================================== */

import { retrieveRelevantKnowledge } from "@/lib/agent/knowledge"
import { runToolAction } from "@/lib/agent/tool-runner"
import type { SkillDefinition, SkillEvaluation, SkillExecutionResult, WorkerContext } from "@/lib/agent/types"
import { InvalidCredentialError, ProviderError, SkillBlockedError } from "@/lib/agent/types"

interface ScoredLead {
  id: string
  name: string
  company: string
  previousScore?: number
  score: number
  reasoning: string
  updated: boolean
  notified: boolean
}

interface LeadPipelinePayload {
  query: string
  candidatesFound: number
  leads: ScoredLead[]
}

const SYSTEM_PROMPT = `You are a B2B sales analyst scoring real Salesforce leads against real research. You are given real Salesforce Lead records and real web search results about them. Score each lead 0-100 on likelihood to convert, using only the real evidence given — never invent a fact about a company that isn't supported by the sources.

Respond with ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{"scores":[{"id": string (the real Salesforce Lead id), "score": number (0-100), "reasoning": string (1-2 sentences, cite what supports the score)}]}`

function buildSystemPrompt(worker: WorkerContext): string {
  const extra: string[] = []
  if (worker.mission.trim()) extra.push(`The worker executing this task has this mission: "${worker.mission.trim()}"`)
  if (worker.behaviors.length) extra.push(`It must follow these operator-defined behavior rules:\n${worker.behaviors.map((b) => `- IF ${b.condition} THEN ${b.action}`).join("\n")}`)
  return extra.length ? `${SYSTEM_PROMPT}\n\n${extra.join("\n\n")}` : SYSTEM_PROMPT
}

function parseScores(text: string): { id: string; score: number; reasoning: string }[] | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed.scores) ? parsed.scores : null
  } catch {
    return null
  }
}

export const salesforceLeadPipelineSkill: SkillDefinition = {
  id: "skill_salesforce_lead_pipeline",
  name: "Salesforce Lead Pipeline",
  description: "Searches real Salesforce leads, researches each one, scores them with a real LLM, and updates the real Salesforce record — the full Salesforce -> Research -> LLM -> Salesforce -> Slack golden flow.",
  category: "sales",
  outputType: "lead_pipeline_sync",
  taskTitle: "Sync and score Salesforce leads",
  inputs: [{ key: "query", label: "Which Salesforce leads should it work on?", type: "text", required: true, placeholder: "Recently created leads in the software industry" }],
  requiredTools: ["connector_salesforce.actions", "tool_web_search", "tool_llm"],
  instructions: SYSTEM_PROMPT,
  constraints: ["Never fabricate a Salesforce record.", "Never update a lead without a real, cited score.", "update_lead and send_message are real high-risk actions and may require human approval."],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const query = ctx.input.query?.trim() || "open leads"
    const toolCtx = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit, integrations: ctx.worker.integrations }

    const salesforce = ctx.tools.get("connector_salesforce.actions")
    if (!salesforce) throw new SkillBlockedError("Connect Salesforce to run this skill.")

    ctx.emit("tool_called", { tool: salesforce.id, toolName: salesforce.name, action: "search_leads", input: { query } })
    const searchLeadsAction = salesforce.actions.find((a) => a.id === "search_leads")!
    const leadsResult = await runToolAction<{ records: { Id: string; Name: string; Company: string; Rating?: string }[] }>(salesforce.id, salesforce.name, searchLeadsAction, { query }, toolCtx)
    if (!leadsResult.ok) {
      if (leadsResult.blocked) throw new SkillBlockedError(leadsResult.blockedReason ?? "Salesforce is blocked.")
      throw new ProviderError(leadsResult.error ?? "Salesforce search_leads failed.")
    }
    ctx.emit("tool_completed", { tool: salesforce.id, action: "search_leads", resultCount: leadsResult.data!.records.length })
    const leads = leadsResult.data!.records
    if (leads.length === 0) throw new Error(`No real Salesforce leads matched "${query}".`)

    const search = ctx.tools.get("tool_web_search")
    if (!search) throw new SkillBlockedError("Web Search tool is not registered on this worker.")
    const researchQuery = leads.map((l) => l.Company).join(" OR ")
    ctx.emit("tool_called", { tool: search.id, toolName: search.name, action: "search", input: { query: researchQuery } })
    const searchAction = search.actions.find((a) => a.id === "search")!
    const searchResult = await runToolAction<{ results: { title: string; url: string; provider: string; snippet?: string }[] }>(search.id, search.name, searchAction, { query: researchQuery, limit: 10 }, toolCtx)
    if (!searchResult.ok) {
      if (searchResult.blocked) throw new SkillBlockedError(searchResult.blockedReason ?? "Web Search is blocked.")
      throw new ProviderError(searchResult.error ?? "Web search failed.")
    }
    const sources = searchResult.data!.results
    ctx.emit("tool_completed", { tool: search.id, durationMs: searchResult.durationMs, resultCount: sources.length })

    const llm = ctx.tools.get("tool_llm")
    if (!llm) throw new SkillBlockedError("LLM tool is not registered on this worker.")
    ctx.emit("reasoning_started", { model: "llm" })
    const analyzeAction = llm.actions.find((a) => a.id === "analyze")!
    const knowledge = retrieveRelevantKnowledge(ctx.worker.knowledge, query)
    const leadsBlock = leads.map((l) => `[${l.Id}] ${l.Name} — ${l.Company}${l.Rating ? ` (current rating: ${l.Rating})` : ""}`).join("\n")
    const sourcesBlock = sources.map((s, i) => `[${i}] ${s.title} — ${s.snippet ?? "(no description)"} (${s.url})`).join("\n")
    const knowledgeBlock = knowledge.length ? `\n\nInternal knowledge:\n${knowledge.map((k) => `[${k.name}] ${k.snippet}`).join("\n\n")}` : ""
    const prompt = `Real Salesforce leads:\n${leadsBlock}\n\nReal research sources:\n${sourcesBlock}${knowledgeBlock}\n\nScore each lead.`
    const llmResult = await runToolAction<{ text: string; model: string; inputTokens: number; outputTokens: number; provider: string; executionMode?: "development" }>(
      llm.id,
      llm.name,
      analyzeAction,
      { system: buildSystemPrompt(ctx.worker), prompt, maxTokens: 2000 },
      toolCtx,
    )
    if (!llmResult.ok) {
      if (llmResult.blocked) throw new SkillBlockedError(llmResult.blockedReason ?? "LLM is blocked.")
      if (llmResult.errorCode === "invalid_credential") throw new InvalidCredentialError(llmResult.error ?? "The configured LLM credential was rejected.")
      throw new ProviderError(llmResult.error ?? "LLM scoring failed.")
    }
    const llmData = llmResult.data!
    ctx.emit("reasoning_completed", { durationMs: llmResult.durationMs, inputTokens: llmData.inputTokens, outputTokens: llmData.outputTokens, executionMode: llmData.executionMode })

    const scores = parseScores(llmData.text)
    if (!scores) throw new Error("The LLM response was not valid structured lead-score data.")

    // update_lead is a real HIGH_RISK_PERMISSIONS action — the first
    // one that isn't explicitly "allow" in this Worker's Integrations
    // config throws ApprovalRequiredError here and the whole skill
    // unwinds; leads scored before that point are lost from THIS run's
    // output (nothing partial is persisted as if it succeeded) — the
    // honest behavior for "the same execution should not create
    // multiple contradictory business results".
    const updateLeadAction = salesforce.actions.find((a) => a.id === "update_lead")!
    const results: ScoredLead[] = []
    for (const lead of leads) {
      const scored = scores.find((s) => s.id === lead.Id)
      if (!scored) continue
      const rating = scored.score >= 70 ? "Hot" : scored.score >= 40 ? "Warm" : "Cold"
      ctx.emit("tool_called", { tool: salesforce.id, toolName: salesforce.name, action: "update_lead", input: { id: lead.Id, fields: { Rating: rating } } })
      const updateResult = await runToolAction(salesforce.id, salesforce.name, updateLeadAction, { id: lead.Id, fields: { Rating: rating } }, toolCtx)
      if (!updateResult.ok) throw new ProviderError(updateResult.error ?? "Salesforce update_lead failed.")
      ctx.emit("tool_completed", { tool: salesforce.id, action: "update_lead" })

      let notified = false
      const slack = ctx.tools.get("connector_slack.actions")
      if (slack) {
        const sendMessageAction = slack.actions.find((a) => a.id === "send_message")!
        const text = `Lead scored: ${lead.Name} (${lead.Company}) — ${scored.score}/100, now rated ${rating}. ${scored.reasoning}`
        ctx.emit("tool_called", { tool: slack.id, toolName: slack.name, action: "send_message", input: { text } })
        const notifyResult = await runToolAction(slack.id, slack.name, sendMessageAction, { channel: "#sales", text }, toolCtx)
        notified = notifyResult.ok
        ctx.emit("tool_completed", { tool: slack.id, action: "send_message", ok: notifyResult.ok })
      }

      results.push({ id: lead.Id, name: lead.Name, company: lead.Company, previousScore: undefined, score: scored.score, reasoning: scored.reasoning, updated: true, notified })
    }

    const payload: LeadPipelinePayload = { query, candidatesFound: leads.length, leads: results }
    const summary =
      results.length === 0
        ? `No leads were updated for "${query}".`
        : results.map((l) => `${l.name} (${l.company}) — score ${l.score}, rating updated${l.notified ? ", Slack notified" : ""}.`).join("\n")

    return {
      structured: payload,
      summary,
      sources,
      model: llmData.model,
      inputTokens: llmData.inputTokens,
      outputTokens: llmData.outputTokens,
      provider: llmData.provider,
      executionMode: llmData.executionMode,
    }
  },

  evaluate: (result): SkillEvaluation => {
    const payload = result.structured as LeadPipelinePayload
    const updateRate = payload.candidatesFound ? (payload.leads.length / payload.candidatesFound) * 100 : 0
    const notifyRate = payload.leads.length ? (payload.leads.filter((l) => l.notified).length / payload.leads.length) * 100 : 0
    const overall = Math.round(updateRate * 0.7 + notifyRate * 0.3)
    return {
      qualityScore: overall,
      breakdown: [
        { label: "Leads updated", score: Math.round(updateRate), note: `${payload.leads.length}/${payload.candidatesFound} real Salesforce leads updated` },
        { label: "Slack notified", score: Math.round(notifyRate), note: `${payload.leads.filter((l) => l.notified).length}/${payload.leads.length} notified` },
      ],
    }
  },

  metrics: (result, evaluation) => {
    const payload = result.structured as LeadPipelinePayload
    return [
      { key: "leads_researched", kind: "operational", value: payload.candidatesFound },
      { key: "leads_updated", kind: "business", value: payload.leads.length },
      { key: "pipeline_sync_quality", kind: "quality", value: evaluation.qualityScore, unit: "%" },
    ]
  },
}
