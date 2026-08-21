import "server-only"

/* ================================================================== *
 * ANTHROPIC PROVIDER — a real call to the Anthropic Messages API.
 *
 * This is the exact logic that used to live directly in llm.ts, moved
 * here verbatim (no behavior change) so it can sit behind the shared
 * LlmProvider interface alongside other providers.
 * ================================================================== */

import { llmCostUsd } from "@/lib/agent/cost"
import type { ToolActionResult } from "@/lib/agent/types"
import type { LlmCallInput, LlmCallOutput, LlmProvider } from "./types"

const PROVIDER_ID = "anthropic"
const API_URL = (process.env.ANTHROPIC_BASE_URL_PUBLIC || "https://api.anthropic.com").replace(/\/$/, "") + "/v1/messages"
// "claude-sonnet-5" is confirmed current for this deployment (see the
// model roster this session was configured with) — a default other
// providers deliberately do not get, since nothing here can confirm
// their model ids are still current.
const MODEL = process.env.LLM_MODEL || "claude-sonnet-5"

function isConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

function notConfiguredReason(): string {
  return "Configure ANTHROPIC_API_KEY to run this worker."
}

async function call(input: LlmCallInput): Promise<ToolActionResult<LlmCallOutput>> {
  const started = Date.now()
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return { ok: false, blocked: true, blockedReason: notConfiguredReason(), durationMs: Date.now() - started }
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
    const cost = llmCostUsd(PROVIDER_ID, inputTokens, outputTokens)

    return {
      ok: true,
      data: { text, model: json.model ?? MODEL, inputTokens, outputTokens, provider: PROVIDER_ID },
      durationMs: Date.now() - started,
      costUsd: cost.costUsd ?? undefined,
    }
  } catch (err) {
    return {
      ok: false,
      errorCode: "provider_error",
      error: err instanceof Error ? err.message : "Anthropic request failed",
      durationMs: Date.now() - started,
    }
  }
}

export const anthropicProvider: LlmProvider = {
  id: PROVIDER_ID,
  displayName: "Anthropic",
  isConfigured,
  notConfiguredReason,
  call,
}
