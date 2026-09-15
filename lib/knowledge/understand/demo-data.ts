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

export const THEMES: KnowledgeTheme[] = [
  {
    id: "t_agents",
    label: "AI Agents",
    summary: "Systems that plan, call tools and act — and what makes them trustworthy enough to ship.",
    itemCount: 47,
    sourceCount: 19,
    conceptIds: ["c_mcp", "c_tool_calling", "c_memory", "c_hitl", "c_context"],
    recentActivity: "14 saves in the last 3 months",
    emergingQuestionId: "q_reliable",
    intensity: 1,
  },
  {
    id: "t_mcp",
    label: "MCP",
    summary: "The protocol layer standardising how models reach tools and data.",
    itemCount: 31,
    sourceCount: 14,
    conceptIds: ["c_mcp", "c_tool_calling", "c_context", "c_governance"],
    recentActivity: "8 saves in the last month",
    emergingQuestionId: "q_mcp_arch",
    intensity: 0.82,
  },
  {
    id: "t_memory",
    label: "Agent Memory",
    summary: "What an agent carries between turns, and what it should be allowed to forget.",
    itemCount: 24,
    sourceCount: 11,
    conceptIds: ["c_memory", "c_context", "c_retrieval"],
    recentActivity: "5 saves this quarter",
    intensity: 0.64,
  },
  {
    id: "t_automation",
    label: "Automation",
    summary: "Where deterministic workflows end and model-driven work begins.",
    itemCount: 22,
    sourceCount: 12,
    conceptIds: ["c_tool_calling", "c_hitl", "c_ops"],
    recentActivity: "3 saves this quarter",
    intensity: 0.55,
  },
  {
    id: "t_workforce",
    label: "AI Workforce",
    summary: "Agents as coworkers — scoping, supervising and measuring them.",
    itemCount: 18,
    sourceCount: 9,
    conceptIds: ["c_hitl", "c_ops", "c_governance"],
    recentActivity: "6 saves this quarter",
    emergingQuestionId: "q_customer_ops",
    intensity: 0.48,
  },
  {
    id: "t_security",
    label: "Agent Security",
    summary: "Prompt injection, permission scoping, and what an agent must never be able to do.",
    itemCount: 4,
    sourceCount: 3,
    conceptIds: ["c_governance", "c_hitl"],
    recentActivity: "1 save this quarter",
    intensity: 0.14,
  },
  {
    id: "t_commerce",
    label: "Agentic Commerce",
    summary: "Agents that transact — and who is accountable when they do.",
    itemCount: 9,
    sourceCount: 6,
    conceptIds: ["c_ops", "c_governance"],
    recentActivity: "4 saves this month",
    intensity: 0.32,
  },
]

/* ---- concepts ------------------------------------------------------ */

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
export const THEME_BY_ID = new Map(THEMES.map((t) => [t.id, t]))

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

export const TIMELINE: KnowledgeTimelineEvent[] = [
  {
    id: "tl1",
    year: 2024,
    label: "AI Agents",
    themeId: "t_agents",
    detail: "The first cluster. Mostly “what is an agent” explainers — orientation, not depth.",
    itemCount: 9,
    objectIds: ["o8"],
  },
  {
    id: "tl2",
    year: 2025,
    label: "MCP",
    themeId: "t_mcp",
    detail: "Interest narrows from agents-in-general to how they actually reach tools.",
    itemCount: 12,
    objectIds: ["o2", "o8"],
  },
  {
    id: "tl3",
    year: 2025,
    label: "Agent Memory",
    themeId: "t_memory",
    detail: "A second front opens: what an agent carries between turns.",
    itemCount: 7,
    objectIds: ["o3", "o9", "o14"],
  },
  {
    id: "tl4",
    year: 2026,
    label: "AI Workforce",
    themeId: "t_workforce",
    detail: "The framing shifts from capability to supervision — agents as coworkers.",
    itemCount: 11,
    objectIds: ["o5", "o12"],
  },
  {
    id: "tl5",
    year: 2026,
    label: "Agentic Commerce",
    themeId: "t_commerce",
    detail: "Agents that spend money, and who answers for it.",
    itemCount: 9,
    objectIds: ["o13"],
  },
  {
    id: "tl6",
    year: 2026,
    label: "Agent Security",
    themeId: "t_security",
    detail: "Newest and thinnest. Four saves against a question the rest of the library keeps raising.",
    itemCount: 4,
    objectIds: ["o6", "o15"],
  },
]

/* ---- questions ----------------------------------------------------- */

export const QUESTIONS: KnowledgeQuestion[] = [
  {
    id: "q_reliable",
    question: "What actually makes an AI agent reliable enough to ship?",
    themeIds: ["t_agents", "t_automation"],
    supportingCount: 14,
  },
  {
    id: "q_mcp_arch",
    question: "How is MCP changing the shape of agent architecture?",
    themeIds: ["t_mcp", "t_agents"],
    supportingCount: 11,
  },
  {
    id: "q_customer_ops",
    question: "Could agents take over parts of customer operations?",
    themeIds: ["t_workforce", "t_automation"],
    supportingCount: 8,
  },
  {
    id: "q_memory_limit",
    question: "Where does retrieval stop being a substitute for memory?",
    themeIds: ["t_memory"],
    supportingCount: 6,
  },
  {
    id: "q_trust",
    question: "Who is accountable when an agent acts on your behalf?",
    themeIds: ["t_commerce", "t_workforce"],
    supportingCount: 5,
  },
]

export const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]))

/* ---- insights ------------------------------------------------------ */

export const INSIGHTS: KnowledgeInsight[] = [
  {
    id: "i_converge",
    kind: "recurring_theme",
    headline: "Fourteen saves, one unresolved problem",
    body:
      "You've saved 14 articles about AI agents in the last three months. Most of them converge on the same unresolved question: how do agents use tools reliably enough to trust in production?",
    callToAction: "Explore this pattern",
    themeIds: ["t_agents"],
    detail: { kind: "plain" },
  },
  {
    id: "i_gap",
    kind: "knowledge_gap",
    headline: "You've circled security without reading it",
    body:
      "Agent Security comes up in your saved items about governance and human oversight, but you've only saved four things about it directly — the thinnest cluster in your library, against one of the most-raised questions in it.",
    callToAction: "Research this gap",
    themeIds: ["t_security", "t_agents"],
    detail: {
      kind: "knowledge_gap",
      explored: ["AI Agents", "MCP", "Tool Calling", "Agent Memory"],
      missing: ["Agent Security", "Permission scoping"],
    },
  },
  {
    id: "i_contradiction",
    kind: "contradiction",
    headline: "Two things you saved disagree",
    body:
      "Your library holds both sides of a live argument about whether agents are ready for production work. Neither source is wrong; they're measuring different things.",
    callToAction: "Explore the contradiction",
    themeIds: ["t_agents", "t_automation"],
    detail: {
      kind: "contradiction",
      claimA: {
        statement: "AI agents will replace a large share of software workflows within two years.",
        source: "Sequoia",
        savedAt: "2026-08-14",
      },
      claimB: {
        statement: "Agents remain too unreliable for unsupervised production work.",
        source: "Ben Evans",
        savedAt: "2026-08-30",
      },
    },
  },
  {
    id: "i_changed",
    kind: "changed_interest",
    headline: "What the newest MCP piece actually adds",
    body:
      "You already had eight sources on MCP. The one you saved on 4 September repeats most of what you knew and adds two things you had nothing on.",
    callToAction: "See what's new",
    themeIds: ["t_mcp"],
    detail: {
      kind: "changed_interest",
      sourceCount: 8,
      alreadyKnown: ["Tool calling", "Context sharing", "Protocol standardization"],
      newlyAdded: ["Agent-to-agent communication", "Enterprise governance"],
    },
  },
  {
    id: "i_connection",
    kind: "new_connection",
    headline: "Memory and governance started overlapping",
    body:
      "Until June these were separate clusters. Three recent saves discuss what an agent is allowed to remember — a question that belongs to both.",
    callToAction: "See the connection",
    themeIds: ["t_memory", "t_workforce"],
    detail: { kind: "plain" },
  },
  {
    id: "i_shift",
    kind: "changed_interest",
    headline: "Your attention moved from capability to control",
    body:
      "In 2024 you saved explainers about what agents can do. Since June, most saves are about supervising, scoping and constraining them.",
    callToAction: "See the shift",
    themeIds: ["t_workforce", "t_agents"],
    detail: { kind: "plain" },
  },
]

/* ---- overview, derived --------------------------------------------- */

export const OVERVIEW: KnowledgeOverview = {
  origin: "demo",
  savedCount: 428,
  conceptCount: CONCEPTS.length + 29, // the graph shows the strongest 8 of 37
  themeCount: THEMES.length + 5,
  questionCount: QUESTIONS.length + 3,
  since: "2024-02-11",
}

/* ---- ask ----------------------------------------------------------- */

export const ASK_SUGGESTIONS = [
  "What do I know about AI agents?",
  "What did I save about MCP this month?",
  "Where does my library disagree with itself?",
  "What have I been learning this year?",
]

export function askResultFor(question: string): AskResult {
  return {
    question,
    answer: [
      "You've saved 47 items related to AI agents, from 19 distinct sources, across just over two years.",
      "Three ideas appear repeatedly: how agents call tools, what they remember between turns, and where a human stays in the loop. Tool use is the most cited and the least settled — it appears in 29 of the 47.",
      "Your sources agree far more about capability than about readiness. The strongest signal in your library is not what agents can do; it is that reliability is still the open question.",
    ],
    recurringIdeas: ["Tool use", "Memory", "Human oversight"],
    evidence: [
      {
        objectId: "o1",
        title: "Why agents still fail at tool use",
        source: "Sequoia",
        excerpt: "Failure concentrates at the boundary: the model picks the right tool and calls it with the wrong shape.",
      },
      {
        objectId: "o4",
        title: "The reliability gap in production agents",
        source: "Ben Evans",
        excerpt: "The demo works. The tenth run is what decides whether the thing ships.",
      },
      {
        objectId: "o2",
        title: "MCP: one protocol for every tool",
        source: "Anthropic",
        excerpt: "A shared protocol removes the per-integration glue that most agent failures were hiding in.",
      },
    ],
    relatedObjectIds: ["o8", "o10", "o12"],
    connectedConceptIds: ["c_tool_calling", "c_memory", "c_hitl"],
  }
}

/* ---- research ------------------------------------------------------ */

export const RESEARCH_SUGGESTIONS = [
  "How is MCP changing AI agents?",
  "What does agent security actually require?",
  "Are agents reliable enough for customer operations?",
]

export function researchFindingFor(objective: string): ResearchFinding {
  return {
    existingSourceCount: 8,
    existingSummary:
      "Your library approaches this through tool calling and context sharing — how a model reaches what it needs.",
    webSourceCount: 24,
    webSummary:
      "Recent writing has moved past that to how agents coordinate with each other, and what an enterprise has to govern when they do.",
    whatChanged: [
      "Agent-to-agent communication is now the dominant framing; your sources predate it.",
      "Enterprise governance appears in most recent coverage and in none of your eight.",
      "Tool calling itself is treated as settled — the argument moved on.",
    ],
    sources: [
      { title: "MCP: one protocol for every tool", domain: "anthropic.com", isNew: false },
      { title: "What MCP changes for enterprise governance", domain: "a16z.com", isNew: false },
      { title: "Agent-to-agent communication patterns", domain: "langchain.dev", isNew: false },
      { title: "Multi-agent coordination in practice", domain: "arxiv.org", isNew: true },
      { title: "Governing tool access at enterprise scale", domain: "okta.com", isNew: true },
      { title: "The protocol wars are over", domain: "every.to", isNew: true },
    ],
  }
}
