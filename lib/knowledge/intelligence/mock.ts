/**
 * Deterministic preview dataset for the Knowledge Intelligence surfaces.
 *
 * This is NOT random and NOT persisted — it is a fixed, internally
 * consistent snapshot used to design and exercise the /knowledge
 * experience before the real intelligence backend exists. Concept ids,
 * item ids and theme ids are reused across surfaces so selection,
 * drawers and cross-links behave like the real thing.
 *
 * When the backend lands, this file is deleted and `client.ts` swaps its
 * imports for real fetches. Components never import this file directly.
 */

import type {
  ChangeEntry,
  Concept,
  ConnectionGraph,
  Contradiction,
  EmergingQuestion,
  Insight,
  KnowledgeGap,
  KnowledgeOverview,
  Signal,
  Theme,
  TimelineEvent,
} from "./types"

export const overview: KnowledgeOverview = {
  totalItems: 342,
  readItems: 289,
  favoriteItems: 48,
  conceptCount: 61,
  connectionCount: 137,
  openQuestionCount: 9,
  weeklySaves: [6, 9, 7, 12, 8, 14, 11, 17],
  topThemes: [
    { id: "t-ai", label: "Machine intelligence", weight: 1 },
    { id: "t-systems", label: "Systems design", weight: 0.72 },
    { id: "t-focus", label: "Attention & focus", weight: 0.54 },
    { id: "t-econ", label: "Market dynamics", weight: 0.41 },
  ],
}

export const signals: Signal[] = [
  { id: "s-saves", label: "Saved this week", value: 17, delta: 6, hint: "vs. 11 last week" },
  { id: "s-concepts", label: "New concepts", value: 4, delta: 1, hint: "distinct ideas detected" },
  { id: "s-connections", label: "Connections formed", value: 12, delta: -3, hint: "links across your library" },
  { id: "s-questions", label: "Open questions", value: 9, delta: 2, hint: "surfaced from your reading" },
]

export const concepts: Concept[] = [
  {
    id: "c-transformers",
    label: "Transformer architecture",
    kind: "technology",
    mentions: 23,
    strength: 0.94,
    summary:
      "The attention-based neural network architecture underlying most modern language models. Recurs across your ML reading as the connective tissue between older and newer material.",
    relatedConceptIds: ["c-attention", "c-scaling", "c-llm"],
    sourceItemIds: ["i-101", "i-114", "i-140"],
  },
  {
    id: "c-attention",
    label: "Attention mechanism",
    kind: "method",
    mentions: 18,
    strength: 0.81,
    summary:
      "The weighting method that lets models focus on relevant parts of an input. Appears both in your technical saves and, by analogy, in your notes on human focus.",
    relatedConceptIds: ["c-transformers", "c-focus"],
    sourceItemIds: ["i-101", "i-132"],
  },
  {
    id: "c-scaling",
    label: "Scaling laws",
    kind: "theory",
    mentions: 11,
    strength: 0.63,
    summary:
      "Empirical relationships between model size, data and performance. A recurring thread in the material you saved over the last two months.",
    relatedConceptIds: ["c-transformers", "c-llm"],
    sourceItemIds: ["i-114", "i-140"],
  },
  {
    id: "c-llm",
    label: "Large language models",
    kind: "technology",
    mentions: 27,
    strength: 0.88,
    summary:
      "The applied systems built on transformer architectures. Your most-referenced concept, bridging research articles and practical tooling notes.",
    relatedConceptIds: ["c-transformers", "c-scaling", "c-agents"],
    sourceItemIds: ["i-140", "i-151", "i-160"],
  },
  {
    id: "c-agents",
    label: "Autonomous agents",
    kind: "technology",
    mentions: 9,
    strength: 0.52,
    summary:
      "Systems that plan and act over multiple steps. A newer, rising area in your library with few connections so far — a likely growth edge.",
    relatedConceptIds: ["c-llm"],
    sourceItemIds: ["i-160"],
  },
  {
    id: "c-focus",
    label: "Deep work",
    kind: "theory",
    mentions: 14,
    strength: 0.6,
    summary:
      "Sustained, distraction-free concentration. The anchor of your productivity reading and an unexpected bridge to your notes on attention in ML.",
    relatedConceptIds: ["c-attention", "c-habits"],
    sourceItemIds: ["i-132", "i-180"],
  },
  {
    id: "c-habits",
    label: "Habit formation",
    kind: "theory",
    mentions: 10,
    strength: 0.44,
    summary:
      "How repeated behaviours become automatic. Clusters tightly with your deep-work material.",
    relatedConceptIds: ["c-focus"],
    sourceItemIds: ["i-180"],
  },
  {
    id: "c-markets",
    label: "Market microstructure",
    kind: "theory",
    mentions: 7,
    strength: 0.33,
    summary:
      "How trades, prices and liquidity actually form. A smaller, fairly isolated cluster in your library.",
    relatedConceptIds: [],
    sourceItemIds: ["i-201"],
  },
]

export const themes: Theme[] = [
  {
    id: "t-ai",
    label: "Machine intelligence",
    description:
      "Your largest and fastest-growing theme — from transformer internals to applied LLM tooling and, most recently, autonomous agents.",
    itemCount: 96,
    conceptIds: ["c-transformers", "c-attention", "c-scaling", "c-llm", "c-agents"],
    momentum: "rising",
    coverage: 0.42,
    children: [
      { id: "st-arch", label: "Architectures & internals", type: "subtheme", weight: 0.9 },
      { id: "st-scaling", label: "Scaling & capability", type: "subtheme", weight: 0.6 },
      { id: "st-agents", label: "Agents & tool use", type: "subtheme", weight: 0.4 },
      { id: "i-101", label: "Attention Is All You Need", type: "item", weight: 1 },
      { id: "i-160", label: "The rise of agentic systems", type: "item", weight: 0.5 },
    ],
  },
  {
    id: "t-systems",
    label: "Systems design",
    description:
      "Distributed systems, reliability and the architecture patterns you return to when building.",
    itemCount: 61,
    conceptIds: ["c-scaling"],
    momentum: "steady",
    coverage: 0.27,
    children: [
      { id: "st-dist", label: "Distributed consensus", type: "subtheme", weight: 0.7 },
      { id: "st-rel", label: "Reliability & failure", type: "subtheme", weight: 0.55 },
      { id: "i-114", label: "Designing data-intensive applications", type: "item", weight: 0.8 },
    ],
  },
  {
    id: "t-focus",
    label: "Attention & focus",
    description:
      "Productivity and cognition — deep work, habit formation, and the surprising echo of ML attention in human focus.",
    itemCount: 44,
    conceptIds: ["c-focus", "c-habits", "c-attention"],
    momentum: "steady",
    coverage: 0.19,
    children: [
      { id: "st-deep", label: "Deep work", type: "subtheme", weight: 0.8 },
      { id: "st-habit", label: "Habits & routines", type: "subtheme", weight: 0.5 },
      { id: "i-132", label: "Focus in an age of distraction", type: "item", weight: 0.7 },
    ],
  },
  {
    id: "t-econ",
    label: "Market dynamics",
    description:
      "A smaller, more isolated cluster on markets and economics — currently cooling and weakly connected to the rest of your library.",
    itemCount: 27,
    conceptIds: ["c-markets"],
    momentum: "cooling",
    coverage: 0.12,
    children: [
      { id: "st-micro", label: "Microstructure", type: "subtheme", weight: 0.4 },
      { id: "i-201", label: "How markets really clear", type: "item", weight: 0.5 },
    ],
  },
]

export const graph: ConnectionGraph = {
  nodes: [
    { id: "c-llm", label: "LLMs", type: "concept", weight: 0.88, x: 50, y: 34 },
    { id: "c-transformers", label: "Transformers", type: "concept", weight: 0.94, x: 32, y: 22 },
    { id: "c-attention", label: "Attention", type: "concept", weight: 0.81, x: 22, y: 44 },
    { id: "c-scaling", label: "Scaling laws", type: "concept", weight: 0.63, x: 46, y: 14 },
    { id: "c-agents", label: "Agents", type: "concept", weight: 0.52, x: 70, y: 30 },
    { id: "c-focus", label: "Deep work", type: "concept", weight: 0.6, x: 24, y: 70 },
    { id: "c-habits", label: "Habits", type: "concept", weight: 0.44, x: 16, y: 84 },
    { id: "c-markets", label: "Markets", type: "concept", weight: 0.33, x: 82, y: 74 },
    { id: "t-ai", label: "Machine intelligence", type: "theme", weight: 1, x: 52, y: 50 },
    { id: "t-focus", label: "Attention & focus", type: "theme", weight: 0.54, x: 30, y: 58 },
  ],
  edges: [
    { id: "e1", source: "c-transformers", target: "c-attention", kind: "supports", strength: 0.9 },
    { id: "e2", source: "c-transformers", target: "c-llm", kind: "extends", strength: 0.85 },
    { id: "e3", source: "c-scaling", target: "c-llm", kind: "supports", strength: 0.6 },
    { id: "e4", source: "c-llm", target: "c-agents", kind: "extends", strength: 0.55 },
    { id: "e5", source: "c-attention", target: "c-focus", kind: "relates", strength: 0.4 },
    { id: "e6", source: "c-focus", target: "c-habits", kind: "supports", strength: 0.5 },
    { id: "e7", source: "c-llm", target: "t-ai", kind: "relates", strength: 0.95 },
    { id: "e8", source: "c-focus", target: "t-focus", kind: "relates", strength: 0.8 },
    { id: "e9", source: "c-markets", target: "c-scaling", kind: "contradicts", strength: 0.3 },
  ],
}

export const timeline: TimelineEvent[] = [
  {
    id: "tl-1",
    daysAgo: 1,
    title: "Autonomous agents is emerging",
    kind: "concept-emerged",
    detail: "Three recent saves introduced a new concept cluster around agentic systems.",
    itemIds: ["i-160"],
  },
  {
    id: "tl-2",
    daysAgo: 4,
    title: "Machine intelligence overtook Systems design",
    kind: "theme-shift",
    detail: "Your largest theme by volume changed for the first time in two months.",
    itemIds: ["i-140", "i-151"],
  },
  {
    id: "tl-3",
    daysAgo: 9,
    title: "Saved 6 items in one sitting",
    kind: "saved",
    detail: "A focused research session on scaling laws.",
    itemIds: ["i-114", "i-140"],
  },
  {
    id: "tl-4",
    daysAgo: 21,
    title: "300th item saved",
    kind: "milestone",
    detail: "Your library crossed 300 saved pieces.",
    itemIds: [],
  },
  {
    id: "tl-5",
    daysAgo: 34,
    title: "Attention bridged two themes",
    kind: "concept-emerged",
    detail: "The attention concept began linking your ML and focus reading.",
    itemIds: ["i-101", "i-132"],
  },
]

export const questions: EmergingQuestion[] = [
  {
    id: "q-1",
    question: "Do scaling laws hold as you move from models to agents?",
    rationale:
      "You have deep material on scaling laws and a growing agents cluster, but nothing yet connecting the two.",
    confidence: 0.72,
    relatedConceptIds: ["c-scaling", "c-agents"],
    suggestedAsk: "Based on what I've saved, do scaling laws still apply to autonomous agents?",
  },
  {
    id: "q-2",
    question: "Is ML 'attention' a useful metaphor for human focus?",
    rationale: "Your attention concept links technical and productivity saves — an unresolved analogy.",
    confidence: 0.58,
    relatedConceptIds: ["c-attention", "c-focus"],
    suggestedAsk: "How does the attention mechanism in ML compare to human deep work in what I've saved?",
  },
  {
    id: "q-3",
    question: "Why is your markets reading so disconnected from everything else?",
    rationale: "Market microstructure is your most isolated cluster with only one weak, contradicting link.",
    confidence: 0.44,
    relatedConceptIds: ["c-markets"],
    suggestedAsk: "What connects my reading on markets to the rest of my library, if anything?",
  },
]

export const insights: Insight[] = [
  {
    id: "in-1",
    title: "Your ML reading is consolidating around applied systems",
    body: "Over the last month, saves shifted from architecture papers toward applied LLM tooling and agents. The theoretical core (transformers, attention) is now well-covered; new material builds on top of it rather than re-explaining it.",
    type: "trend",
    confidence: 0.79,
    evidenceItemIds: ["i-140", "i-151", "i-160"],
    conceptIds: ["c-llm", "c-agents"],
  },
  {
    id: "in-2",
    title: "Attention is a hidden bridge in your library",
    body: "The concept of attention appears in both your ML and productivity reading. It is one of the few ideas linking two otherwise separate themes, which makes it disproportionately central to how your knowledge connects.",
    type: "pattern",
    confidence: 0.66,
    evidenceItemIds: ["i-101", "i-132"],
    conceptIds: ["c-attention", "c-focus"],
  },
  {
    id: "in-3",
    title: "Market microstructure is an outlier cluster",
    body: "Your economics saves form a dense internal cluster with almost no links to the rest of your library. It reads as a separate interest rather than part of your main knowledge base.",
    type: "outlier",
    confidence: 0.71,
    evidenceItemIds: ["i-201"],
    conceptIds: ["c-markets"],
  },
]

export const gaps: KnowledgeGap[] = [
  {
    id: "g-1",
    label: "Agent evaluation",
    description: "You have material on what agents are, but nothing on how their performance is measured or benchmarked.",
    severity: "high",
    suggestion: "Save a survey on agent benchmarks to close the loop between capability and evaluation.",
    relatedThemeId: "t-ai",
  },
  {
    id: "g-2",
    label: "Failure modes of deep work",
    description: "Your focus reading is strongly pro deep-work with no counter-perspective on its limits or costs.",
    severity: "medium",
    suggestion: "Add a critical piece on when deep work breaks down or trades off against collaboration.",
    relatedThemeId: "t-focus",
  },
  {
    id: "g-3",
    label: "Systems ↔ ML overlap",
    description: "Your systems-design and ML themes rarely reference each other, despite obvious infrastructure overlap.",
    severity: "low",
    suggestion: "Look for material on serving and scaling ML systems to bridge the two themes.",
    relatedThemeId: "t-systems",
  },
]

export const contradictions: Contradiction[] = [
  {
    id: "x-1",
    topic: "Does model scale keep paying off?",
    a: {
      claim: "Performance improves predictably with scale — bigger is reliably better.",
      itemId: "i-140",
      sourceLabel: "Scaling laws for neural language models",
    },
    b: {
      claim: "Returns from raw scale are flattening; architecture and data quality now matter more.",
      itemId: "i-151",
      sourceLabel: "Beyond scale: what comes next",
    },
    status: "unresolved",
  },
  {
    id: "x-2",
    topic: "How much does focus depend on environment?",
    a: {
      claim: "Deep work is primarily a matter of trained discipline.",
      itemId: "i-180",
      sourceLabel: "The habit of focus",
    },
    b: {
      claim: "Focus is mostly determined by environment and removing distraction.",
      itemId: "i-132",
      sourceLabel: "Focus in an age of distraction",
    },
    status: "reviewing",
  },
]

export const changes: ChangeEntry[] = [
  { id: "ch-1", daysAgo: 1, type: "concept-added", summary: "New concept detected: Autonomous agents", refId: "c-agents" },
  { id: "ch-2", daysAgo: 2, type: "connection-formed", summary: "LLMs now linked to Autonomous agents", refId: "e4" },
  { id: "ch-3", daysAgo: 4, type: "theme-rising", summary: "Machine intelligence is rising fastest this month", refId: "t-ai" },
  { id: "ch-4", daysAgo: 6, type: "insight-generated", summary: "New insight: ML reading is consolidating around applied systems", refId: "in-1" },
  { id: "ch-5", daysAgo: 9, type: "gap-detected", summary: "Gap detected: Agent evaluation", refId: "g-1" },
  { id: "ch-6", daysAgo: 13, type: "connection-formed", summary: "Attention now bridges ML and focus themes", refId: "e5" },
]
