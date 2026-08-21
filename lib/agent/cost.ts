/* ================================================================== *
 * COST — real token counts x a configurable $/token rate.
 *
 * Token counts always come straight from the LLM provider's own
 * `usage` field on the response — never estimated. The $/token rate is
 * an assumption, not a fact the API gives us, so it is explicit and
 * environment-configurable rather than a silently hardcoded number.
 * When no rate is configured, cost is reported as unavailable rather
 * than guessed at zero.
 * ================================================================== */

const DEFAULT_INPUT_PER_MTOK = 3 // USD per 1M input tokens — Claude Sonnet-class list price at time of writing
const DEFAULT_OUTPUT_PER_MTOK = 15 // USD per 1M output tokens

export function llmCostUsd(inputTokens: number, outputTokens: number): number {
  const inRate = Number(process.env.LLM_INPUT_COST_PER_MTOK ?? DEFAULT_INPUT_PER_MTOK)
  const outRate = Number(process.env.LLM_OUTPUT_COST_PER_MTOK ?? DEFAULT_OUTPUT_PER_MTOK)
  return (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate
}
