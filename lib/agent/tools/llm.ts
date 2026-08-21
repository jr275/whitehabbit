import "server-only"

/* ================================================================== *
 * LLM TOOL — provider dispatcher.
 *
 * The external contract (isLlmConnected, callLlm, llmTool) is exactly
 * what it was when this only talked to Anthropic — nothing downstream
 * (trend-research.ts, runtime.ts) changed. What used to be a single
 * hardcoded implementation is now a lookup: LLM_PROVIDER selects one
 * LlmProvider from lib/agent/tools/llm-providers/, and this file only
 * ever delegates to that one provider. No provider is ever silently
 * substituted for another.
 * ================================================================== */

import { anthropicProvider } from "./llm-providers/anthropic"
import { geminiProvider } from "./llm-providers/gemini"
import type { LlmCallInput, LlmCallOutput, LlmProvider } from "./llm-providers/types"
import type { ToolActionResult, ToolDefinition } from "@/lib/agent/types"

export type { LlmCallInput, LlmCallOutput } from "./llm-providers/types"

const PROVIDERS: Record<string, LlmProvider> = {
  anthropic: anthropicProvider,
  gemini: geminiProvider,
}

const DEFAULT_PROVIDER_ID = "anthropic"

/** Resolves LLM_PROVIDER to a known provider, or reports exactly why it
 * can't — an unrecognized value is a misconfiguration, never a silent
 * fallback to a different provider's credentials. */
function resolveProvider(): { provider: LlmProvider } | { error: string } {
  const raw = (process.env.LLM_PROVIDER || DEFAULT_PROVIDER_ID).trim().toLowerCase()
  const provider = PROVIDERS[raw]
  if (!provider) {
    return { error: `LLM_PROVIDER="${raw}" is not supported. Supported providers: ${Object.keys(PROVIDERS).join(", ")}.` }
  }
  return { provider }
}

export function isLlmConnected(): boolean {
  const resolved = resolveProvider()
  return "provider" in resolved && resolved.provider.isConfigured()
}

export function activeLlmProviderName(): string {
  const resolved = resolveProvider()
  return "provider" in resolved ? resolved.provider.displayName : "LLM"
}

function activeNotConfiguredReason(): string {
  const resolved = resolveProvider()
  return "error" in resolved ? resolved.error : resolved.provider.notConfiguredReason()
}

export async function callLlm(input: LlmCallInput): Promise<ToolActionResult<LlmCallOutput>> {
  const resolved = resolveProvider()
  if ("error" in resolved) {
    return { ok: false, blocked: true, blockedReason: resolved.error, durationMs: 0 }
  }
  if (!resolved.provider.isConfigured()) {
    return { ok: false, blocked: true, blockedReason: resolved.provider.notConfiguredReason(), durationMs: 0 }
  }
  return resolved.provider.call(input)
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
