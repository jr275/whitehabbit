import "server-only"

/* ================================================================== *
 * AI VISIBILITY RUNNER (§27-28, ADR-028) — real prompts to a real,
 * configured LLM provider via the same provider-agnostic callLlm()
 * every other agent uses (never a direct provider SDK call). A single
 * answer is never treated as definitive (§28) — each call is one
 * AIRun/AIAnswer row; repeated runs of the same AIPrompt accumulate
 * real observations over time, and callers comparing "did visibility
 * change" should look at the real history, not one answer.
 *
 * Never claims deterministic AI rankings. Detection of mentions/
 * citations/sentiment below is real substring/regex matching against
 * the model's actual raw text — not another LLM call asked to
 * self-report, and never a fabricated confidence.
 * ================================================================== */

import { callLlm } from "@/lib/agent/tools/llm"
import { assertCapability } from "@/lib/workflow/permissions"
import { createAIAnswer, createAICitation, createAIRun, getAIPrompt, type AIAnswer } from "./repo"
import { resolvePublishedPage } from "@/lib/pages/repo"
import { listCanonicalEntities } from "@/lib/knowledge/repo"

const SYSTEM_PROMPT = "You are being tested for how you answer a real user question. Answer naturally and honestly, as you normally would, including any sources or well-known brands/organizations you would normally mention."

const URL_PATTERN = /https?:\/\/[^\s)\]"'<>]+/g

export class AIVisibilityBlockedError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = "AIVisibilityBlockedError"
  }
}

function extractCitationUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? []
  return [...new Set(matches.map((u) => u.replace(/[.,;:]+$/, "")))]
}

/** Real substring detection against a project's own known entity names
 * and (optionally) explicit competitor names the caller supplies —
 * never an inferred/guessed brand. */
function detectMentions(text: string, candidateNames: string[]): { name: string; mentioned: boolean }[] {
  const lower = text.toLowerCase()
  return candidateNames.map((name) => ({ name, mentioned: lower.includes(name.toLowerCase()) }))
}

export interface RunAIVisibilityPromptOptions {
  brandNames?: string[] // this tenant's own brand/organization names to check for
  competitorNames?: string[] // real, tenant-supplied competitor names — never invented
}

export async function runAIVisibilityPrompt(orgId: string, projectId: string, promptId: string, opts: RunAIVisibilityPromptOptions = {}): Promise<AIAnswer> {
  assertCapability("AIVisibilityAgent", "run_ai_visibility_prompt")
  const prompt = await getAIPrompt(promptId, orgId)
  if (!prompt) throw new Error(`AI prompt ${promptId} not found for this organization.`)

  const result = await callLlm({ system: SYSTEM_PROMPT, prompt: prompt.text, maxTokens: 600 })
  if (!result.ok) {
    await createAIRun({ orgId, projectId, promptId, provider: "unknown", model: "unknown", status: "blocked", error: result.blockedReason ?? result.error ?? "AI visibility prompt failed." })
    throw new AIVisibilityBlockedError(result.blockedReason ?? result.error ?? "The AI visibility prompt could not be run — no LLM provider is configured.")
  }

  const run = await createAIRun({ orgId, projectId, promptId, provider: result.data!.provider, model: result.data!.model, status: "succeeded" })

  const rawText = result.data!.text
  const brandNames = opts.brandNames ?? []
  const competitorNames = opts.competitorNames ?? []
  const entities = await listCanonicalEntities(orgId, projectId, { limit: 200 })
  const mentionedEntities = detectMentions(rawText, entities.map((e) => e.name)).map((m) => {
    const entity = entities.find((e) => e.name === m.name)
    return { entityId: entity?.id, name: m.name, mentioned: m.mentioned }
  })
  const brandMentioned = brandNames.length > 0 && detectMentions(rawText, brandNames).some((m) => m.mentioned)
  const competitorMentions = detectMentions(rawText, competitorNames)
    .filter((m) => m.mentioned)
    .map((m) => ({ name: m.name }))

  const answer = await createAIAnswer({
    orgId,
    aiRunId: run.id,
    rawText,
    mentionedEntities,
    brandMentioned,
    competitorMentions,
    sentiment: null, // real sentiment classification is out of scope for this revision — never a fabricated guess (§40)
    confidence: 1, // this IS the model's real, verbatim answer — confidence reflects "this text is authentic," not "this is correct"
  })

  const urls = extractCitationUrls(rawText)
  for (const url of urls) {
    let pageId: string | null = null
    try {
      const parsed = new URL(url)
      const match = parsed.pathname.match(/^\/sites\/([^/]+)\/([^/]+)\/?$/)
      if (match) {
        const resolved = await resolvePublishedPage(match[1], match[2])
        pageId = resolved?.page.id ?? null
      }
    } catch {
      // not a parseable URL — skip page matching for this citation, still record it
    }
    await createAICitation({ orgId, aiAnswerId: answer.id, sourceUrl: url, pageId })
  }

  return answer
}
