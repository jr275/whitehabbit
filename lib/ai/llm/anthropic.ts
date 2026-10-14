import "server-only"

/* ================================================================== *
 * ANTHROPIC PROVIDER — a real call to the Messages API.
 *
 * Moved here from lib/agent/tools/llm-providers/ so both products can
 * reach it. The request, the error classification and the timeout are
 * unchanged; what left is the cost lookup, which depended on
 * lib/agent/cost and would have dragged Workforce into the shared
 * module. Token counts still come back on the output, so the caller
 * that cares about money can price them with whatever rates it owns.
 * ================================================================== */

import type { LlmCallDeps, LlmCallInput, LlmProvider, LlmResult } from "./types"

const PROVIDER_ID = "anthropic"

function apiUrl(): string {
  return (process.env.ANTHROPIC_BASE_URL_PUBLIC || "https://api.anthropic.com").replace(/\/$/, "") + "/v1/messages"
}

/** Read at call time, not at module load: a build-time constant would
 *  be frozen into the bundle and a deployment could not change the
 *  model without a rebuild. */
function model(): string {
  return process.env.LLM_MODEL || "claude-sonnet-5"
}

function isConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

function notConfiguredReason(): string {
  return "Configure ANTHROPIC_API_KEY for this deployment."
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[]
  model?: string
  usage?: { input_tokens?: number; output_tokens?: number }
}

/* Combines the caller's cancellation with the provider's own timeout
 * so BOTH remain in force: a caller that cancels stops the request,
 * and a caller that never cancels still cannot hang past the timeout.
 * AbortSignal.any is Node 20.3+; this repo runs 22 (package.json
 * engines: >=22.5.0). */
function requestSignal(deps: { signal?: AbortSignal }, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return deps.signal ? AbortSignal.any([timeout, deps.signal]) : timeout
}

async function call(input: LlmCallInput, deps: LlmCallDeps = {}): Promise<LlmResult> {
  const started = Date.now()
  const fetchImpl = deps.fetchImpl ?? fetch
  const key = process.env.ANTHROPIC_API_KEY
  const modelId = model()
  if (!key) {
    return { ok: false, reason: "not_configured", message: notConfiguredReason(), durationMs: Date.now() - started }
  }

  try {
    const res = await fetchImpl(apiUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: input.maxTokens ?? 2000,
        system: input.system,
        messages: [{ role: "user", content: input.prompt }],
      }),
      signal: requestSignal(deps, 60_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      // A 401/403 with a key present means the credential itself was
      // rejected — a different thing to tell an operator than a 5xx.
      const invalidCredential = res.status === 401 || res.status === 403
      return {
        ok: false,
        reason: invalidCredential ? "invalid_credential" : "provider_error",
        message: invalidCredential
          ? `Anthropic rejected the configured API key (${res.status}).`
          : `Anthropic API returned ${res.status}: ${body.slice(0, 300)}`,
        durationMs: Date.now() - started,
      }
    }

    const json = (await res.json().catch(() => null)) as AnthropicResponse | null
    const text = json?.content?.find((c) => c.type === "text")?.text ?? ""
    // A 200 carrying no text is a provider fault, not an empty answer.
    // Returning "" as success would let a caller present silence as a
    // grounded response.
    if (!text) {
      return {
        ok: false,
        reason: "provider_error",
        message: "Anthropic returned a response with no text content.",
        durationMs: Date.now() - started,
      }
    }

    return {
      ok: true,
      output: {
        text,
        model: json?.model ?? modelId,
        inputTokens: json?.usage?.input_tokens ?? 0,
        outputTokens: json?.usage?.output_tokens ?? 0,
        provider: PROVIDER_ID,
      },
      durationMs: Date.now() - started,
    }
  } catch (err) {
    /* A caller's cancellation is not a provider fault. Distinguished
     * by asking the caller's own signal rather than by matching the
     * error's name: the provider's timeout also aborts the request,
     * and that one IS a provider failure. */
    if (deps.signal?.aborted) {
      return {
        ok: false,
        reason: "aborted",
        message: "The request was cancelled before the provider replied.",
        durationMs: Date.now() - started,
      }
    }
    return {
      ok: false,
      reason: "provider_error",
      message: err instanceof Error ? err.message : "Anthropic request failed",
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
