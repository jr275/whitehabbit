import "server-only"

/* ================================================================== *
 * LLM TOOL — a real call to the Anthropic Messages API.
 *
 * No ANTHROPIC_API_KEY -> the tool reports NOT CONNECTED / blocked. It
 * never fabricates a completion. api.anthropic.com is reachable from
 * this environment's egress policy; only the credential is missing
 * until the operator supplies one.
 * ================================================================== */

import { llmCostUsd } from "@/lib/agent/cost"
import type { ToolActionResult, ToolDefinition } from "@/lib/agent/types"

const API_URL = (process.env.ANTHROPIC_BASE_URL_PUBLIC || "https://api.anthropic.com").replace(/\/$/, "") + "/v1/messages"
const MODEL = process.env.LLM_MODEL || "claude-sonnet-5"

export interface LlmCallInput {
  system: string
  prompt: string
  maxTokens?: number
}

export interface LlmCallOutput {
  text: string
  model: string
  inputTokens: number
  outputTokens: number
}

export function isLlmConnected(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export const NOT_CONFIGURED_REASON = "Configure ANTHROPIC_API_KEY to run this worker."

export async function callLlm(input: LlmCallInput): Promise<ToolActionResult<LlmCallOutput>> {
  const started = Date.now()
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return {
      ok: false,
      blocked: true,
      blockedReason: NOT_CONFIGURED_REASON,
      durationMs: Date.now() - started,
    }
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: input.maxTokens ?? 2000,
        system: input.system,
        messages: [{ role: "user", content: input.prompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      // 401/403 with a key present means the provider rejected the
      // credential itself — distinct from a 5xx/other provider fault.
      const invalidCredential = res.status === 401 || res.status === 403
      return {
        ok: false,
        errorCode: invalidCredential ? "invalid_credential" : "provider_error",
        error: invalidCredential
          ? `Anthropic rejected the configured API key (${res.status}).`
          : `Anthropic API returned ${res.status}: ${body.slice(0, 300)}`,
        durationMs: Date.now() - started,
      }
    }

    const json = (await res.json()) as {
      content: { type: string; text?: string }[]
      model: string
      usage: { input_tokens: number; output_tokens: number }
    }
    const text = json.content.find((c) => c.type === "text")?.text ?? ""
    const inputTokens = json.usage?.input_tokens ?? 0
    const outputTokens = json.usage?.output_tokens ?? 0

    return {
      ok: true,
      data: { text, model: json.model ?? MODEL, inputTokens, outputTokens },
      durationMs: Date.now() - started,
      costUsd: llmCostUsd(inputTokens, outputTokens),
    }
  } catch (err) {
    return {
      ok: false,
      errorCode: "provider_error",
      error: err instanceof Error ? err.message : "LLM request failed",
      durationMs: Date.now() - started,
    }
  }
}

export const llmTool: ToolDefinition = {
  id: "tool_llm",
  name: "LLM",
  provider: "Anthropic",
  description: "Reasons over collected information to analyze, rank and explain.",
  isConnected: isLlmConnected,
  notConnectedReason: NOT_CONFIGURED_REASON,
  actions: [
    {
      id: "analyze",
      label: "Analyze",
      permission: "read",
      riskLevel: "low",
      run: async (input: LlmCallInput) => callLlm(input),
    },
  ],
}
