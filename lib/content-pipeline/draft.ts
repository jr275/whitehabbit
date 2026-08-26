import "server-only"

/* ================================================================== *
 * WRITER AGENT (§17) — the one step in this pipeline that calls the
 * LLM. Every factual claim it may write must trace to a research claim
 * (cited by index) or be explicitly flagged for verification — the
 * model is instructed never to invent a fact, and quality.ts's gate
 * structurally checks that every section actually cites something
 * from the research when research claims exist.
 *
 * Goes through the existing provider-agnostic callLlm() (lib/agent/
 * tools/llm.ts) — never a direct provider SDK call (§35). Honestly
 * reports "blocked" (SkillBlockedError-equivalent) rather than
 * fabricating a draft when no LLM credential is configured.
 * ================================================================== */

import { callLlm } from "@/lib/agent/tools/llm"
import type { PageBrief } from "@/lib/pagebrief/model"
import type { DraftArtifact, OutlineArtifact, ResearchArtifact } from "./model"

export class DraftBlockedError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = "DraftBlockedError"
  }
}

const SYSTEM_PROMPT = `You are a factual web content writer. You are given a page brief, a set of real, indexed research claims (each with an index), and a section outline. Write real page content using ONLY the provided claims — never invent a fact. If a section has no supporting claims, write a short honest paragraph noting that detail is not yet available, and do not fabricate specifics.

Respond with ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{"title": string, "metaDescription": string (max 160 chars), "sections": [{"heading": string, "body": string (2-4 sentences), "claimIndices": number[] (0-based indices into the provided claims list that this section's body actually draws from — empty array if none apply)}]}`

function buildPrompt(brief: PageBrief, research: ResearchArtifact, outline: OutlineArtifact): string {
  const claimsList = research.claims.map((c, i) => `[${i}] ${c.text}`).join("\n") || "(no research claims are available)"
  const outlineList = outline.sections.map((s) => `- ${s.heading} (suggested claims: ${s.claimIndices.length ? s.claimIndices.join(", ") : "none"})`).join("\n")
  return [
    `Target intent: ${brief.targetIntent ?? "not specified"}`,
    brief.market ? `Market: ${brief.market}` : null,
    brief.role ? `Audience role: ${brief.role}` : null,
    `Section outline:\n${outlineList}`,
    `Real, indexed research claims:\n${claimsList}`,
    `Write the page now, following the required JSON shape exactly.`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

function parseDraft(text: string): Omit<DraftArtifact, "model" | "provider" | "inputTokens" | "outputTokens" | "executionMode"> | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed || typeof parsed.title !== "string" || !Array.isArray(parsed.sections)) return null
    return {
      title: parsed.title,
      metaDescription: typeof parsed.metaDescription === "string" ? parsed.metaDescription : "",
      sections: parsed.sections.map((s: { heading?: string; body?: string; claimIndices?: number[] }) => ({
        heading: s.heading ?? "",
        body: s.body ?? "",
        claimIndices: Array.isArray(s.claimIndices) ? s.claimIndices.filter((i) => typeof i === "number") : [],
      })),
    }
  } catch {
    return null
  }
}

export async function runDraft(brief: PageBrief, research: ResearchArtifact, outline: OutlineArtifact): Promise<DraftArtifact> {
  const result = await callLlm({ system: SYSTEM_PROMPT, prompt: buildPrompt(brief, research, outline), maxTokens: 1800 })
  if (!result.ok) {
    throw new DraftBlockedError(result.blockedReason ?? result.error ?? "The Writer step's LLM call failed.")
  }
  const parsed = parseDraft(result.data!.text)
  if (!parsed) throw new Error("The Writer step's LLM response was not valid structured draft content.")
  return {
    ...parsed,
    model: result.data!.model,
    provider: result.data!.provider,
    inputTokens: result.data!.inputTokens,
    outputTokens: result.data!.outputTokens,
    executionMode: result.data!.executionMode,
  }
}
