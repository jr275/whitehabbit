import "server-only"

/* ================================================================== *
 * OPENAI PROVIDER — a real call to the OpenAI Chat Completions API.
 *
 * Same shape and honesty guarantees as anthropic.ts/gemini.ts: real
 * fetch, real error classification, real token usage from the API's
 * own response, real cost via lib/agent/cost.ts (unconfigured until an
 * explicit OPENAI_INPUT_COST_PER_MTOK/OPENAI_OUTPUT_COST_PER_MTOK rate
 * is set — no guessed price). OPENAI_MODEL has no built-in default,
 * same reasoning as Gemini: no model id here is confirmed current for
 * this deployment, so one is never assumed.
 * ================================================================== */

import { llmCostUsd } from "@/lib/agent/cost"
import type { ToolActionResult } from "@/lib/agent/types"
import type { LlmCallInput, LlmCallOutput, LlmProvider } from "./types"

const PROVIDER_ID = "openai"
const API_URL = (process.env.OPENAI_BASE_URL_PUBLIC || "https://api.openai.com").replace(/\/$/, "") + "/v1/chat/completions"

function model(): string | undefined {
  return process.env.OPENAI_MODEL || undefined
}

function isConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY && !!model()
}

function notConfiguredReason(): string {
  if (!process.env.OPENAI_API_KEY) return "Configure OPENAI_API_KEY to run this worker."
  return "Configure OPENAI_MODEL (a currently supported model id) to run this worker."
}

async function call(input: LlmCallInput): Promise<ToolActionResult<LlmCallOutput>> {
  const started = Date.now()
  const key = process.env.OPENAI_API_KEY
  const modelId = model()
  if (!key || !modelId) {
    return { ok: false, blocked: true, blockedReason: notConfiguredReason(), durationMs: Date.now() - started }
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: input.maxTokens ?? 2000,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string; type?: string; code?: string } } | null
      const rawMessage = body?.error?.message ?? `HTTP ${res.status}`
      // 401 = bad key; 403 with code "invalid_api_key"/"insufficient_quota"
      // is also a credential-level failure, not a transient provider fault.
      const invalidCredential = res.status === 401 || body?.error?.code === "invalid_api_key"
      return {
        ok: false,
        errorCode: invalidCredential ? "invalid_credential" : "provider_error",
        error: invalidCredential ? `OpenAI rejected the configured API key (${res.status}).` : `OpenAI API returned ${res.status}: ${rawMessage.slice(0, 300)}`,
        durationMs: Date.now() - started,
      }
    }

    const json = (await res.json()) as {
      model: string
      choices: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const text = json.choices?.[0]?.message?.content ?? ""
    const inputTokens = json.usage?.prompt_tokens ?? 0
    const outputTokens = json.usage?.completion_tokens ?? 0
    const cost = llmCostUsd(PROVIDER_ID, inputTokens, outputTokens)

    return {
      ok: true,
      data: { text, model: json.model ?? modelId, inputTokens, outputTokens, provider: PROVIDER_ID },
      durationMs: Date.now() - started,
      costUsd: cost.costUsd ?? undefined,
    }
  } catch (err) {
    return {
      ok: false,
      errorCode: "provider_error",
      error: err instanceof Error ? err.message : "OpenAI request failed",
      durationMs: Date.now() - started,
    }
  }
}

export const openaiProvider: LlmProvider = {
  id: PROVIDER_ID,
  displayName: "OpenAI",
  isConfigured,
  notConfiguredReason,
  call,
}
