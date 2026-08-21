import "server-only"

/* ================================================================== *
 * LLM PROVIDER — the abstraction seam.
 *
 * lib/agent/tools/llm.ts dispatches to whichever LlmProvider is active
 * (selected server-side via LLM_PROVIDER). Every provider implements
 * this exact same shape, so callLlm()/isLlmConnected()/llmTool in
 * llm.ts — and everything that consumes them (trend-research.ts,
 * runtime.ts) — never change no matter which provider is behind them.
 * ================================================================== */

import type { ToolActionResult } from "@/lib/agent/types"

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
  /** which provider actually produced this — real token accounting and
   * cost lookup both key off this, never assumed. */
  provider: string
}

export interface LlmProvider {
  /** stable id, e.g. "anthropic" | "gemini" — also the cost/env-var key */
  id: string
  /** what the UI shows, e.g. "Anthropic API key required" */
  displayName: string
  /** a REAL check — credential (and, where required, model) presence. Never hardcoded true. */
  isConfigured: () => boolean
  /** why isConfigured() is currently false — read fresh, never cached */
  notConfiguredReason: () => string
  /** the real call. Never fabricates a completion, never estimates tokens. */
  call: (input: LlmCallInput) => Promise<ToolActionResult<LlmCallOutput>>
}
