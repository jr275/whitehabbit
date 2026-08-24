import "server-only"

/* POST /api/agents/blueprint — "ASSEMBLE WORKER", made real.
 *
 * Takes a real job description, uses the existing real LLM provider
 * abstraction (callLlm — Anthropic/Gemini/the honestly-labeled local
 * dev fixture, whichever is active) to analyze it against the real
 * skill catalog, and returns a real, persisted Worker pre-populated
 * from that analysis. The blueprint is not a separate fabricated
 * object shown once and discarded — it IS the created Worker's
 * identity/mission/skills/tools/outcome, immediately editable in
 * Studio like any other Worker.
 *
 * The LLM is asked to choose ONLY from the real, currently-executable
 * skill catalog (id + description), never an invented capability —
 * any id it returns that isn't real is dropped; if nothing usable
 * comes back at all, a deterministic keyword fallback still produces
 * a real, valid, runnable Worker rather than failing the request. */

import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { hydrateWorkerLiveState } from "@/lib/agent/hydrate"
import { callLlm } from "@/lib/agent/tools/llm"
import { withApiHandler, ValidationError } from "@/lib/api-error"
import { recordAudit, upsertWorker } from "@/lib/db/repo"
import { logger } from "@/lib/observability/logger"
import { enforceRateLimit } from "@/lib/rate-limit"
import { requireSession } from "@/lib/session"
import { SKILL_CATALOG } from "@/lib/workforce/catalog"
import { buildWorkerFromBlueprint, type AgentBlueprint } from "@/lib/workforce/seed"

const SYSTEM_PROMPT = `You are an AI Agent Factory's blueprint analyst. A user describes a job they want an AI worker to do. You must design that worker using ONLY the real, currently-executable skills listed below — never invent a skill that isn't in this list.

Respond with ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{
  "name": string (a short, professional worker name, e.g. "Aria" or "Atlas" — not a sentence),
  "role": string (a short job title, e.g. "Enterprise Lead Researcher"),
  "description": string (1-2 sentences describing what this worker does),
  "persona": string (1 sentence describing its working style/tone),
  "tone": string[] (2-4 words describing communication style, e.g. ["Analytical","Direct"]),
  "mission": string (a clear, actionable restatement of the user's objective — this becomes the literal task the worker executes),
  "primarySkillId": string (the single best-matching skill id from the list below),
  "secondarySkillIds": string[] (0-2 additional relevant skill ids from the list below, or empty array),
  "primaryKPI": string (the one metric that best measures success for this job),
  "secondaryKPIs": string[] (2-4 supporting metrics)
}`

function buildCatalogDescription(): string {
  return SKILL_CATALOG.map((s) => `- id: "${s.id}" — ${s.name} (${s.category}): ${s.description}`).join("\n")
}

/** Deterministic fallback — used only if the LLM call fails entirely
 * or returns something unusable. Never blocks worker creation; always
 * resolves to a real catalog skill. */
function fallbackSkillId(objective: string): string {
  const text = objective.toLowerCase()
  if (/\blead|sales|meeting|prospect|customer|enterprise\b/.test(text)) return "skill_lead_qualification"
  if (/\bengagement|audience|comment|social\b/.test(text)) return "skill_engagement_analysis"
  if (/\bcontent|blog|post|article\b/.test(text)) return "skill_content_intelligence"
  return "skill_trend_research"
}

function fallbackBlueprint(objective: string): AgentBlueprint {
  const skillId = fallbackSkillId(objective)
  const template = SKILL_CATALOG.find((s) => s.id === skillId)!
  return {
    name: "New Worker",
    role: template.name,
    description: `${template.description}`,
    persona: "A focused operator — evidence-driven, cites its sources.",
    tone: ["Analytical", "Direct"],
    mission: objective,
    primarySkillId: skillId,
    secondarySkillIds: [],
    primaryKPI: "Outputs produced",
    secondaryKPIs: ["Quality score", "Success rate"],
  }
}

function parseBlueprint(text: string, objective: string): AgentBlueprint | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed || typeof parsed.name !== "string" || typeof parsed.primarySkillId !== "string") return null
    const validIds = new Set(SKILL_CATALOG.map((s) => s.id))
    const primarySkillId = validIds.has(parsed.primarySkillId) ? parsed.primarySkillId : fallbackSkillId(objective)
    const secondarySkillIds = Array.isArray(parsed.secondarySkillIds)
      ? parsed.secondarySkillIds.filter((id: unknown) => typeof id === "string" && validIds.has(id) && id !== primarySkillId)
      : []
    return {
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 40) : "New Worker",
      role: typeof parsed.role === "string" ? parsed.role.trim().slice(0, 80) : SKILL_CATALOG.find((s) => s.id === primarySkillId)!.name,
      description: typeof parsed.description === "string" ? parsed.description.trim().slice(0, 400) : "",
      persona: typeof parsed.persona === "string" ? parsed.persona.trim().slice(0, 200) : "",
      tone: Array.isArray(parsed.tone) ? parsed.tone.filter((t: unknown) => typeof t === "string").slice(0, 4) : [],
      mission: typeof parsed.mission === "string" && parsed.mission.trim() ? parsed.mission.trim().slice(0, 500) : objective,
      primarySkillId,
      secondarySkillIds,
      primaryKPI: typeof parsed.primaryKPI === "string" && parsed.primaryKPI.trim() ? parsed.primaryKPI.trim().slice(0, 60) : "Outputs produced",
      secondaryKPIs: Array.isArray(parsed.secondaryKPIs) ? parsed.secondaryKPIs.filter((k: unknown) => typeof k === "string").slice(0, 5) : [],
    }
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  return withApiHandler("agents.blueprint", async () => {
    const { organizationId, userId } = await requireSession()
    await enforceRateLimit("worker_create", organizationId)

    const body = (await req.json().catch(() => null)) as { objective?: string } | null
    const objective = body?.objective?.trim() ?? ""
    if (!objective) throw new ValidationError("Describe what the worker should do.")
    if (objective.length > 500) throw new ValidationError("Keep the objective under 500 characters.")

    const llmResult = await callLlm({
      system: SYSTEM_PROMPT,
      prompt: `Real, currently-executable skills:\n${buildCatalogDescription()}\n\nJob description: "${objective}"\n\nDesign the worker.`,
      maxTokens: 800,
    })

    let blueprint: AgentBlueprint
    let mode: "development" | "production"
    if (llmResult.ok) {
      const data = llmResult.data!
      const parsed = parseBlueprint(data.text, objective)
      blueprint = parsed ?? fallbackBlueprint(objective)
      mode = data.executionMode === "development" ? "development" : "production"
      logger.info("blueprint_generated", { organizationId, userId, mode, primarySkillId: blueprint.primarySkillId, usedFallback: !parsed })
    } else {
      // LLM unavailable/blocked — never fail "Assemble Worker" outright;
      // fall back to a real, deterministic, catalog-valid blueprint and
      // say so honestly rather than fabricate an LLM-authored one.
      blueprint = fallbackBlueprint(objective)
      mode = "development"
      logger.warn("blueprint_llm_unavailable", { organizationId, userId, reason: llmResult.blockedReason ?? llmResult.error })
    }

    const worker = buildWorkerFromBlueprint(`worker_${randomUUID()}`, blueprint)
    const saved = await upsertWorker(worker, organizationId, userId)
    await recordAudit({ orgId: organizationId, userId, action: "worker.assemble", resourceType: "worker", resourceId: saved.id, metadata: { objective, primarySkillId: blueprint.primarySkillId, mode } })

    return NextResponse.json({ worker: hydrateWorkerLiveState(saved), blueprint, mode })
  })
}
