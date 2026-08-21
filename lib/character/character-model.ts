/* ================================================================== *
 * CHARACTER MODEL — WhiteHabbit's real product vocabulary.
 *
 * A Worker is a persistent AI CHARACTER, not a workflow. It has a
 * level, experience, strength, an identity, a skill tree, one or more
 * specializations, a performance profile, and a Fabric — the living
 * visual manifestation of the character. Everything the UI renders is
 * derived deterministically from this state, so the same Worker looks
 * identical on every surface.
 *
 * Pure types + pure math only. No React, no storage, no side effects.
 * ================================================================== */

/* ---- skill system ---- */
export type SkillCategory =
  | "research"
  | "reasoning"
  | "communication"
  | "execution"
  | "reliability"

export const SKILL_CATEGORIES: SkillCategory[] = [
  "research",
  "reasoning",
  "communication",
  "execution",
  "reliability",
]

export const CATEGORY_LABEL: Record<SkillCategory, string> = {
  research: "Research",
  reasoning: "Reasoning",
  communication: "Communication",
  execution: "Execution",
  reliability: "Reliability",
}

export type Mastery = "novice" | "developing" | "advanced" | "expert"

export const MASTERY_LABEL: Record<Mastery, string> = {
  novice: "Novice",
  developing: "Developing",
  advanced: "Advanced",
  expert: "Expert",
}

/** capability that unlocks when a skill crosses a level threshold */
export interface SkillUnlock {
  level: number
  capability: string
  abilities: string[]
}

export interface SkillNode {
  id: string
  name: string
  category: SkillCategory
  description: string
  level: number
  maxLevel: number
  xp: number
  /** tree structure */
  tier: number // 0 = category root, 1 = branch, 2 = leaf
  parent: string | null
  prerequisites: string[]
  /** level thresholds that reveal new capabilities */
  unlocks: SkillUnlock[]
}

/* ---- specialization & archetype ---- */
export interface Specialization {
  id: string
  name: string
  group: string // "Sales", "Content", "Research", ...
  description: string
  /** skill ids this specialization emphasises */
  recommendedSkills: string[]
  /** per-category strength boost, 0..1 weight */
  boosts: Partial<Record<SkillCategory, number>>
  /** the kinds of outcomes this specialization produces */
  outputTypes: string[]
}

export interface Archetype {
  id: string
  name: string
  tagline: string
  description: string
  personality: string[]
  /** categories this archetype starts strong in */
  initialStrengths: SkillCategory[]
  /** specialization ids available to this archetype */
  specializations: string[]
  defaultAutonomy: Autonomy
}

export type Autonomy = "low" | "medium" | "high"

export const AUTONOMY_LABEL: Record<Autonomy, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
}

/* ---- performance (= strength) ---- */
export interface PerformanceProfile {
  strength: number // overall 0..100
  dimensions: Record<SkillCategory, number> // 0..100 per category
  /** strength progression over time, oldest → newest */
  history: { strength: number; label: string }[]
}

/* ---- Fabric: the visual character state ---- */
export interface FabricState {
  complexity: number // 0..1 — structural richness (breadth of developed skills)
  energy: number // 0..1 — vitality (overall strength / activity)
  density: number // 0..1 — total accumulated levels
  evolutionLevel: number // integer tier, grows with worker level
  skillInfluences: Record<SkillCategory, number> // 0..1 per category
}

/* ---- outcomes (feed performance) ---- */
export interface WorkerOutcome {
  id: string
  type: string // "blog_post", "reel", "dm", "prospect", "email", "meeting", "opportunity"
  label: string // human-readable, e.g. "Blog posts written"
  quantity: number
  channel?: string
  category: SkillCategory // which dimension this outcome strengthens
  quality: number // 0..100
  createdAt: number
}

/* ---- lifecycle (character states, not infra) ---- */
export type WorkerLifecycle =
  | "building"
  | "training"
  | "testing"
  | "ready"
  | "live"
  | "learning"
  | "needs_attention"

export const LIFECYCLE_LABEL: Record<WorkerLifecycle, string> = {
  building: "Building",
  training: "Training",
  testing: "Testing",
  ready: "Ready",
  live: "Live",
  learning: "Learning",
  needs_attention: "Needs Attention",
}

/* ---- simulations ---- */
export type Difficulty =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "expert"
  | "adversarial"

export interface Simulation {
  id: string
  name: string
  scenario: string
  difficulty: Difficulty
  xpReward: number
  /** which categories the sim exercises */
  categories: SkillCategory[]
  bestScore: number | null
  passed: boolean
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
  adversarial: "Adversarial",
}

export const DIFFICULTY_STARS: Record<Difficulty, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
  adversarial: 5,
}

/* ---- the Worker character ---- */
export interface CharacterWorker {
  id: string
  name: string
  archetype: string // archetype id
  role: string // "AI Sales Worker"
  tagline: string
  mission: string
  personality: string[]
  autonomy: Autonomy
  level: number
  xp: number
  status: WorkerLifecycle
  skills: SkillNode[]
  specializations: { primary: string | null; secondary: string | null }
  outcomes: WorkerOutcome[]
  simulations: Simulation[]
  shipped: boolean
  channels: string[]
  createdAt: number
}

/* ================================================================== *
 * PURE MATH — the single source of truth for progression + derivation.
 * ================================================================== */

/** XP required to advance a SKILL from `level` to `level + 1`. */
export function skillXpForLevel(level: number): number {
  return 120 + level * 80 // 200, 280, 360, ...
}

/** XP required to advance the WORKER from `level` to `level + 1`. */
export function workerXpForLevel(level: number): number {
  return 800 + level * 220
}

export function workerLevelFromXp(totalXp: number): { level: number; xpIntoLevel: number; xpToNext: number } {
  let level = 1
  let remaining = totalXp
  while (remaining >= workerXpForLevel(level)) {
    remaining -= workerXpForLevel(level)
    level += 1
  }
  return { level, xpIntoLevel: remaining, xpToNext: workerXpForLevel(level) }
}

export function masteryForLevel(level: number, maxLevel: number): Mastery {
  const ratio = level / maxLevel
  if (ratio >= 0.85) return "expert"
  if (ratio >= 0.6) return "advanced"
  if (ratio >= 0.3) return "developing"
  return "novice"
}

/** capabilities a skill has unlocked at its current level */
export function unlockedCapabilities(skill: SkillNode): SkillUnlock[] {
  return skill.unlocks.filter((u) => skill.level >= u.level)
}

/** the next capability a skill will unlock, if any */
export function nextUnlock(skill: SkillNode): SkillUnlock | null {
  return skill.unlocks.find((u) => skill.level < u.level) ?? null
}

/** a skill is available to train only when all prerequisites are met */
export function isSkillUnlocked(skill: SkillNode, all: SkillNode[]): boolean {
  if (skill.prerequisites.length === 0) return true
  return skill.prerequisites.every((pid) => {
    const p = all.find((s) => s.id === pid)
    return p ? p.level >= 3 : false
  })
}

/* ---- derivations: everything visual comes from skills + outcomes ---- */

/** sum of levels in a category (root + branches + leaves) */
function categoryLevelSum(skills: SkillNode[], cat: SkillCategory): number {
  return skills.filter((s) => s.category === cat).reduce((n, s) => n + s.level, 0)
}

function categoryMaxSum(skills: SkillNode[], cat: SkillCategory): number {
  return skills.filter((s) => s.category === cat).reduce((n, s) => n + s.maxLevel, 0)
}

/**
 * Performance strength per category, 0..100. Derived from skill levels
 * AND (when present) the quality of real outcomes in that category, so
 * that "the Worker becomes stronger because of what it accomplishes".
 */
export function derivePerformance(
  worker: Pick<CharacterWorker, "skills" | "outcomes" | "specializations">,
  specById: Record<string, Specialization>,
): PerformanceProfile {
  const dimensions = {} as Record<SkillCategory, number>

  const boosts: Partial<Record<SkillCategory, number>> = {}
  for (const id of [worker.specializations.primary, worker.specializations.secondary]) {
    if (!id) continue
    const spec = specById[id]
    if (!spec) continue
    for (const [cat, b] of Object.entries(spec.boosts)) {
      boosts[cat as SkillCategory] = (boosts[cat as SkillCategory] ?? 0) + (b ?? 0)
    }
  }

  for (const cat of SKILL_CATEGORIES) {
    const sum = categoryLevelSum(worker.skills, cat)
    const max = categoryMaxSum(worker.skills, cat) || 1
    const skillScore = (sum / max) * 100

    // outcome quality nudges the score toward proven quality
    const outs = worker.outcomes.filter((o) => o.category === cat)
    const outQuality = outs.length
      ? outs.reduce((n, o) => n + o.quality, 0) / outs.length
      : null

    let score = outQuality == null ? skillScore : skillScore * 0.65 + outQuality * 0.35
    score += (boosts[cat] ?? 0) * 6 // specialization lift
    dimensions[cat] = Math.max(0, Math.min(100, Math.round(score)))
  }

  const strength = Math.round(
    SKILL_CATEGORIES.reduce((n, c) => n + dimensions[c], 0) / SKILL_CATEGORIES.length,
  )

  return { strength, dimensions, history: [] }
}

/** Fabric state derived deterministically from the character. */
export function deriveFabric(worker: Pick<CharacterWorker, "skills" | "level">, strength: number): FabricState {
  const totalLevels = worker.skills.reduce((n, s) => n + s.level, 0)
  const totalMax = worker.skills.reduce((n, s) => n + s.maxLevel, 0) || 1
  const developed = worker.skills.filter((s) => s.level > 0).length
  const breadth = developed / (worker.skills.length || 1)

  const skillInfluences = {} as Record<SkillCategory, number>
  for (const cat of SKILL_CATEGORIES) {
    const sum = categoryLevelSum(worker.skills, cat)
    const max = categoryMaxSum(worker.skills, cat) || 1
    skillInfluences[cat] = Math.max(0, Math.min(1, sum / max))
  }

  return {
    complexity: Math.max(0, Math.min(1, breadth * 0.6 + (totalLevels / totalMax) * 0.4)),
    energy: Math.max(0, Math.min(1, strength / 100)),
    density: Math.max(0, Math.min(1, totalLevels / totalMax)),
    evolutionLevel: Math.max(1, Math.floor(worker.level / 3) + 1),
    skillInfluences,
  }
}
