/**
 * Representative Knowledge content for the first high-fidelity UI.
 *
 * This is demonstration data only — it is NOT a mock API. The exported
 * accessor functions mirror the shape a real data layer would expose, so
 * screens can later read from the Knowledge API with no structural changes.
 */

import type { Collection, Insight, KnowledgeItem, Topic } from "./types"

const C = "/knowledge/covers"

export const knowledgeItems: KnowledgeItem[] = [
  {
    id: "k-agents",
    kind: "article",
    state: "ready",
    readState: "unread",
    favorite: true,
    title: "The Future of AI Agents",
    excerpt:
      "Agents are moving from single-shot assistants into systems that plan, act and coordinate across tools.",
    aiSummary:
      "AI agents are evolving from simple assistants into systems capable of planning, executing and coordinating complex tasks across many tools.",
    source: "The Verge",
    author: "Casey Newton",
    cover: `${C}/ai-agents.png`,
    domain: "theverge.com",
    topics: ["AI", "Agents", "Automation"],
    collectionIds: ["col-agents", "col-tech"],
    durationMin: 8,
    savedAt: "2026-08-30",
  },
  {
    id: "k-second-brain",
    kind: "article",
    state: "ready",
    readState: "unread",
    favorite: false,
    title: "Building a Second Brain",
    excerpt:
      "A method for capturing, organizing and resurfacing the ideas you encounter so they compound over time.",
    aiSummary:
      "Your job as a note-taker is to preserve ideas so they survive the journey into the future — knowledge that compounds instead of fading away.",
    source: "Forte Labs",
    author: "Tiago Forte",
    cover: `${C}/second-brain.png`,
    domain: "fortelabs.com",
    topics: ["Productivity", "Systems", "Learning"],
    collectionIds: ["col-product"],
    durationMin: 24,
    savedAt: "2026-08-29",
  },
  {
    id: "k-pmf",
    kind: "article",
    state: "ready",
    readState: "read",
    favorite: false,
    title: "Superhuman's Product-Market Fit Framework",
    excerpt:
      "How to make product-market fit measurable instead of a feeling you wait to arrive.",
    aiSummary:
      "A repeatable framework that turns product-market fit into a measurable metric you can engineer toward, using the 'very disappointed' survey.",
    source: "First Round Review",
    author: "Rahul Vohra",
    cover: `${C}/product-strategy.png`,
    domain: "firstround.com",
    topics: ["Product", "Startups", "Growth"],
    collectionIds: ["col-product", "col-startups"],
    durationMin: 18,
    savedAt: "2026-08-28",
  },
  {
    id: "k-wealth",
    kind: "social",
    state: "ready",
    readState: "read",
    favorite: true,
    title: "How to Get Rich (without getting lucky)",
    excerpt:
      "Seek wealth, not money or status. Wealth is assets that earn while you sleep.",
    source: "X · @naval",
    author: "Naval Ravikant",
    cover: `${C}/wealth.png`,
    domain: "x.com",
    topics: ["Wealth", "Leverage", "Startups"],
    collectionIds: ["col-startups"],
    durationMin: 3,
    savedAt: "2026-08-27",
  },
  {
    id: "k-agents-podcast",
    kind: "podcast",
    state: "ready",
    readState: "unread",
    favorite: false,
    title: "Inside the Agent Stack",
    excerpt:
      "A conversation on orchestration, memory and evaluation for production agent systems.",
    aiSummary:
      "The hosts break down how teams are wiring planning, tool-use and evaluation together to ship reliable agents.",
    source: "Latent Space",
    author: "swyx & Alessio",
    cover: `${C}/technology.png`,
    domain: "latent.space",
    topics: ["AI", "Agents", "Engineering"],
    collectionIds: ["col-agents", "col-tech"],
    durationMin: 62,
    savedAt: "2026-08-26",
  },
  {
    id: "k-wellness",
    kind: "article",
    state: "ready",
    readState: "unread",
    favorite: false,
    title: "We've Reached Peak Wellness. Most of It Is Nonsense.",
    excerpt:
      "The wellness industry keeps expanding, but the fundamentals barely change.",
    aiSummary:
      "A sharp look at how the wellness industry markets complexity while the durable basics — sleep, movement, connection — do the real work.",
    source: "Outside",
    author: "Brad Stulberg",
    cover: `${C}/wellness.png`,
    domain: "outsideonline.com",
    topics: ["Wellness", "Health"],
    collectionIds: [],
    durationMin: 20,
    savedAt: "2026-08-25",
  },
  {
    id: "k-rio",
    kind: "video",
    state: "ready",
    readState: "unread",
    favorite: true,
    title: "48 Hours on the Coast",
    excerpt:
      "A cinematic guide to the beaches, viewpoints and neighbourhoods worth your time.",
    aiSummary:
      "A travel film mapping a two-day route through a coastal city — where to watch sunrise, eat, and wander between beaches.",
    source: "YouTube",
    author: "Kraig Adams",
    cover: `${C}/travel-coast.png`,
    domain: "youtube.com",
    topics: ["Travel", "Film"],
    collectionIds: ["col-travel"],
    durationMin: 14,
    savedAt: "2026-08-24",
  },
  {
    id: "k-chip",
    kind: "article",
    state: "ready",
    readState: "unread",
    favorite: false,
    title: "The Machines That Make the Machines",
    excerpt:
      "A rare look inside the fabs producing the most advanced silicon on earth.",
    aiSummary:
      "How a handful of factories and one lithography company underpin the entire modern computing supply chain.",
    source: "MIT Technology Review",
    author: "Will Douglas Heaven",
    cover: `${C}/technology.png`,
    domain: "technologyreview.com",
    topics: ["Technology", "Hardware"],
    collectionIds: ["col-tech"],
    durationMin: 12,
    savedAt: "2026-08-23",
  },
  {
    id: "k-design",
    kind: "pdf",
    state: "ready",
    readState: "unread",
    favorite: false,
    title: "Quiet Interiors — A Field Guide",
    excerpt:
      "Notes on warmth, proportion and material for calmer living spaces.",
    aiSummary:
      "A visual reference on using natural materials, soft daylight and restrained proportion to design calm rooms.",
    source: "Document",
    cover: `${C}/design.png`,
    domain: "PDF · 3.2 MB",
    topics: ["Design", "Architecture"],
    collectionIds: [],
    durationMin: 9,
    savedAt: "2026-08-22",
  },
  {
    id: "k-processing",
    kind: "article",
    state: "processing",
    phase: "understanding",
    readState: "unread",
    favorite: false,
    title: "The Economics of Inference",
    source: "Stratechery",
    author: "Ben Thompson",
    domain: "stratechery.com",
    topics: ["AI", "Business"],
    collectionIds: [],
    savedAt: "2026-08-31",
  },
  {
    id: "k-note",
    kind: "document",
    state: "ready",
    readState: "read",
    favorite: false,
    title: "Reading notes — Thinking in Systems",
    excerpt:
      "Stocks, flows and feedback loops. Where leverage points actually live.",
    aiSummary:
      "Personal notes distilling Meadows' core idea: intervene at the level of goals and paradigms, not parameters.",
    source: "My notes",
    domain: "Note",
    topics: ["Systems", "Learning"],
    collectionIds: ["col-product"],
    durationMin: 5,
    savedAt: "2026-08-21",
  },
  {
    id: "k-failed",
    kind: "article",
    state: "failed",
    readState: "unread",
    favorite: false,
    title: "Untitled saved link",
    source: "example.com",
    domain: "example.com",
    topics: [],
    collectionIds: [],
    savedAt: "2026-08-20",
  },
]

export const collections: Collection[] = [
  {
    id: "col-agents",
    name: "AI Agents",
    auto: true,
    description: "Everything you're saving about autonomous systems.",
    itemCount: 7,
    covers: [`${C}/ai-agents.png`, `${C}/technology.png`, `${C}/product-strategy.png`],
    accent: "blue",
  },
  {
    id: "col-product",
    name: "Product Strategy",
    auto: true,
    description: "Frameworks, notes and playbooks.",
    itemCount: 5,
    covers: [`${C}/product-strategy.png`, `${C}/second-brain.png`, `${C}/design.png`],
    accent: "green",
  },
  {
    id: "col-startups",
    name: "Startups",
    auto: true,
    itemCount: 4,
    covers: [`${C}/wealth.png`, `${C}/product-strategy.png`],
    accent: "amber",
  },
  {
    id: "col-tech",
    name: "Technology",
    auto: true,
    itemCount: 6,
    covers: [`${C}/technology.png`, `${C}/ai-agents.png`],
    accent: "blue",
  },
  {
    id: "col-travel",
    name: "Travel",
    auto: false,
    itemCount: 3,
    covers: [`${C}/travel-coast.png`],
    accent: "neutral",
  },
  {
    id: "col-research",
    name: "Research",
    auto: false,
    itemCount: 2,
    covers: [`${C}/second-brain.png`],
    accent: "neutral",
  },
]

export const topics: Topic[] = [
  { id: "t-ai", label: "AI", count: 12, momentum: 0.95 },
  { id: "t-agents", label: "Agents", count: 7, momentum: 0.9 },
  { id: "t-product", label: "Product", count: 6, momentum: 0.5 },
  { id: "t-startups", label: "Startups", count: 5, momentum: 0.55 },
  { id: "t-tech", label: "Technology", count: 9, momentum: 0.6 },
  { id: "t-systems", label: "Systems", count: 4, momentum: 0.3 },
  { id: "t-travel", label: "Travel", count: 3, momentum: 0.2 },
  { id: "t-wellness", label: "Wellness", count: 3, momentum: 0.15 },
  { id: "t-design", label: "Design", count: 4, momentum: 0.35 },
]

export const insights: Insight[] = [
  {
    id: "in-1",
    kind: "connection",
    body: "These two pieces discuss the same idea — that reliable agents live or die on evaluation — from different angles.",
    relatedItemIds: ["k-agents", "k-agents-podcast"],
  },
  {
    id: "in-2",
    kind: "trend",
    body: "You've saved 7 pieces about AI agents recently. It's becoming your strongest theme this month.",
    relatedItemIds: ["k-agents", "k-agents-podcast", "k-chip"],
  },
  {
    id: "in-3",
    kind: "revisit",
    body: "You haven't revisited Product Strategy in four months, but you keep saving into it.",
    relatedItemIds: ["k-pmf", "k-second-brain"],
  },
]

/* ── Accessors (mirror a future async data layer) ──────────────── */

export function getKnowledgeItems(): KnowledgeItem[] {
  return knowledgeItems
}

export function getCollections(): Collection[] {
  return collections
}

export function getTopics(): Topic[] {
  return topics
}

export function getInsights(): Insight[] {
  return insights
}

export function getSavedThisWeek(): number {
  return 18
}
