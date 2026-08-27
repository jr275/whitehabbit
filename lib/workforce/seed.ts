/* ================================================================== *
 * DEV SEED — one example Worker definition, not fabricated results.
 *
 * This seeds a Worker's CONFIGURATION only (identity, mission, which
 * real skills/tools are enabled) so Studio and Outputs Hub aren't
 * empty on first run. It seeds zero tasks, executions, outputs,
 * business events or metrics — every one of those must come from a
 * real run. Atlas is an example, not a hardcoded product model: any
 * number of additional workers can be created the same way through
 * Studio, and none of the runtime code below this depends on "Atlas"
 * specifically existing.
 * ================================================================== */

import { CHANNEL_CATALOG, SKILL_CATALOG, TOOL_CATALOG } from "./catalog"
import type { KnowledgeSource, Skill, Worker, WorkerChannel, WorkforceTool } from "./model"

let seq = 0
function uid(prefix: string): string {
  seq += 1
  return `${prefix}_seed_${seq}`
}

function knowledge(items: { name: string; type: KnowledgeSource["type"]; documents: number }[]): KnowledgeSource[] {
  return items.map((i, idx) => ({ id: uid(`kn${idx}`), name: i.name, type: i.type, documents: i.documents, addedAt: Date.now() - (idx + 1) * 86_400_000 }))
}

/** `enabled` is ordered primary-first (see buildWorkerFromBlueprint/
 * buildWorkerFromProduct, both pass [primarySkillId, ...secondaries]).
 * That order matters at runtime: workforceStore.runWorker() picks
 * `worker.skills.find(s => s.enabled)` as "the skill this worker
 * runs" — so the enabled entries must come first, in `enabled`'s
 * order, not SKILL_CATALOG's fixed order, or a later-in-catalog
 * primary skill (e.g. skill_seo_opportunity, which sorts after
 * skill_trend_research) would silently lose to an earlier-catalog
 * secondary. The rest of the catalog follows, disabled, so Studio's
 * Skills step still shows every available skill. */
function skills(enabled: string[]): Skill[] {
  const byId = new Map(SKILL_CATALOG.map((t) => [t.id, t]))
  const ordered = [...enabled.filter((id) => byId.has(id)), ...SKILL_CATALOG.map((t) => t.id).filter((id) => !enabled.includes(id))]
  return ordered.map((id) => {
    const t = byId.get(id)!
    return { id: t.id, name: t.name, category: t.category, outputType: t.outputType, enabled: enabled.includes(t.id) }
  })
}

function tools(enabled: string[]): WorkforceTool[] {
  return TOOL_CATALOG.map((t) => ({
    id: t.id,
    name: t.name,
    provider: t.provider,
    enabled: enabled.includes(t.id),
    risk: t.risk,
    permission: t.permission,
    connected: false, // overwritten with the real, live status on every read
  }))
}

function channels(enabled: string[]): WorkerChannel[] {
  return CHANNEL_CATALOG.map((c) => ({ id: c.id, name: c.name, connected: enabled.includes(c.id) }))
}

/** A real Agent Blueprint — the structured output of analyzing a job
 * description (app/api/agents/blueprint/route.ts), always referencing
 * real catalog ids. Never free-form skill/tool names the runtime
 * can't actually execute. */
export interface AgentBlueprint {
  name: string
  role: string
  description: string
  persona: string
  tone: string[]
  mission: string
  primarySkillId: string
  secondarySkillIds: string[]
  primaryKPI: string
  secondaryKPIs: string[]
}

/** Builds a real, immediately-runnable Worker from a blueprint — every
 * skill/tool it enables is resolved from the real catalogs, and the
 * tools enabled are exactly the union of the chosen skills' real
 * requiredTools, so the assembled worker is never missing what it
 * needs to actually execute. */
export function buildWorkerFromBlueprint(id: string, blueprint: AgentBlueprint): Worker {
  const now = Date.now()
  const chosenSkillIds = [blueprint.primarySkillId, ...blueprint.secondarySkillIds].filter((skillId) => SKILL_CATALOG.some((s) => s.id === skillId))
  const requiredToolIds = Array.from(new Set(chosenSkillIds.flatMap((skillId) => SKILL_CATALOG.find((s) => s.id === skillId)?.requiredTools ?? [])))
  const initials =
    blueprint.name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "NW"
  return {
    id,
    identity: {
      name: blueprint.name,
      role: blueprint.role,
      description: blueprint.description,
      persona: blueprint.persona,
      tone: blueprint.tone,
      accent: "#5a6ef0",
      initials,
    },
    mission: blueprint.mission,
    objectives: [],
    knowledge: [],
    skills: skills(chosenSkillIds),
    tools: tools(requiredToolIds),
    behaviors: [],
    channels: channels([]),
    outcome: { primaryKPI: blueprint.primaryKPI, secondaryKPIs: blueprint.secondaryKPIs },
    autonomy: "medium",
    status: "draft",
    tested: false,
    createdAt: now,
    releasedAt: null,
    releasedVersionId: null,
  }
}

/** Builds a real, immediately-runnable Worker provisioned for a
 * Product (lib/products/catalog.ts) — the product layer's one
 * integration point with the existing Workforce OS. Everything below
 * this call is completely ordinary Worker machinery: same skills/
 * tools catalog, same runtime, same Studio, same execution ledger.
 *
 * Tailor-made is real here, not cosmetic: `domainProfileContent` (the
 * customer's actual business/audience/data/process answers, see
 * lib/products/domain-profile.ts) becomes this Worker's real Domain
 * Profile KnowledgeSource content, and `heuristics` becomes real
 * BehaviorRule entries — both already wired into every skill's
 * execute() (retrieveRelevantKnowledge() + buildSystemPrompt()), so
 * two customers of the same product genuinely get a different prompt,
 * not just a different display label. */
export function buildWorkerFromProduct(
  id: string,
  product: { id: string; name: string; workerRoleLabel: string; primarySkillId: string; secondarySkillIds: string[] },
  domainProfileContent: string,
  heuristics: { condition: string; action: string }[],
  mission: string,
): Worker {
  const now = Date.now()
  const chosenSkillIds = [product.primarySkillId, ...product.secondarySkillIds].filter((skillId) => SKILL_CATALOG.some((s) => s.id === skillId))
  const requiredToolIds = Array.from(new Set(chosenSkillIds.flatMap((skillId) => SKILL_CATALOG.find((s) => s.id === skillId)?.requiredTools ?? [])))
  const initials = product.name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "PW"

  const knowledge: KnowledgeSource[] = domainProfileContent.trim()
    ? [{ id: uid("kn"), name: "Domain Profile", type: "brand", documents: 1, addedAt: now, content: domainProfileContent.trim() }]
    : []

  const behaviors = heuristics.map((h) => ({
    id: uid("beh"),
    raw: `IF ${h.condition} → ${h.action}`,
    condition: h.condition,
    action: h.action,
  }))

  return {
    id,
    productId: product.id,
    identity: {
      name: product.name,
      role: product.workerRoleLabel,
      description: `The ${product.name} Worker, tailored to this organization's real Domain Profile.`,
      persona: "A focused operator — evidence-driven, cites its sources, applies this organization's real rules.",
      tone: ["Analytical", "Direct"],
      accent: "#5a6ef0",
      initials,
    },
    mission,
    objectives: [],
    knowledge,
    skills: skills(chosenSkillIds),
    tools: tools(requiredToolIds),
    behaviors,
    channels: channels([]),
    outcome: { primaryKPI: "Outputs produced", secondaryKPIs: ["Quality score", "Success rate"] },
    autonomy: "medium",
    status: "draft",
    tested: false,
    createdAt: now,
    releasedAt: null,
    releasedVersionId: null,
  }
}

/** An empty, unconfigured Worker for the "New worker" flow in Studio. */
export function buildEmptyWorker(id: string): Worker {
  const now = Date.now()
  return {
    id,
    identity: { name: "", role: "", description: "", persona: "", tone: [], accent: "#5a6ef0", initials: "NW" },
    mission: "",
    objectives: [],
    knowledge: [],
    skills: skills([]),
    tools: tools([]),
    behaviors: [],
    channels: channels([]),
    outcome: { primaryKPI: "", secondaryKPIs: [] },
    autonomy: "medium",
    status: "draft",
    tested: false,
    createdAt: now,
    releasedAt: null,
    releasedVersionId: null,
  }
}

/** The financial domain's foundation Worker (Phase D) — not auto-seeded
 * into any organization by anything in this codebase (same "no auto-
 * seed" principle as buildSeedWorker() below: an empty org must never
 * be silently populated). This function exists so the four real
 * financial skills have a real, immediately-runnable Worker to compose
 * them, and so a future explicit action (a seed route, Factory, or
 * Products onboarding — a decision for a later phase, see
 * docs/product-experience-blueprint.md §8) can wire one up without
 * having to invent the definition from scratch.
 *
 * Autonomy defaults to "low", not "medium" like buildSeedWorker()'s
 * Atlas — a financial worker's recommendations may eventually touch
 * real money; nothing in this domain should default to acting more
 * independently than a marketing worker does today. */
export function buildCashWorkingCapitalWorkerSeed(): Worker {
  const now = Date.now()
  const financeSkillIds = ["skill_cash_position_monitor", "skill_cash_forecast", "skill_working_capital_opportunity", "skill_receivables_risk"]
  return {
    id: "worker_ledger",
    identity: {
      name: "Ledger",
      role: "Cash & Working Capital Worker",
      description: "Monitors cash position, forecasts liquidity, and detects working-capital and receivables risk — every finding grounded in real (demo) financial data.",
      persona: "A careful treasury analyst — cites the specific numbers behind every finding, never speculates, never claims a payment or transfer happened.",
      tone: ["Analytical", "Concise", "Direct"],
      accent: "#10b981",
      initials: "LG",
    },
    mission: "Monitor cash position, forecast liquidity, and identify working-capital opportunities and receivables risk before they become a shortfall.",
    objectives: [
      { id: uid("obj"), text: "Monitor cash position across all connected accounts", done: true },
      { id: uid("obj"), text: "Ground every finding in real financial data", done: true },
      { id: uid("obj"), text: "Flag risk before it becomes a shortfall, never after", done: true },
    ],
    knowledge: knowledge([{ name: "Treasury policy", type: "playbook", documents: 1 }]),
    skills: skills(financeSkillIds),
    tools: tools(["tool_financial_data", "tool_llm"]),
    behaviors: [
      { id: uid("beh"), raw: "IF confidence < 70% → request human review", condition: "confidence < 70%", action: "request human review" },
      { id: uid("beh"), raw: "IF a required tool is not connected → block and explain why", condition: "a required tool is not connected", action: "block and explain why" },
    ],
    channels: channels([]),
    outcome: { primaryKPI: "Cash Preserved", secondaryKPIs: ["Liquidity Risk Exposure", "Working Capital Released"] },
    autonomy: "low",
    // "ready", not "live" — same reasoning as buildSeedWorker(): this
    // function only ever returns data. Whatever calls it is responsible
    // for a real Build + Release if it wants this worker live.
    status: "ready",
    tested: true,
    createdAt: now,
    releasedAt: null,
    releasedVersionId: null,
  }
}

export function buildSeedWorker(): Worker {
  const now = Date.now()
  return {
    id: "worker_atlas",
    identity: {
      name: "Atlas",
      role: "Marketing Intelligence Worker",
      description: "Researches real trends, analyzes content performance and engagement to guide growth decisions.",
      persona: "A senior marketing analyst — evidence-driven, cites its sources, never speculates.",
      tone: ["Analytical", "Concise", "Confident"],
      accent: "#5a6ef0",
      initials: "AT",
    },
    mission: "Find the most important trends in AI agents today.",
    objectives: [
      { id: uid("obj"), text: "Identify real, current trends", done: true },
      { id: uid("obj"), text: "Ground every finding in a real source", done: true },
    ],
    knowledge: knowledge([{ name: "Brand guidelines", type: "brand", documents: 9 }]),
    skills: skills(["skill_trend_research"]),
    tools: tools(["tool_web_search", "tool_llm"]),
    behaviors: [
      { id: uid("beh"), raw: "IF a required tool is not connected → block and explain why", condition: "a required tool is not connected", action: "block and explain why" },
    ],
    channels: channels(["web"]),
    outcome: { primaryKPI: "Qualified Leads", secondaryKPIs: ["Reach", "Engagement", "CTR", "Revenue"] },
    autonomy: "medium",
    // "ready", not "live": buildSeedWorker() only ever returns data — it
    // has no database access to create the real WorkerVersion row that
    // "live" requires. The seed route (app/api/seed/route.ts) builds and
    // releases a real version after inserting this, which is what
    // actually makes it live with a genuine releasedVersionId.
    status: "ready",
    tested: true,
    createdAt: now,
    releasedAt: null,
    releasedVersionId: null,
  }
}
