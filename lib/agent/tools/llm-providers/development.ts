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

/** The matching fixture for lead-qualification.ts's parseLeads() —
 * same reasoning as developmentTrendsFixture() above, one JSON shape
 * per real skill that parses structured JSON out of an LLM response. */
function developmentLeadsFixture(): string {
  return JSON.stringify({
    leads: [
      {
        company: "[DEV] Local pipeline exercise — Example Corp",
        evidence: "This is a deterministic development fixture, not a real model response — LLM_DEV_MODE is enabled, so no external provider was called. It exists to exercise the full Worker → Runtime → Evaluator → Persistence → Outputs Hub path end to end.",
        score: 78,
        qualified: true,
        reasoning: "Fixture reasoning — not a real qualification judgment.",
        source_indices: [0],
      },
      {
        company: "[DEV] Local pipeline exercise — Sample Industries",
        evidence: "Second development fixture entry, included so the evaluator's grounding/reasoning checks have more than one item to score — still not a real model response.",
        score: 55,
        qualified: false,
        reasoning: "Fixture reasoning — below the qualification threshold.",
        source_indices: [0],
      },
    ],
  })
}

/** The matching fixture for seo-opportunity.ts's parseOpportunities(). */
function developmentSeoOpportunityFixture(): string {
  return JSON.stringify({
    opportunities: [
      {
        topic: "[DEV] Local pipeline exercise — comparison topic",
        target_intent: "This is a deterministic development fixture, not a real model response — LLM_DEV_MODE is enabled, so no external provider was called.",
        suggested_title: "[DEV] Example vs. Alternative: A Local Pipeline Exercise",
        outline: ["Overview", "Key differences", "Pricing", "Verdict"],
        confidence: 75,
        source_indices: [0],
      },
      {
        topic: "[DEV] Local pipeline exercise — how-to topic",
        target_intent: "Second development fixture entry, included so the evaluator's outline-completeness check has more than one item to score — still not a real model response.",
        suggested_title: "[DEV] How to Get Started: A Local Pipeline Exercise",
        outline: ["Setup", "First steps", "Common pitfalls"],
        confidence: 60,
        source_indices: [0],
      },
    ],
  })
}

/** The matching fixture for lib/content-pipeline/draft.ts's parseDraft().
 * Unlike the other fixtures above, this one actually parses the real
 * prompt text (built deterministically by draft.ts's buildPrompt() —
 * "Target intent: ...", "[0] claim text", ...) so the fixture content
 * genuinely reflects the real PageBrief/ResearchArtifact it was asked
 * to write from, rather than generic boilerplate. This matters because
 * real downstream checks (lib/content-pipeline/seo.ts's intent-match,
 * quality.ts's entity/evidence coverage) need real signal to evaluate
 * even in development mode — still clearly labeled "[DEV]" throughout,
 * and still zero tokens/cost, still never a real model call.
 * claimIndices only ever reference indices that were actually present
 * in the prompt's claim list, never an out-of-range index. */
function developmentDraftFixture(input: LlmCallInput): string {
  const intentMatch = input.prompt.match(/Target intent: (.+)/)
  const targetIntent = intentMatch ? intentMatch[1].trim() : "this page"

  const claims: { index: number; text: string }[] = []
  for (const m of input.prompt.matchAll(/^\[(\d+)\] (.+)$/gm)) {
    claims.push({ index: Number(m[1]), text: m[2].trim() })
  }

  const title = `[DEV] ${targetIntent}`.slice(0, 70)
  const metaDescription = `[DEV] Deterministic fixture page addressing: ${targetIntent}. LLM_DEV_MODE is enabled — no external provider was called.`.slice(0, 160)

  const overviewBody = claims[0]
    ? `[DEV] ${targetIntent}. ${claims[0].text}`
    : `[DEV] ${targetIntent}. This is a deterministic development fixture — LLM_DEV_MODE is enabled, so no external provider was called, and no research claims were available to cite.`
  const keyFactsBody = claims[1]
    ? `[DEV] ${claims[1].text}`
    : `[DEV] Second development fixture section, included so downstream SEO/GEO/quality checks have more than one section to evaluate — still not a real model response.`

  return JSON.stringify({
    title,
    metaDescription,
    sections: [
      { heading: "Overview", body: overviewBody, claimIndices: claims[0] ? [claims[0].index] : [] },
      { heading: "Key facts", body: keyFactsBody, claimIndices: claims[1] ? [claims[1].index] : [] },
    ],
  })
}

/** The matching fixture for customer-conversation.ts's parseConversation(). */
function developmentConversationFixture(): string {
  return JSON.stringify({
    response:
      "[DEV] This is a deterministic development fixture, not a real model response — LLM_DEV_MODE is enabled, so no external provider was called.",
    action: "answered",
    confidence: 70,
    reasoning_summary: "[DEV] Local pipeline exercise — answered using the fixture response.",
  })
}

/** Every real skill that parses structured JSON out of callLlm() has a
 * distinct expected shape, spelled out verbatim in that skill's own
 * system prompt (see trend-research.ts / lead-qualification.ts /
 * seo-opportunity.ts / customer-conversation.ts). The fixture is
 * picked by matching that shape string — never a skill id, since
 * LlmCallInput deliberately carries no skill identity (the same
 * contract every real provider implements) — so a new skill only
 * needs a matching fixture function here, no changes to the call
 * boundary. */
function developmentFixtureFor(input: LlmCallInput): string {
  if (input.system.includes('"leads":[')) return developmentLeadsFixture()
  if (input.system.includes('"opportunities":[')) return developmentSeoOpportunityFixture()
  if (input.system.includes('"reasoning_summary"')) return developmentConversationFixture()
  if (input.system.includes('"claimIndices"')) return developmentDraftFixture(input)
  return developmentTrendsFixture()
}

async function call(input: LlmCallInput): Promise<ToolActionResult<LlmCallOutput>> {
  const started = Date.now()
  return {
    ok: true,
    data: {
      text: developmentFixtureFor(input),
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
