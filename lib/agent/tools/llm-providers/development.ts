import "server-only"

/* ================================================================== *
 * DEVELOPMENT PROVIDER — local testing without a real LLM credential.
 *
 * Only ever reachable when LLM_DEV_MODE=true (gated in llm.ts's
 * resolveProvider(), before any provider lookup happens) — never
 * selectable via LLM_PROVIDER, never a fallback when a real provider
 * fails or is unconfigured. It implements the exact same LlmProvider
 * contract as anthropic.ts/gemini.ts, so nothing downstream (the
 * runtime, trend-research.ts) has any special-case code for it — the
 * only thing that marks its output as non-real is the data itself:
 * provider "development", executionMode "development", 0 tokens, a
 * fixture whose trend names are explicitly labeled "[DEV]".
 *
 * No network call is ever made here. No external credential is ever
 * read, checked, or required.
 * ================================================================== */

import type { ToolActionResult } from "@/lib/agent/types"
import type { LlmCallInput, LlmCallOutput, LlmProvider } from "./types"

const PROVIDER_ID = "development"
const MODEL_LABEL = "development-fixture"

function isConfigured(): boolean {
  // dev mode's entire point: no external credential is ever required
  return true
}

function notConfiguredReason(): string {
  // never shown — isConfigured() is always true — kept only to satisfy
  // the shared LlmProvider contract.
  return ""
}

/** A deterministic, clearly-labeled fixture matching the exact JSON
 * shape trend-research.ts's parseTrends() expects. source_indices only
 * ever references index 0 — the one index guaranteed to exist, since
 * the skill already errors out before this point if search returned
 * zero results — so this never produces an evaluator mismatch
 * regardless of how many real sources came back. */
function developmentTrendsFixture(): string {
  return JSON.stringify({
    trends: [
      {
        name: "[DEV] Local pipeline exercise — agentic workflow tooling",
        rank: 1,
        why_it_matters: "This is a deterministic development fixture, not a real model response — LLM_DEV_MODE is enabled, so no external provider was called. It exists to exercise the full Worker → Runtime → Evaluator → Persistence → Outputs Hub path end to end.",
        confidence: 80,
        source_indices: [0],
      },
      {
        name: "[DEV] Local pipeline exercise — evaluation tooling",
        rank: 2,
        why_it_matters: "Second development fixture entry, included so the evaluator's grounding/reasoning checks have more than one item to score — still not a real model response.",
        confidence: 65,
        source_indices: [0],
      },
    ],
  })
}

async function call(_input: LlmCallInput): Promise<ToolActionResult<LlmCallOutput>> {
  const started = Date.now()
  return {
    ok: true,
    data: {
      text: developmentTrendsFixture(),
      model: MODEL_LABEL,
      inputTokens: 0,
      outputTokens: 0,
      provider: PROVIDER_ID,
      executionMode: "development",
    },
    durationMs: Date.now() - started,
    costUsd: 0,
  }
}

export const developmentProvider: LlmProvider = {
  id: PROVIDER_ID,
  displayName: "Development",
  isConfigured,
  notConfiguredReason,
  call,
}
