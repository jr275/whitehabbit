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

function skills(enabled: string[]): Skill[] {
  return SKILL_CATALOG.map((t) => ({ id: t.id, name: t.name, category: t.category, outputType: t.outputType, enabled: enabled.includes(t.id) }))
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
