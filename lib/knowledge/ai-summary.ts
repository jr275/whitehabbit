import "server-only"

/* ================================================================== *
 * AI SUMMARY — Knowledge's on-demand summarizer.
 *
 * Invoked only by POST /api/knowledge/:id/summarize when a user asks
 * for one. Nothing here runs from the ingestion pipeline, and nothing
 * here caches or regenerates — that policy lives in service.ts.
 *
 * This file used to contain its own copy of the Anthropic HTTP call,
 * with a header explaining that the duplication was deliberate: lib/
 * agent is Workforce-only, so reusing its provider would have broken
 * the product boundary. That reasoning was sound and the conclusion
 * has now expired — the providers live in lib/ai/llm (shared platform)
 * precisely so neither product has to keep a copy. What remains here
 * is what is genuinely Knowledge's: the prompt, the input cap, and the
 * refusal to leak provider detail to a caller.
 * ================================================================== */

import { anthropicProvider, type LlmCallDeps } from "@/lib/ai/llm"
import { logger } from "@/lib/observability/logger"

// A token-cost bound, not a content-quality feature: real articles run
// long, and this caps what one summary call ever sends, so one
// exceptionally long saved page can't become an outsized-cost outlier.
export const MAX_INPUT_CHARS = 12_000
const MAX_SUMMARY_TOKENS = 300
const TIMEOUT_MS = 30_000

const SYSTEM_PROMPT =
  "You summarize a saved article for someone deciding whether to read it. Write 2-3 plain-prose sentences — " +
  'no bullet points, no preamble like "This article discusses". State only what the text actually says — never ' +
  "add outside information, opinions, or claims the text doesn't support."

export type AiSummaryDeps = LlmCallDeps

/** A real call to the Anthropic Messages API failed — network error,
 *  non-2xx, or an unusable response body. The message is always a
 *  safe, generic one; the real detail is logged server-side, never
 *  returned. Deliberately local to lib/knowledge (not @/lib/api-error's
 *  UpstreamServiceError): that module imports next/server, which this
 *  file must stay free of to stay importable from this repo's plain-
 *  Node test runner (see tests/knowledge/ai-summary.test.ts's header).
 *  The summarize route translates this into the real HTTP error. */
export class AiSummaryUpstreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiSummaryUpstreamError"
  }
}

export function isAiSummaryConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

interface AnthropicMessage {
  content?: { type: string; text?: string }[]
}

/** Summarizes one already-extracted article body. Throws
 *  AiSummaryUpstreamError (never a raw fetch/parse error) on any
 *  failure — the real detail is logged, the message returned to a
 *  caller is always the same safe, generic one. */
export async function summarizeText(params: { title: string; text: string }, deps: AiSummaryDeps = {}): Promise<string> {
  if (!isAiSummaryConfigured()) {
    // The route checks isAiSummaryConfigured() first and raises the
    // more specific AiNotConfiguredError (503) — this is a defensive
    // fallback for any other caller, not the normal path.
    throw new AiSummaryUpstreamError("AI Summary is not configured for this deployment.")
  }

  const truncated = params.text.length > MAX_INPUT_CHARS ? params.text.slice(0, MAX_INPUT_CHARS) + "…" : params.text

  // Pinned to the Anthropic provider rather than resolved from
  // LLM_PROVIDER: this feature's configuration check, its 503 and its
  // user-facing copy all say ANTHROPIC_API_KEY, and a summarizer that
  // silently followed a deployment-wide provider switch would report a
  // credential state that has nothing to do with what it called.
  // Changing that is a product decision, not a refactor.
  const result = await anthropicProvider.call(
    {
      system: SYSTEM_PROMPT,
      prompt: `Title: ${params.title || "(untitled)"}\n\n${truncated}`,
      maxTokens: MAX_SUMMARY_TOKENS,
    },
    deps,
  )

  if (!result.ok) {
    // The real detail is logged server-side and never returned: a
    // provider's error body can carry request fragments, and the
    // caller has no use for it beyond "try again".
    logger.warn("knowledge_summarize_failed", { reason: result.reason, message: result.message })
    throw new AiSummaryUpstreamError("Couldn't generate a summary right now. Try again.")
  }

  const text = result.output.text.trim()
  if (!text) {
    logger.error("knowledge_summarize_empty_response", {})
    throw new AiSummaryUpstreamError("Couldn't generate a summary right now. Try again.")
  }
  return text
}
