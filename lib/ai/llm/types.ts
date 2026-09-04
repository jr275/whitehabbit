/* ================================================================== *
 * LLM PROVIDER — the platform abstraction seam.
 *
 * This lives in lib/ai (shared platform) rather than lib/agent
 * (Workforce-only) because two products now need to call a model, and
 * the alternatives were both bad: Knowledge importing lib/agent would
 * break the product boundary the repository exists to keep, and
 * Knowledge reimplementing the same HTTP call would mean two copies of
 * every credential check, error classification and timeout — drifting
 * apart the first time one of them is fixed. lib/knowledge/ai-summary.ts
 * was exactly that second copy, and its own header said so.
 *
 * NOTHING HERE MAY IMPORT lib/agent OR lib/knowledge. That is the whole
 * point: a platform module that reaches back into a product would put
 * that product in the other one's bundle through the shared import.
 * The result type below is deliberately neutral for that reason — it is
 * not Workforce's ToolActionResult, which is what used to be returned
 * here; Workforce adapts to its own shape at its own boundary.
 * ================================================================== */

export interface LlmCallInput {
  system: string
  prompt: string
  maxTokens?: number
}

export interface LlmCallOutput {
  text: string
  model: string
  /** Straight from the provider's own usage field. Never estimated —
   *  a fabricated token count becomes a fabricated cost. */
  inputTokens: number
  outputTokens: number
  /** Which provider actually produced this. Cost lookup and accounting
   *  key off this rather than assuming the configured one answered. */
  provider: string
  /** Set ONLY by a provider that returns a local fixture instead of
   *  calling anything. Its absence is what lets every layer downstream
   *  know the tokens, model and cost above are real. */
  executionMode?: "development"
}

/** not_configured    — no credential (or no model id) for this provider
 *  invalid_credential — the provider authenticated the request and
 *                       rejected the credential itself
 *  provider_error     — everything else: 5xx, network, timeout, an
 *                       unusable body, a denied project
 *
 *  Three values because callers act differently on each: the first is
 *  a deployment problem to surface, the second is a key to replace,
 *  the third is worth retrying. */
export type LlmFailureReason = "not_configured" | "invalid_credential" | "provider_error"

export type LlmResult =
  | { ok: true; output: LlmCallOutput; durationMs: number }
  | { ok: false; reason: LlmFailureReason; message: string; durationMs: number }

export interface LlmCallDeps {
  /** Test seam. Every test in this repository that exercises a provider
   *  uses it, so no unit test can reach a real endpoint or spend money. */
  fetchImpl?: typeof fetch
}

export interface LlmProvider {
  /** Stable id — also the cost/env-var key. */
  id: string
  /** What a user sees, e.g. "Anthropic API key required". */
  displayName: string
  /** A real check of credential (and, where required, model) presence.
   *  Never hardcoded true for a provider that needs one. */
  isConfigured: () => boolean
  /** Why isConfigured() is false right now. Read fresh, never cached —
   *  env can change between a check and the next request. */
  notConfiguredReason: () => string
  /** The real call. Never fabricates a completion, never estimates
   *  tokens, never returns another provider's output. */
  call: (input: LlmCallInput, deps?: LlmCallDeps) => Promise<LlmResult>
}
