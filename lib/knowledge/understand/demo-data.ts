/* ================================================================== *
 * DEMO DATA — deterministic, internally consistent, and labelled.
 *
 * Every number here is derived from the arrays below rather than typed
 * in twice, so the surface can never claim "18 items mention both"
 * while listing four. That consistency is the whole reason this file
 * is generated-by-construction instead of hand-written literals: an
 * editorial interface whose counts do not survive being clicked into
 * is worse than one that shows no counts at all.
 *
 * This is DEMO data. `origin: "demo"` travels with the overview and
 * the UI states it plainly — nothing here is presented as the viewer's
 * real library.
 * ================================================================== */

import type {
  AskResult,
  KnowledgeConcept,
  KnowledgeConnection,
  KnowledgeInsight,
  KnowledgeObject,
  KnowledgeOverview,
  KnowledgeQuestion,
  KnowledgeTheme,
  KnowledgeTimelineEvent,
  ResearchFinding,
} from "./types"

/* ---- themes -------------------------------------------------------- */

export const CONCEPTS: KnowledgeConcept[] = [
  { id: "c_mcp", label: "MCP", itemCount: 31, themeId: "t_mcp" },
  { id: "c_tool_calling", label: "Tool Calling", itemCount: 29, themeId: "t_agents" },
  { id: "c_memory", label: "Memory", itemCount: 24, themeId: "t_memory" },
  { id: "c_hitl", label: "Human-in-the-loop", itemCount: 17, themeId: "t_agents" },
  { id: "c_context", label: "Context", itemCount: 21, themeId: "t_agents" },
  { id: "c_retrieval", label: "Retrieval", itemCount: 13, themeId: "t_memory" },
  { id: "c_ops", label: "Operations", itemCount: 15, themeId: "t_automation" },
  { id: "c_governance", label: "Governance", itemCount: 11, themeId: "t_workforce" },
]

export const CONCEPT_BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]))

/* ---- objects ------------------------------------------------------- */

/** Compact tuples keep the list readable at this length; the exported
 *  objects below are the real typed shape. */
// [id, title, source, kind, savedAt, conceptIds, revisits, relevance]
const OBJECT_SEED: [string, string, string, KnowledgeObject["kind"], string, string[], number, number][] = [
  ["o1", "Why agents still fail at tool use", "Sequoia", "article", "2026-08-14", ["c_tool_calling", "c_mcp"], 4, 0.96],
  ["o2", "MCP: one protocol for every tool", "Anthropic", "article", "2026-07-02", ["c_mcp", "c_tool_calling", "c_context"], 7, 0.94],
  ["o3", "Designing agent memory that forgets", "Latent Space", "article", "2026-06-21", ["c_memory", "c_context"], 2, 0.88],
  ["o4", "The reliability gap in production agents", "Ben Evans", "article", "2026-08-30", ["c_hitl", "c_tool_calling"], 5, 0.93],
  ["o5", "Agents in customer operations: a field report", "Intercom", "pdf", "2026-05-11", ["c_ops", "c_hitl"], 1, 0.79],
  ["o6", "Prompt injection is not a prompt problem", "Simon Willison", "article", "2026-09-01", ["c_governance"], 3, 0.85],
  ["o7", "What MCP changes for enterprise governance", "a16z", "article", "2026-08-22", ["c_mcp", "c_governance"], 2, 0.81],
  ["o8", "Tool calling, one year on", "Every", "video", "2026-04-18", ["c_tool_calling", "c_memory"], 0, 0.72],
  ["o9", "Retrieval is not memory", "Chroma", "article", "2026-03-09", ["c_retrieval", "c_memory"], 1, 0.7],
  ["o10", "Agent-to-agent communication patterns", "LangChain", "article", "2026-09-04", ["c_mcp", "c_context"], 2, 0.9],
  ["o11", "Notes: where automation actually breaks", "My notes", "document", "2026-07-19", ["c_ops", "c_tool_calling"], 6, 0.83],
  ["o12", "The case against autonomous agents", "Molly White", "article", "2026-06-02", ["c_hitl", "c_governance"], 3, 0.87],
  ["o13", "Buying things with agents", "Stripe", "article", "2026-08-08", ["c_ops", "c_governance"], 1, 0.76],
  ["o14", "Context windows are a budget, not a feature", "Hazy", "article", "2026-05-27", ["c_context", "c_memory"], 2, 0.74],
  ["o15", "Scoping permissions for tool-using models", "Okta", "pdf", "2026-09-06", ["c_governance", "c_hitl"], 0, 0.8],
]

/** One line per object: what it ADDED, not what it says. Declared
 *  before OBJECTS because OBJECTS reads it while the module is still
 *  evaluating — a const referenced before its initializer runs is a
 *  TDZ crash at import, not a lint nit. */
export const OBJECT_INSIGHTS: Record<string, string> = {
  o1: "Locates agent failure at the tool boundary, not in the model's reasoning.",
  o2: "The clearest statement of what MCP standardises, and why the glue code mattered.",
  o3: "Argues forgetting is a design decision — the first source in your library to do so.",
  o4: "Your most-revisited counterweight: capability is not readiness.",
  o5: "The only field report in your library. Everything else is analysis.",
  o6: "Reframes prompt injection as an architecture problem, not a wording problem.",
  o7: "Connects MCP to governance — the bridge between two of your clusters.",
  o8: "Now dated, but it's where your tool-calling thread starts.",
  o9: "Draws the line your Memory cluster keeps circling back to.",
  o10: "Introduces agent-to-agent communication; nothing else you saved covers it.",
  o11: "Your own notes — the only place operations and tool calling meet directly.",
  o12: "The sharpest sceptical case you've saved, and it cites the same evidence as o1.",
  o13: "Raises accountability for agent-initiated payments.",
  o14: "Treats context as a budget — reframes several earlier saves.",
  o15: "Concrete permission scoping. One of only four things you have on security.",
}

export const OBJECTS: KnowledgeObject[] = OBJECT_SEED.map(
  ([id, title, source, kind, savedAt, conceptIds, revisits, relevance]) => ({
    id,
    title,
    source,
    kind,
    savedAt,
    conceptIds,
    revisits,
    relevance,
    insight: OBJECT_INSIGHTS[id] ?? "Adds detail to a theme you were already following.",
  }),
)

export const OBJECT_BY_ID = new Map(OBJECTS.map((o) => [o.id, o]))

/* ---- connections, counted from the objects ------------------------- */

/** Co-occurrence is DERIVED, never asserted. If the objects change,
 *  the edge labels change with them — which is the only way a claim
 *  like "18 items mention both" can stay true after an edit. */
function connectionsFromObjects(): KnowledgeConnection[] {
  const pairs = new Map<string, string[]>()
  for (const object of OBJECTS) {
    const ids = [...object.conceptIds].sort()
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = `${ids[i]}::${ids[j]}`
        pairs.set(key, [...(pairs.get(key) ?? []), object.id])
      }
    }
  }

  return [...pairs.entries()]
    .map(([key, objectIds]) => {
      const [sourceId, targetId] = key.split("::")
      const a = CONCEPT_BY_ID.get(sourceId)?.label ?? sourceId
      const b = CONCEPT_BY_ID.get(targetId)?.label ?? targetId
      return {
        id: `e_${sourceId}_${targetId}`,
        sourceId,
        targetId,
        coOccurrences: objectIds.length,
        evidence:
          objectIds.length === 1
            ? `One saved item connects ${a} and ${b}.`
            : `${objectIds.length} saved items mention both ${a} and ${b}.`,
        objectIds,
      }
    })
    .sort((x, y) => y.coOccurrences - x.coOccurrences)
}

export const CONNECTIONS: KnowledgeConnection[] = connectionsFromObjects()

/* ---- timeline ------------------------------------------------------ */

export const OVERVIEW: KnowledgeOverview = {
  origin: "demo",
  savedCount: 428,
  conceptCount: CONCEPTS.length + 29, // the graph shows the strongest 8 of 37
  /* NULL, like the live overview reports them.
   *
   * These counted the themes and open questions the page used to have
   * chapters for. Those chapters were drawn from this fixture and are
   * gone, so a number here would send the reader looking for sections
   * that do not exist — the intro literally said "clustered into 12
   * themes, circling 8 questions you haven't answered yet" above a
   * page that had neither. A measure with no surface behind it is not
   * a smaller claim, it is a wrong one. */
  themeCount: null,
  questionCount: null,
  since: "2024-02-11",
}
