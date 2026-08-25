import "server-only"

/* ================================================================== *
 * LOCAL PROVIDER — a real call to a self-hosted, Ollama-compatible
 * inference server.
 *
 * This is NOT the development fixture (development.ts) — it makes a
 * real network call to a real (if self-hosted) model server and
 * returns that server's real token usage. It exists so an operator who
 * runs their own model (Ollama, vLLM, LM Studio, any OpenAI-compatible
 * local server) can select LLM_PROVIDER=local instead of a cloud
 * credential — the same real WorkerExecution/cost/observability path,
 * just pointed at a different real endpoint. No API key is required by
 * design (a local server is usually unauthenticated); cost defaults to
 * $0 for local, actually-free inference rather than "unavailable" —
 * unlike the cloud providers, this is a real, not a missing, number.
 * ================================================================== */

import type { ToolActionResult } from "@/lib/agent/types"
import type { LlmCallInput, LlmCallOutput, LlmProvider } from "./types"

const PROVIDER_ID = "local"

function baseUrl(): string | undefined {
  return process.env.LOCAL_LLM_BASE_URL || undefined
}

function model(): string | undefined {
  return process.env.LOCAL_LLM_MODEL || undefined
}

function isConfigured(): boolean {
  return !!baseUrl() && !!model()
}

function notConfiguredReason(): string {
  if (!baseUrl()) return "Configure LOCAL_LLM_BASE_URL (e.g. http://localhost:11434) to run this worker."
  return "Configure LOCAL_LLM_MODEL (a model already pulled on your local server) to run this worker."
}

async function call(input: LlmCallInput): Promise<ToolActionResult<LlmCallOutput>> {
  const started = Date.now()
  const url = baseUrl()
  const modelId = model()
  if (!url || !modelId) {
    return { ok: false, blocked: true, blockedReason: notConfiguredReason(), durationMs: Date.now() - started }
  }

  try {
    // Ollama's /api/chat contract — the most common self-hosted target.
    const res = await fetch(`${url.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        stream: false,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        options: { num_predict: input.maxTokens ?? 2000 },
      }),
      signal: AbortSignal.timeout(120_000), // local inference can be slower than a cloud API
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return { ok: false, errorCode: "provider_error", error: `Local model server returned ${res.status}: ${body.slice(0, 300)}`, durationMs: Date.now() - started }
    }

    const json = (await res.json()) as {
      model?: string
      message?: { content?: string }
      prompt_eval_count?: number
      eval_count?: number
    }
    const text = json.message?.content ?? ""
    const inputTokens = json.prompt_eval_count ?? 0
    const outputTokens = json.eval_count ?? 0

    return {
      ok: true,
      data: { text, model: json.model ?? modelId, inputTokens, outputTokens, provider: PROVIDER_ID },
      durationMs: Date.now() - started,
      // Genuinely free, self-hosted inference — a real $0, not a
      // fabricated one (contrast lib/agent/cost.ts's null for a cloud
      // provider with no configured rate).
      costUsd: 0,
    }
  } catch (err) {
    return {
      ok: false,
      errorCode: "provider_error",
      error: err instanceof Error ? `Could not reach the local model server: ${err.message}` : "Local model request failed",
      durationMs: Date.now() - started,
    }
  }
}

export const localProvider: LlmProvider = {
  id: PROVIDER_ID,
  displayName: "Local",
  isConfigured,
  notConfiguredReason,
  call,
}
