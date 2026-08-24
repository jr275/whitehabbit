import "server-only"

/* ================================================================== *
 * SKILL: CUSTOMER CONVERSATION — real, end-to-end, Discover's core
 * capability.
 *
 *   Real LLM call, grounded in this Worker's real Domain Profile
 *   (business/audience/rules) and real heuristics -> a real response
 *   + a real, structured decision (answered / escalated / flagged).
 *
 * Deliberately does NOT call any tool beyond the LLM — there is no
 * connected CRM, ticketing system, or messaging platform behind this
 * (see the Discover product's notYetConnected list), so "taking
 * actions" here means a real, honest DECISION the worker makes about
 * how to handle the request, never a fabricated external side effect.
 * No chain-of-thought is ever surfaced: the model is asked for a
 * short, safe summary of what it did, in the same register as
 * "Applied the qualification policy" — never raw reasoning.
 * ================================================================== */

import { retrieveRelevantKnowledge } from "@/lib/agent/knowledge"
import { runToolAction } from "@/lib/agent/tool-runner"
import type { SkillDefinition, SkillEvaluation, SkillExecutionResult, WorkerContext } from "@/lib/agent/types"
import { InvalidCredentialError, ProviderError, SkillBlockedError } from "@/lib/agent/types"

type ConversationAction = "answered" | "escalated" | "flagged_for_review"
const VALID_ACTIONS: ConversationAction[] = ["answered", "escalated", "flagged_for_review"]

interface ConversationResult {
  response: string
  action: ConversationAction
  confidence: number
  reasoning_summary: string
}

const SYSTEM_PROMPT = `You are a customer operations worker handling a real customer request. You are given the organization's real Domain Profile and rules — use them; never invent facts about the business that aren't given to you.

Respond with ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{"response": string (the real reply you would send the customer), "action": "answered" | "escalated" | "flagged_for_review" (choose "escalated" if this needs a human to actually resolve it, "flagged_for_review" if a rule says to flag it, "answered" otherwise), "confidence": number (0-100), "reasoning_summary": string (ONE short, safe sentence describing what you did, e.g. "Answered using the refund policy in the Domain Profile" — never your internal reasoning steps, never chain-of-thought)}

If a rule says a topic must be escalated or flagged rather than answered directly, follow it even if you could technically answer.`

function buildSystemPrompt(worker: WorkerContext): string {
  const extra: string[] = []
  if (worker.mission.trim()) extra.push(`This worker's business, in its own words: "${worker.mission.trim()}"`)
  if (worker.behaviors.length) {
    extra.push(`It must follow these operator-defined rules:\n${worker.behaviors.map((b) => `- IF ${b.condition} THEN ${b.action}`).join("\n")}`)
  }
  return extra.length ? `${SYSTEM_PROMPT}\n\n${extra.join("\n\n")}` : SYSTEM_PROMPT
}

function buildPrompt(message: string, knowledge: { name: string; snippet: string }[]): string {
  const knowledgeBlock = knowledge.length
    ? `\n\nReal Domain Profile (this organization's actual business/audience/rules):\n${knowledge.map((k) => `[${k.name}] ${k.snippet}`).join("\n\n")}`
    : "\n\n(No Domain Profile is configured yet for this worker.)"
  return `Customer request: "${message}"${knowledgeBlock}\n\nRespond to this customer request.`
}

function parseConversation(text: string): ConversationResult | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed || typeof parsed.response !== "string" || !VALID_ACTIONS.includes(parsed.action)) return null
    return {
      response: parsed.response,
      action: parsed.action,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 50,
      reasoning_summary: typeof parsed.reasoning_summary === "string" ? parsed.reasoning_summary.slice(0, 200) : "",
    }
  } catch {
    return null
  }
}

export const customerConversationSkill: SkillDefinition = {
  id: "skill_customer_conversation",
  name: "Customer Conversation",
  description: "Responds to a real customer request using an LLM grounded in this worker's real Domain Profile and rules, and records a real, honest handling decision.",
  category: "communication",
  outputType: "conversation_response",
  taskTitle: "Handle a customer request",
  inputs: [{ key: "query", label: "What is the customer asking or saying?", type: "textarea", required: true, placeholder: "Hi, I need to change my reservation to next weekend instead — is that possible?" }],
  requiredTools: ["tool_llm"],
  instructions: SYSTEM_PROMPT,
  constraints: ["Never claim an external system (CRM, booking system) was actually updated — none is connected.", "Follow an operator-defined escalation/flagging rule even when a direct answer is possible.", "Never surface raw reasoning — only a short, safe summary of what was done."],

  execute: async (ctx): Promise<SkillExecutionResult> => {
    const message = ctx.input.query?.trim()
    if (!message) throw new Error("No customer request was provided.")
    const toolCtx = { workerId: ctx.workerId, executionId: ctx.executionId, emit: ctx.emit }

    const llm = ctx.tools.get("tool_llm")
    if (!llm) throw new SkillBlockedError("LLM tool is not registered on this worker.")
    ctx.emit("reasoning_started", { model: "llm" })
    const analyzeAction = llm.actions.find((a) => a.id === "analyze")!
    const knowledge = retrieveRelevantKnowledge(ctx.worker.knowledge, message)
    const llmResult = await runToolAction<{ text: string; model: string; inputTokens: number; outputTokens: number; provider: string; executionMode?: "development" }>(
      llm.id,
      llm.name,
      analyzeAction,
      { system: buildSystemPrompt(ctx.worker), prompt: buildPrompt(message, knowledge), maxTokens: 800 },
      toolCtx,
    )
    if (!llmResult.ok) {
      if (llmResult.blocked) throw new SkillBlockedError(llmResult.blockedReason ?? "LLM is blocked.")
      if (llmResult.errorCode === "invalid_credential") throw new InvalidCredentialError(llmResult.error ?? "The configured LLM credential was rejected.")
      throw new ProviderError(llmResult.error ?? "LLM analysis failed.")
    }
    const llmData = llmResult.data as { text: string; model: string; inputTokens: number; outputTokens: number; provider: string; executionMode?: "development" }
    ctx.emit("reasoning_completed", { durationMs: llmResult.durationMs, inputTokens: llmData.inputTokens, outputTokens: llmData.outputTokens, executionMode: llmData.executionMode })

    const parsed = parseConversation(llmData.text)
    if (!parsed) throw new Error("The LLM response was not a valid structured conversation result.")

    // No external tool actually ran — the "action" is the worker's own
    // real, honest decision, never a fabricated CRM/ticketing side
    // effect. Grounding sources (if any) are named, never invented.
    return {
      structured: { message, ...parsed, grounded_in: knowledge.map((k) => k.name) },
      summary: `[${parsed.action.toUpperCase()}] ${parsed.response}`,
      sources: [],
      model: llmData.model,
      inputTokens: llmData.inputTokens,
      outputTokens: llmData.outputTokens,
      provider: llmData.provider,
      executionMode: llmData.executionMode,
    }
  },

  evaluate: (result): SkillEvaluation => {
    const r = result.structured as ConversationResult
    const hasResponse = typeof r.response === "string" && r.response.trim().length > 10
    const responseScore = hasResponse ? 100 : 0
    const validAction = VALID_ACTIONS.includes(r.action)
    const actionScore = validAction ? 100 : 0
    const hasSummary = typeof r.reasoning_summary === "string" && r.reasoning_summary.trim().length > 0
    const summaryScore = hasSummary ? 100 : 0
    const overall = Math.round(responseScore * 0.5 + actionScore * 0.3 + summaryScore * 0.2)
    return {
      qualityScore: overall,
      breakdown: [
        { label: "Real response produced", score: responseScore, note: hasResponse ? "A substantive response was produced" : "No usable response" },
        { label: "Valid handling decision", score: actionScore, note: `action: ${r.action ?? "—"}` },
        { label: "Safe summary present", score: summaryScore, note: hasSummary ? "A short, safe summary was recorded" : "No summary" },
      ],
    }
  },

  metrics: (result, evaluation) => {
    const r = result.structured as ConversationResult
    return [
      { key: "response_length", kind: "operational", value: r.response?.length ?? 0 },
      { key: "escalated", kind: "business", value: r.action === "escalated" ? 1 : 0 },
      { key: "conversation_quality", kind: "quality", value: evaluation.qualityScore, unit: "%" },
    ]
  },
}
