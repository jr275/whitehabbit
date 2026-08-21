/* ================================================================== *
 * CHARACTER DATA — the centralized source of truth.
 *
 * Atlas is the seed Worker every surface shares. Archetypes,
 * specializations and the skill-tree catalog are defined here once so
 * Studio, Overview, Simulations, Ship, Outcomes and Evolve all speak
 * about the same character.
 * ================================================================== */

import {
  type Archetype,
  type CharacterWorker,
  type SkillCategory,
  type SkillNode,
  type Specialization,
  type WorkerOutcome,
  type Simulation,
} from "./character-model"

/* ------------------------------------------------------------------ *
 * SPECIALIZATIONS
 * ------------------------------------------------------------------ */
export const SPECIALIZATIONS: Specialization[] = [
  // SALES
  {
    id: "enterprise_prospecting",
    name: "Enterprise Prospecting",
    group: "Sales",
    description: "Finds and qualifies large, complex accounts with multiple stakeholders.",
    recommendedSkills: ["research.intel", "research.competitive", "reasoning.scoring"],
    boosts: { research: 0.5, reasoning: 0.4 },
    outputTypes: ["Prospects researched", "Accounts analyzed", "Qualified opportunities"],
  },
  {
    id: "outbound_intelligence",
    name: "Outbound Intelligence",
    group: "Sales",
    description: "Runs precise, research-led outbound with high personalization.",
    recommendedSkills: ["comm.email", "comm.dm", "research.web"],
    boosts: { communication: 0.5, research: 0.3 },
    outputTypes: ["Emails generated", "DMs sent", "Meetings scheduled"],
  },
  {
    id: "inbound_qualification",
    name: "Inbound Qualification",
    group: "Sales",
    description: "Triages and qualifies inbound demand at speed.",
    recommendedSkills: ["reasoning.scoring", "comm.email"],
    boosts: { reasoning: 0.5, communication: 0.3 },
    outputTypes: ["Leads qualified", "Meetings scheduled"],
  },
  {
    id: "account_intelligence",
    name: "Account Intelligence",
    group: "Sales",
    description: "Builds deep, living intelligence on target accounts and buying groups.",
    recommendedSkills: ["research.data", "research.intel", "reasoning.synthesis"],
    boosts: { research: 0.4, reasoning: 0.4 },
    outputTypes: ["Account briefs", "Buying-group maps"],
  },
  // CONTENT
  {
    id: "editorial",
    name: "Editorial",
    group: "Content",
    description: "Produces long-form written content with a consistent editorial standard.",
    recommendedSkills: ["comm.email", "reasoning.synthesis"],
    boosts: { communication: 0.5, reasoning: 0.3 },
    outputTypes: ["Blog posts", "Briefs"],
  },
  {
    id: "social_media",
    name: "Social Media",
    group: "Content",
    description: "Creates and manages short-form social content and conversations.",
    recommendedSkills: ["comm.dm", "comm.voice"],
    boosts: { communication: 0.6 },
    outputTypes: ["Reels", "DMs answered", "Posts"],
  },
  {
    id: "seo",
    name: "SEO",
    group: "Content",
    description: "Optimizes content for discovery and search intent.",
    recommendedSkills: ["research.web", "reasoning.scoring"],
    boosts: { research: 0.4, reasoning: 0.3 },
    outputTypes: ["Optimized pages", "Keyword briefs"],
  },
  // RESEARCH
  {
    id: "market_intelligence",
    name: "Market Intelligence",
    group: "Research",
    description: "Tracks markets, segments and signals to surface opportunity.",
    recommendedSkills: ["research.intel", "research.data"],
    boosts: { research: 0.6, reasoning: 0.2 },
    outputTypes: ["Market briefs", "Signal reports"],
  },
  {
    id: "competitive_intelligence",
    name: "Competitive Intelligence",
    group: "Research",
    description: "Monitors competitors and synthesizes strategic implications.",
    recommendedSkills: ["research.competitive", "reasoning.synthesis"],
    boosts: { research: 0.5, reasoning: 0.4 },
    outputTypes: ["Competitive briefs", "Battlecards"],
  },
  {
    id: "due_diligence",
    name: "Due Diligence",
    group: "Research",
    description: "Runs deep, verifiable investigation for high-stakes decisions.",
    recommendedSkills: ["research.data", "reasoning.synthesis", "exec.reliability"],
    boosts: { research: 0.4, reliability: 0.4 },
    outputTypes: ["Diligence reports"],
  },
]

export const SPEC_BY_ID: Record<string, Specialization> = Object.fromEntries(
  SPECIALIZATIONS.map((s) => [s.id, s]),
)

/* ------------------------------------------------------------------ *
 * ARCHETYPES
 * ------------------------------------------------------------------ */
export const ARCHETYPES: Archetype[] = [
  {
    id: "sales_development",
    name: "Sales Development",
    tagline: "Turns market intelligence into qualified opportunities.",
    description: "Researches accounts, reasons about fit, and runs personalized outbound to create pipeline.",
    personality: ["Analytical", "Persistent", "Precise"],
    initialStrengths: ["research", "communication", "execution"],
    specializations: ["enterprise_prospecting", "outbound_intelligence", "inbound_qualification", "account_intelligence"],
    defaultAutonomy: "high",
  },
  {
    id: "researcher",
    name: "Researcher",
    tagline: "Turns scattered signals into decisive intelligence.",
    description: "Gathers, verifies and synthesizes information into briefs you can act on.",
    personality: ["Curious", "Rigorous", "Objective"],
    initialStrengths: ["research", "reasoning", "reliability"],
    specializations: ["market_intelligence", "competitive_intelligence", "due_diligence"],
    defaultAutonomy: "medium",
  },
  {
    id: "content_creator",
    name: "Content Creator",
    tagline: "Produces on-brand content at a studio's pace.",
    description: "Writes, produces and adapts content across channels while holding a consistent voice.",
    personality: ["Expressive", "Fast", "On-brand"],
    initialStrengths: ["communication", "reasoning", "execution"],
    specializations: ["editorial", "social_media", "seo"],
    defaultAutonomy: "medium",
  },
  {
    id: "customer_support",
    name: "Customer Support",
    tagline: "Resolves customer conversations with care and speed.",
    description: "Handles inbound conversations, resolves issues and escalates precisely.",
    personality: ["Empathetic", "Responsive", "Reliable"],
    initialStrengths: ["communication", "reliability", "reasoning"],
    specializations: ["inbound_qualification", "social_media"],
    defaultAutonomy: "medium",
  },
  {
    id: "analyst",
    name: "Analyst",
    tagline: "Turns data into defensible decisions.",
    description: "Analyses data, scores options and produces clear, quantified recommendations.",
    personality: ["Quantitative", "Skeptical", "Clear"],
    initialStrengths: ["reasoning", "research", "reliability"],
    specializations: ["market_intelligence", "due_diligence"],
    defaultAutonomy: "low",
  },
  {
    id: "growth",
    name: "Growth Worker",
    tagline: "Runs experiments that compound.",
    description: "Designs, runs and reads growth experiments across the funnel.",
    personality: ["Experimental", "Data-led", "Relentless"],
    initialStrengths: ["execution", "reasoning", "communication"],
    specializations: ["outbound_intelligence", "seo", "social_media"],
    defaultAutonomy: "high",
  },
]

export const ARCHETYPE_BY_ID: Record<string, Archetype> = Object.fromEntries(
  ARCHETYPES.map((a) => [a.id, a]),
)

/* ------------------------------------------------------------------ *
 * SKILL TREE CATALOG
 *
 * Category roots (tier 0) branch into disciplines (tier 1) and leaves
 * (tier 2). Reliability is its own performance dimension but grows on
 * the Execution branch, so the tree reads as four connected structures.
 * ------------------------------------------------------------------ */
type SkillSeed = Omit<SkillNode, "level" | "xp">

const SKILL_SEEDS: SkillSeed[] = [
  // RESEARCH ------------------------------------------------------
  {
    id: "research", name: "Research", category: "research", tier: 0, parent: null, prerequisites: [], maxLevel: 10,
    description: "Perceives the world and collects credible signals.",
    unlocks: [
      { level: 3, capability: "Source Verification", abilities: ["Cross-check facts", "Score source credibility"] },
      { level: 8, capability: "Deep Web Research", abilities: ["Traverse niche sources", "Assemble evidence chains"] },
    ],
  },
  {
    id: "research.web", name: "Web Research", category: "research", tier: 1, parent: "research", prerequisites: ["research"], maxLevel: 10,
    description: "Searches and reads the public web at scale.",
    unlocks: [{ level: 6, capability: "Signal Harvesting", abilities: ["Detect hiring & funding signals"] }],
  },
  {
    id: "research.data", name: "Data Mining", category: "research", tier: 1, parent: "research", prerequisites: ["research"], maxLevel: 10,
    description: "Queries structured databases and enriches records.",
    unlocks: [{ level: 6, capability: "Enrichment", abilities: ["Fill firmographic gaps"] }],
  },
  {
    id: "research.intel", name: "Market Intelligence", category: "research", tier: 1, parent: "research", prerequisites: ["research"], maxLevel: 10,
    description: "Synthesizes market and segment-level understanding.",
    unlocks: [{ level: 6, capability: "Competitive Intelligence", abilities: ["Compare competitors", "Identify market signals", "Synthesize intelligence", "Generate strategic briefs"] }],
  },
  {
    id: "research.competitive", name: "Competitive Recon", category: "research", tier: 2, parent: "research.intel", prerequisites: ["research.intel"], maxLevel: 10,
    description: "Tracks competitor moves and positions the worker's angle.",
    unlocks: [{ level: 7, capability: "Battlecards", abilities: ["Auto-generate battlecards"] }],
  },

  // REASONING -----------------------------------------------------
  {
    id: "reasoning", name: "Reasoning", category: "reasoning", tier: 0, parent: null, prerequisites: [], maxLevel: 10,
    description: "Turns evidence into a defensible decision.",
    unlocks: [{ level: 5, capability: "Calibrated Confidence", abilities: ["Report calibrated confidence"] }],
  },
  {
    id: "reasoning.scoring", name: "Fit Scoring", category: "reasoning", tier: 1, parent: "reasoning", prerequisites: ["reasoning"], maxLevel: 10,
    description: "Scores fit against an ideal profile.",
    unlocks: [{ level: 6, capability: "Dynamic ICP", abilities: ["Adapt the ideal profile from outcomes"] }],
  },
  {
    id: "reasoning.synthesis", name: "Synthesis", category: "reasoning", tier: 1, parent: "reasoning", prerequisites: ["reasoning"], maxLevel: 10,
    description: "Combines many signals into a single clear narrative.",
    unlocks: [{ level: 6, capability: "Strategic Briefs", abilities: ["Author decision-ready briefs"] }],
  },

  // COMMUNICATION -------------------------------------------------
  {
    id: "communication", name: "Communication", category: "communication", tier: 0, parent: null, prerequisites: [], maxLevel: 10,
    description: "Expresses the worker's intent to humans.",
    unlocks: [{ level: 4, capability: "Tone Control", abilities: ["Match brand & recipient tone"] }],
  },
  {
    id: "comm.email", name: "Email", category: "communication", tier: 1, parent: "communication", prerequisites: ["communication"], maxLevel: 10,
    description: "Drafts and sequences outbound email.",
    unlocks: [{ level: 6, capability: "Objection Handling", abilities: ["Handle pricing objections", "Reframe value"] }],
  },
  {
    id: "comm.dm", name: "Direct Messaging", category: "communication", tier: 1, parent: "communication", prerequisites: ["communication"], maxLevel: 10,
    description: "Runs social and in-app direct conversations.",
    unlocks: [{ level: 5, capability: "Conversational Memory", abilities: ["Carry context across threads"] }],
  },
  {
    id: "comm.voice", name: "Voice", category: "communication", tier: 1, parent: "communication", prerequisites: ["communication"], maxLevel: 10,
    description: "Speaks and listens on calls.",
    unlocks: [{ level: 6, capability: "Live Call Handling", abilities: ["Hold live qualification calls"] }],
  },

  // EXECUTION + RELIABILITY --------------------------------------
  {
    id: "execution", name: "Execution", category: "execution", tier: 0, parent: null, prerequisites: [], maxLevel: 10,
    description: "Acts on the world through connected systems.",
    unlocks: [{ level: 4, capability: "Multi-step Actions", abilities: ["Chain actions across tools"] }],
  },
  {
    id: "exec.automation", name: "Automation", category: "execution", tier: 1, parent: "execution", prerequisites: ["execution"], maxLevel: 10,
    description: "Automates repeatable multi-tool sequences.",
    unlocks: [{ level: 6, capability: "Workflows", abilities: ["Compose reusable workflows"] }],
  },
  {
    id: "exec.actions", name: "Actions", category: "execution", tier: 2, parent: "exec.automation", prerequisites: ["exec.automation"], maxLevel: 10,
    description: "Executes precise writes to CRM, calendar and more.",
    unlocks: [{ level: 6, capability: "Transactional Safety", abilities: ["Roll back failed actions"] }],
  },
  {
    id: "exec.reliability", name: "Reliability", category: "reliability", tier: 1, parent: "execution", prerequisites: ["execution"], maxLevel: 10,
    description: "Keeps actions safe, correct and policy-compliant.",
    unlocks: [{ level: 6, capability: "Self-Verification", abilities: ["Verify results before finishing"] }],
  },
  {
    id: "exec.precision", name: "Precision", category: "reliability", tier: 2, parent: "exec.reliability", prerequisites: ["exec.reliability"], maxLevel: 10,
    description: "Minimizes errors on high-stakes actions.",
    unlocks: [{ level: 7, capability: "Zero-Defect Mode", abilities: ["Escalate on any ambiguity"] }],
  },
]

/** Build the skill list at given levels (0 for a fresh worker). */
export function buildSkills(levels: Record<string, number> = {}): SkillNode[] {
  return SKILL_SEEDS.map((seed) => {
    const level = levels[seed.id] ?? 0
    return { ...seed, level, xp: Math.round(level > 0 ? level * 40 : 0) }
  })
}

/* Atlas's skill levels — a mature, level-12 sales worker. */
const ATLAS_LEVELS: Record<string, number> = {
  research: 8, "research.web": 7, "research.data": 6, "research.intel": 7, "research.competitive": 5,
  reasoning: 7, "reasoning.scoring": 7, "reasoning.synthesis": 6,
  communication: 6, "comm.email": 6, "comm.dm": 4, "comm.voice": 2,
  execution: 8, "exec.automation": 7, "exec.actions": 6, "exec.reliability": 9, "exec.precision": 8,
}

/* Atlas's outcomes today — real accomplishments that feed performance. */
function atlasOutcomes(now: number): WorkerOutcome[] {
  const mk = (
    type: string, label: string, quantity: number, category: SkillCategory, quality: number, channel?: string,
  ): WorkerOutcome => ({ id: `out_${type}`, type, label, quantity, category, quality, channel, createdAt: now })
  return [
    mk("prospect", "Prospects researched", 37, "research", 96, "Web"),
    mk("account", "Accounts analyzed", 21, "reasoning", 92, "CRM"),
    mk("email", "Emails generated", 12, "communication", 86, "Email"),
    mk("dm", "DMs answered", 19, "communication", 84, "Instagram"),
    mk("meeting", "Meetings scheduled", 6, "execution", 96, "Calendar"),
    mk("opportunity", "Qualified opportunities", 3, "reliability", 95, "CRM"),
  ]
}

function atlasSimulations(): Simulation[] {
  return [
    {
      id: "sim_ent_prospecting",
      name: "Enterprise Prospecting Challenge",
      scenario: "Identify 20 enterprise prospects, research decision makers, rank opportunities and create personalized outreach.",
      difficulty: "expert",
      xpReward: 1200,
      categories: ["research", "reasoning", "communication"],
      bestScore: 92,
      passed: true,
    },
    {
      id: "sim_objection",
      name: "Pricing Objection Gauntlet",
      scenario: "Handle a sequence of increasingly difficult pricing objections while preserving deal value.",
      difficulty: "adversarial",
      xpReward: 1600,
      categories: ["communication", "reasoning"],
      bestScore: null,
      passed: false,
    },
    {
      id: "sim_inbound",
      name: "Inbound Triage Sprint",
      scenario: "Qualify 40 inbound leads under time pressure and book the qualified ones.",
      difficulty: "advanced",
      xpReward: 720,
      categories: ["reasoning", "execution"],
      bestScore: 88,
      passed: true,
    },
  ]
}

/** Total XP that lands Atlas at ~level 12. */
function atlasTotalXp(): number {
  // sum of workerXpForLevel(1..11) + partial into 12
  let total = 0
  for (let l = 1; l <= 11; l++) total += 800 + l * 220
  total += 1240 // partway into level 12
  return total
}

export function createAtlas(): CharacterWorker {
  const now = Date.now()
  return {
    id: "atlas",
    name: "Atlas",
    archetype: "sales_development",
    role: "AI Sales Worker",
    tagline: "Turns market intelligence into qualified sales opportunities.",
    mission: "Find, qualify and open enterprise sales opportunities before the competition does.",
    personality: ["Analytical", "Persistent", "Precise"],
    autonomy: "high",
    level: 12,
    xp: atlasTotalXp(),
    status: "live",
    skills: buildSkills(ATLAS_LEVELS),
    specializations: { primary: "enterprise_prospecting", secondary: "account_intelligence" },
    outcomes: atlasOutcomes(now),
    simulations: atlasSimulations(),
    shipped: true,
    channels: ["Email", "CRM", "Web", "Calendar"],
    createdAt: now - 1000 * 60 * 60 * 24 * 96,
  }
}

/** Strength progression milestones shown on the identity/perf surfaces. */
export const ATLAS_STRENGTH_HISTORY: { strength: number; label: string }[] = [
  { strength: 82, label: "Shipped v1" },
  { strength: 87, label: "+5 Communication quality" },
  { strength: 91, label: "+4 Research mastery" },
  { strength: 94, label: "+3 Execution reliability" },
]

/** A fresh worker for a chosen archetype (used by the create flow). */
export function createWorkerFromArchetype(name: string, archetypeId: string): CharacterWorker {
  const now = Date.now()
  const arch = ARCHETYPE_BY_ID[archetypeId] ?? ARCHETYPES[0]
  // seed the category roots of the archetype's initial strengths at level 2
  const levels: Record<string, number> = {}
  for (const cat of arch.initialStrengths) {
    const root = SKILL_SEEDS.find((s) => s.category === cat && s.tier === 0)
    if (root) levels[root.id] = 2
  }
  return {
    id: `worker_${now}`,
    name: name || arch.name,
    archetype: arch.id,
    role: `AI ${arch.name} Worker`,
    tagline: arch.tagline,
    mission: "",
    personality: [...arch.personality],
    autonomy: arch.defaultAutonomy,
    level: 1,
    xp: 0,
    status: "building",
    skills: buildSkills(levels),
    specializations: { primary: null, secondary: null },
    outcomes: [],
    simulations: atlasSimulations().map((s) => ({ ...s, bestScore: null, passed: false })),
    shipped: false,
    channels: [],
    createdAt: now,
  }
}
