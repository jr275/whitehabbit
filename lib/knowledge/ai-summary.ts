import "server-only"

/* ================================================================== *
 * AI SUMMARY — a small, Knowledge-owned call to the Anthropic Messages
 * API. On-demand only: this module is never invoked by the ingestion
 * pipeline, only by POST /api/knowledge/:id/summarize when a user asks
 * for one. Nothing here runs automatically, and nothing here caches or
 * regenerates — that policy lives in service.ts.
 *
 * Deliberately NOT a reuse of lib/agent/tools/llm-providers/
 * anthropic.ts: lib/agent is Workforce-only (scripts/check-boundaries.
 * mjs forbids Knowledge from importing it), so this is an independent,
 * minimal reimplementation of the same one HTTP call — a duplicate on
 * purpose, not an oversight, to keep the two products' AI paths
 * genuinely separable. It shares only the env vars (ANTHROPIC_API_KEY,
 * LLM_MODEL, ANTHROPIC_BASE_URL_PUBLIC), which name a deployment-wide
 * credential, not a code dependency.
 * ================================================================== */

import { logger } from "@/lib/observability/logger"

const API_URL = (process.env.ANTHROPIC_BASE_URL_PUBLIC || "https://api.anthropic.com").replace(/\/$/, "") + "/v1/messages"
const MODEL = process.env.LLM_MODEL || "claude-sonnet-5"

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

export interface AiSummaryDeps {
  /** Test seam only — defaults to the real global fetch. Mirrors
   *  lib/knowledge/service.ts's guardedFetch(..., deps: FetchDeps). */
  fetchImpl?: typeof fetch
}

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
  const fetchImpl = deps.fetchImpl ?? fetch
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    // The route checks isAiSummaryConfigured() first and raises the
    // more specific AiNotConfiguredError (503) — this is a defensive
    // fallback for any other caller, not the normal path.
    throw new AiSummaryUpstreamError("AI Summary is not configured for this deployment.")
  }

  const truncated = params.text.length > MAX_INPUT_CHARS ? params.text.slice(0, MAX_INPUT_CHARS) + "…" : params.text
  const prompt = `Title: ${params.title || "(untitled)"}\n\n${truncated}`

  let res: Response
  try {
    res = await fetchImpl(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_SUMMARY_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    logger.error("knowledge_summarize_fetch_error", { message: err instanceof Error ? err.message : String(err) })
    throw new AiSummaryUpstreamError("Couldn't generate a summary right now. Try again.")
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    logger.warn("knowledge_summarize_refused", { status: res.status, body: body.slice(0, 500) })
    throw new AiSummaryUpstreamError("Couldn't generate a summary right now. Try again.")
  }

  const data = (await res.json().catch(() => null)) as AnthropicMessage | null
  const text = data?.content?.find((block) => block.type === "text")?.text?.trim()
  if (!text) {
    logger.error("knowledge_summarize_empty_response", {})
    throw new AiSummaryUpstreamError("Couldn't generate a summary right now. Try again.")
  }
  return text
}
