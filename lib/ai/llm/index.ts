import "server-only"

/* ================================================================== *
 * PROVIDER RESOLUTION — one place that decides which model answers.
 *
 * LLM_PROVIDER selects one provider. An unrecognised value is a
 * misconfiguration and is reported as one; it is never a silent
 * fallback to a different provider's credentials, because "the other
 * key happened to be set" is how a deployment ends up billing an
 * account nobody meant to use.
 *
 * A caller may pass extra providers — Workforce injects its local
 * development fixture that way, and that fixture stays in Workforce
 * where its skill-specific JSON shapes belong.
 * ================================================================== */

import { anthropicProvider } from "./anthropic"
import { geminiProvider } from "./gemini"
import type { LlmCallDeps, LlmCallInput, LlmProvider, LlmResult } from "./types"

export * from "./types"
export { anthropicProvider } from "./anthropic"
export { geminiProvider } from "./gemini"

const PROVIDERS: Record<string, LlmProvider> = {
  anthropic: anthropicProvider,
  gemini: geminiProvider,
}

const DEFAULT_PROVIDER_ID = "anthropic"

export type ProviderResolution = { provider: LlmProvider } | { error: string }

export function resolveLlmProvider(overrides: Record<string, LlmProvider> = {}): ProviderResolution {
  const raw = (process.env.LLM_PROVIDER || DEFAULT_PROVIDER_ID).trim().toLowerCase()
  const provider = overrides[raw] ?? PROVIDERS[raw]
  if (!provider) {
    const supported = [...new Set([...Object.keys(PROVIDERS), ...Object.keys(overrides)])].join(", ")
    return { error: `LLM_PROVIDER="${raw}" is not supported. Supported providers: ${supported}.` }
  }
  return { provider }
}

export function isLlmConnected(overrides?: Record<string, LlmProvider>): boolean {
  const resolved = resolveLlmProvider(overrides)
  return "provider" in resolved && resolved.provider.isConfigured()
}

export function activeLlmProviderName(overrides?: Record<string, LlmProvider>): string {
  const resolved = resolveLlmProvider(overrides)
  return "provider" in resolved ? resolved.provider.displayName : "LLM"
}

export function activeLlmNotConfiguredReason(overrides?: Record<string, LlmProvider>): string {
  const resolved = resolveLlmProvider(overrides)
  return "error" in resolved ? resolved.error : resolved.provider.notConfiguredReason()
}

export interface CallLlmOptions extends LlmCallDeps {
  /** Additional providers selectable by LLM_PROVIDER, or a forced one. */
  overrides?: Record<string, LlmProvider>
  /** Bypasses resolution entirely. The caller has already decided. */
  provider?: LlmProvider
}

/** The one entry point. Checks configuration before spending a request,
 *  so an unconfigured deployment gets a clear reason rather than a
 *  provider-shaped error. */
export async function callLlm(input: LlmCallInput, options: CallLlmOptions = {}): Promise<LlmResult> {
  const provider = options.provider ?? (() => {
    const resolved = resolveLlmProvider(options.overrides)
    return "provider" in resolved ? resolved.provider : null
  })()

  if (!provider) {
    return {
      ok: false,
      reason: "not_configured",
      message: activeLlmNotConfiguredReason(options.overrides),
      durationMs: 0,
    }
  }
  if (!provider.isConfigured()) {
    return { ok: false, reason: "not_configured", message: provider.notConfiguredReason(), durationMs: 0 }
  }
  // Forward the whole dep set, named explicitly. Rebuilding it by hand
  // is how deps.signal was silently dropped the first time: the call
  // compiled, the control test passed, and only an abort test noticed.
  return provider.call(input, { fetchImpl: options.fetchImpl, signal: options.signal })
}
