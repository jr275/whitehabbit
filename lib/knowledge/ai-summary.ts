import "server-only"

/* ================================================================== *
 * ANTHROPIC — the single Knowledge-owned call to the Messages API, plus
 * the article-summary capability built on it. Two features now share
 * this one client: POST /api/knowledge/:id/summarize (summarizeText,
 * below) and POST /api/knowledge/ask (lib/knowledge/ask.ts). Both are
 * on-demand only — nothing here is invoked by the ingestion pipeline,
 * nothing here caches or regenerates.
 *
 * callAnthropic() is the only place in Knowledge that reads
 * ANTHROPIC_API_KEY or speaks HTTP to the API. A second capability
 * meant one more caller, not one more provider implementation: the key
 * handling, timeout, error masking and logging are written once.
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
/** The deployment-wide model, when one is named. The per-capability
 *  fallbacks differ on purpose: summarising one article you are already
 *  looking at is a small job, while answering a question across several
 *  saved pieces with citations is a reasoning job, so Ask asks for a
 *  stronger default. LLM_MODEL, when set, overrides both. */
const SUMMARY_MODEL = process.env.LLM_MODEL || "claude-sonnet-5"

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
export class AiUpstreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiUpstreamError"
  }
}

/** The name this error had when summarising was the only capability.
 *  Kept so the summarize route and its tests keep compiling and
 *  behaving identically; both names are the same class. */
export const AiSummaryUpstreamError = AiUpstreamError
export type AiSummaryUpstreamError = AiUpstreamError

/** True when this deployment can call the API at all. Both capabilities
 *  ask this first so a missing key becomes an honest 503 rather than a
 *  generic upstream failure. */
export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

/** Previous name, kept for the summarize route and its tests. */
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
export interface AnthropicRequest {
  model: string
  maxTokens: number
  system: string
  prompt: string
  /** Names the capability in logs, so a failure is attributable without
   *  logging any prompt content. */
  logContext: string
  timeoutMs?: number
  /** Shown to the user on any failure. Always generic — the real cause
   *  is logged server-side and never returned. */
  userFacingError: string
}

/**
 * One request to the Messages API, returning the assistant's text.
 *
 * Non-streaming, deliberately: both callers produce short, bounded
 * answers well inside the timeout, and streaming through a Next route
 * handler to the browser would add real machinery for no user-visible
 * gain at these lengths.
 *
 * `thinking` is not sent. On the current models omitting it runs
 * adaptive thinking, which is what these jobs want; sending an explicit
 * budget is rejected by the API on this model family.
 *
 * Throws AiUpstreamError — never a raw fetch/parse error, and never a
 * message derived from the upstream body.
 */
export async function callAnthropic(req: AnthropicRequest, deps: AiSummaryDeps = {}): Promise<string> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new AiUpstreamError("AI is not configured for this deployment.")

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
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
      }),
      signal: AbortSignal.timeout(req.timeoutMs ?? TIMEOUT_MS),
    })
  } catch (err) {
    logger.error(`${req.logContext}_fetch_error`, { message: err instanceof Error ? err.message : String(err) })
    throw new AiUpstreamError(req.userFacingError)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    logger.warn(`${req.logContext}_refused`, { status: res.status, body: body.slice(0, 500) })
    throw new AiUpstreamError(req.userFacingError)
  }

  const data = (await res.json().catch(() => null)) as AnthropicMessage | null
  const text = data?.content?.find((block) => block.type === "text")?.text?.trim()
  if (!text) {
    logger.error(`${req.logContext}_empty_response`, {})
    throw new AiUpstreamError(req.userFacingError)
  }
  return text
}

/** Summarizes one already-extracted article body. Throws
 *  AiUpstreamError (never a raw fetch/parse error) on any failure —
 *  the real detail is logged, the message returned to a caller is
 *  always the same safe, generic one. */
export async function summarizeText(params: { title: string; text: string }, deps: AiSummaryDeps = {}): Promise<string> {
  const truncated = params.text.length > MAX_INPUT_CHARS ? params.text.slice(0, MAX_INPUT_CHARS) + "\u2026" : params.text
  return callAnthropic(
    {
      model: SUMMARY_MODEL,
      maxTokens: MAX_SUMMARY_TOKENS,
      system: SYSTEM_PROMPT,
      prompt: `Title: ${params.title || "(untitled)"}\n\n${truncated}`,
      logContext: "knowledge_summarize",
      userFacingError: "Couldn't generate a summary right now. Try again.",
    },
    deps,
  )
}
