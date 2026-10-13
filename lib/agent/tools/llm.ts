import "server-only"

/* ================================================================== *
 * LLM TOOL — Workforce's adapter over the shared provider layer.
 *
 * The external contract (isLlmConnected, callLlm, llmTool) is exactly
 * what it has always been; nothing downstream changed. What changed is
 * where the providers live: lib/ai/llm now owns the HTTP calls, because
 * Knowledge needs them too and could not import lib/agent.
 *
 * TWO THINGS DELIBERATELY STAYED HERE, and neither is an oversight:
 *
 *  1. The dev-mode gate. isDevModeAllowed() is still checked BEFORE the
 *     shared resolver sees LLM_PROVIDER, so "development" remains
 *     unreachable by setting LLM_PROVIDER to it, is never a fallback
 *     for a failed real provider, and stays hard-blocked in a real
 *     production deployment whatever LLM_DEV_MODE says.
 *  2. Cost. llmCostUsd lives in lib/agent and prices Workforce's
 *     executions; putting it in the platform module would have pulled
 *     Workforce into Knowledge's bundle through the shared import. The
 *     shared layer returns real token counts and this file prices them.
 * ================================================================== */

import { llmCostUsd } from "@/lib/agent/cost"
import type { ToolActionResult, ToolDefinition } from "@/lib/agent/types"
import {
  activeLlmNotConfiguredReason,
  activeLlmProviderName as sharedProviderName,
  callLlm as sharedCallLlm,
  isLlmConnected as sharedIsConnected,
} from "@/lib/ai/llm"
import { isDevModeAllowed } from "@/lib/runtime-mode"
import { developmentProvider } from "./llm-providers/development"
import type { LlmCallInput, LlmCallOutput } from "./llm-providers/types"

export type { LlmCallInput, LlmCallOutput } from "./llm-providers/types"

/** The one provider the platform layer does not know about, injected
 *  only when dev mode is genuinely allowed. Passing `provider` rather
 *  than an override name is what keeps it unselectable via env. */
function devOverride() {
  return isDevModeAllowed() ? developmentProvider : undefined
}

export function isLlmConnected(): boolean {
  const dev = devOverride()
  if (dev) return dev.isConfigured()
  return sharedIsConnected()
}

export function activeLlmProviderName(): string {
  return devOverride()?.displayName ?? sharedProviderName()
}

function activeNotConfiguredReason(): string {
  const dev = devOverride()
  return dev ? dev.notConfiguredReason() : activeLlmNotConfiguredReason()
}

export async function callLlm(input: LlmCallInput): Promise<ToolActionResult<LlmCallOutput>> {
  const result = await sharedCallLlm(input, { provider: devOverride() })

  if (!result.ok) {
    // not_configured is a deployment problem the operator must fix, so
    // it stays `blocked` — the state the UI already renders with the
    // reason attached. The other two are genuine call failures.
    if (result.reason === "not_configured") {
      return { ok: false, blocked: true, blockedReason: result.message, durationMs: result.durationMs }
    }
    /* "aborted" means a caller cancelled the request, which is an
     * execution outcome rather than a provider fault — and it is not
     * one of ExecutionReasonCode's provider codes. Workforce passes no
     * signal today, so this branch is unreachable from here; it exists
     * so the mapping is explicit instead of a cast. */
    if (result.reason === "aborted") {
      return { ok: false, errorCode: "execution_error", error: result.message, durationMs: result.durationMs }
    }
    return { ok: false, errorCode: result.reason, error: result.message, durationMs: result.durationMs }
  }

  const { output } = result
  // A development fixture cost nothing, and saying so is a fact rather
  // than a missing rate. Every other provider is priced from real token
  // counts, or reported as unavailable — never silently as $0.
  const costUsd =
    output.executionMode === "development"
      ? 0
      : (llmCostUsd(output.provider, output.inputTokens, output.outputTokens).costUsd ?? undefined)

  return { ok: true, data: output, durationMs: result.durationMs, costUsd }
}

export const llmTool: ToolDefinition = {
  id: "tool_llm",
  name: "LLM",
  get provider() {
    return activeLlmProviderName()
  },
  description: "Reasons over collected information to analyze, rank and explain.",
  isConnected: isLlmConnected,
  get notConnectedReason() {
    return activeNotConfiguredReason()
  },
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
