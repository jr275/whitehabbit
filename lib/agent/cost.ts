/* ================================================================== *
 * COST — real token counts x an explicit, provider-specific $/token
 * rate. Never assumed across providers, never fabricated when unset.
 *
 * Token counts always come straight from the provider's own usage
 * field — never estimated. The $/token rate is an assumption the
 * provider's API does not give us, so it is explicit and
 * per-provider-configurable. When no rate is configured for the
 * active provider, cost is reported as UNAVAILABLE (costUsd: null) —
 * never silently rendered as $0, which would be a fabricated fact
 * ("this cost nothing") rather than an honest "not measured".
 * ================================================================== */

interface CostRates {
  inputPerMtok: number
  outputPerMtok: number
}

/* Only a rate this deployment can actually stand behind gets a
 * built-in default. Anthropic's is the confirmed Sonnet-class list
 * price for the model this deployment defaults to (see
 * llm-providers/anthropic.ts). Gemini has no default: pricing varies
 * by model tier and nothing here is confirmed current, so it must be
 * configured explicitly (GEMINI_INPUT_COST_PER_MTOK / ..._OUTPUT_...)
 * or cost is reported unavailable rather than guessed. */
const PROVIDER_DEFAULTS: Record<string, CostRates | undefined> = {
  anthropic: { inputPerMtok: 3, outputPerMtok: 15 },
}

function resolveRates(provider: string): CostRates | null {
  // Anthropic keeps the original, provider-agnostic env var names for
  // backward compatibility with any existing deployment config; every
  // other provider gets its own namespaced pair so one provider's rate
  // can never be silently applied to another's tokens.
  const inOverride = provider === "anthropic" ? process.env.LLM_INPUT_COST_PER_MTOK : process.env[`${provider.toUpperCase()}_INPUT_COST_PER_MTOK`]
  const outOverride = provider === "anthropic" ? process.env.LLM_OUTPUT_COST_PER_MTOK : process.env[`${provider.toUpperCase()}_OUTPUT_COST_PER_MTOK`]

  const fallback = PROVIDER_DEFAULTS[provider]
  const inputPerMtok = inOverride != null ? Number(inOverride) : fallback?.inputPerMtok
  const outputPerMtok = outOverride != null ? Number(outOverride) : fallback?.outputPerMtok
  if (inputPerMtok == null || outputPerMtok == null || Number.isNaN(inputPerMtok) || Number.isNaN(outputPerMtok)) return null
  return { inputPerMtok, outputPerMtok }
}

export interface CostEstimate {
  /** null = no rate configured for this provider — genuinely unavailable, not zero */
  costUsd: number | null
  configured: boolean
}

export function llmCostUsd(provider: string, inputTokens: number, outputTokens: number): CostEstimate {
  const rates = resolveRates(provider)
  if (!rates) return { costUsd: null, configured: false }
  const costUsd = (inputTokens / 1_000_000) * rates.inputPerMtok + (outputTokens / 1_000_000) * rates.outputPerMtok
  return { costUsd, configured: true }
}
