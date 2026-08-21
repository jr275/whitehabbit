/* ================================================================== *
 * CHARACTER STORE — the one source of truth for the Worker character.
 *
 * A tiny external store (useSyncExternalStore compatible) that holds
 * the CharacterWorker and exposes a fully-derived snapshot: the worker,
 * its performance (strength), its Fabric state, and the most recent
 * upgrade "moment". Every surface reads from here so Atlas is the same
 * character everywhere. State persists to localStorage.
 * ================================================================== */

"use client"

import {
  type CharacterWorker,
  type FabricState,
  type Mastery,
  type PerformanceProfile,
  type SkillCategory,
  type SkillNode,
  type SkillUnlock,
  deriveFabric,
  derivePerformance,
  masteryForLevel,
  nextUnlock,
  skillXpForLevel,
  workerLevelFromXp,
} from "./character-model"
import {
  ARCHETYPE_BY_ID,
  ATLAS_STRENGTH_HISTORY,
  SPEC_BY_ID,
  createAtlas,
  createWorkerFromArchetype,
} from "./character-data"

/* ---- the upgrade moment ---- */
export interface UpgradeResult {
  skillId: string
  skillName: string
  category: SkillCategory
  fromLevel: number
  toLevel: number
  masteryBefore: Mastery
  masteryAfter: Mastery
  newCapability: SkillUnlock | null
  strengthBefore: number
  strengthAfter: number
  categoryBefore: number
  categoryAfter: number
  workerLevelBefore: number
  workerLevelAfter: number
  fabricEvolved: boolean
  fabricBefore: FabricState
  fabricAfter: FabricState
  at: number
}

export interface CharacterSnapshot {
  hydrated: boolean
  worker: CharacterWorker | null
  performance: PerformanceProfile | null
  fabric: FabricState | null
  lastUpgrade: UpgradeResult | null
}

interface Persisted {
  worker: CharacterWorker | null
  strengthHistory: { strength: number; label: string }[]
}

const KEY = "whitehabbit.character.v1"

function load(): Persisted | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as Persisted
  } catch {
    return null
  }
}

function save(p: Persisted) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

class CharacterStore {
  private worker: CharacterWorker | null = null
  private strengthHistory: { strength: number; label: string }[] = []
  private lastUpgrade: UpgradeResult | null = null
  private hydrated = false
  private listeners = new Set<() => void>()
  private snapshot: CharacterSnapshot = {
    hydrated: false,
    worker: null,
    performance: null,
    fabric: null,
    lastUpgrade: null,
  }

  /* ---- subscription ---- */
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = () => this.snapshot
  private emit() {
    for (const fn of this.listeners) fn()
  }

  /* ---- hydration ---- */
  hydrate() {
    if (this.hydrated) return
    const persisted = load()
    if (persisted?.worker) {
      this.worker = persisted.worker
      this.strengthHistory = persisted.strengthHistory ?? []
    } else {
      // first visit — seed Atlas so the product is alive immediately
      this.worker = createAtlas()
      this.strengthHistory = [...ATLAS_STRENGTH_HISTORY]
    }
    this.hydrated = true
    this.rebuild()
    this.persist()
  }

  private persist() {
    save({ worker: this.worker, strengthHistory: this.strengthHistory })
  }

  /** recompute the derived snapshot from raw worker state */
  private rebuild() {
    if (!this.worker) {
      this.snapshot = { hydrated: this.hydrated, worker: null, performance: null, fabric: null, lastUpgrade: this.lastUpgrade }
      return
    }
    const perf = derivePerformance(this.worker, SPEC_BY_ID)
    perf.history = this.strengthHistory
    const fabric = deriveFabric(this.worker, perf.strength)
    this.snapshot = {
      hydrated: this.hydrated,
      worker: this.worker,
      performance: perf,
      fabric,
      lastUpgrade: this.lastUpgrade,
    }
  }

  private commit() {
    this.rebuild()
    this.persist()
    this.emit()
  }

  /* ---- reads used by non-react callers ---- */
  get current() {
    return this.worker
  }

  /* ================================================================
   * ACTIONS
   * ============================================================== */

  createWorker(name: string, archetypeId: string) {
    this.worker = createWorkerFromArchetype(name, archetypeId)
    this.strengthHistory = []
    this.lastUpgrade = null
    this.commit()
  }

  resetToAtlas() {
    this.worker = createAtlas()
    this.strengthHistory = [...ATLAS_STRENGTH_HISTORY]
    this.lastUpgrade = null
    this.commit()
  }

  setName(name: string) {
    if (!this.worker) return
    this.worker = { ...this.worker, name }
    this.commit()
  }

  setMission(mission: string) {
    if (!this.worker) return
    this.worker = { ...this.worker, mission }
    this.commit()
  }

  setAutonomy(autonomy: CharacterWorker["autonomy"]) {
    if (!this.worker) return
    this.worker = { ...this.worker, autonomy }
    this.commit()
  }

  togglePersonality(trait: string) {
    if (!this.worker) return
    const has = this.worker.personality.includes(trait)
    const personality = has
      ? this.worker.personality.filter((t) => t !== trait)
      : [...this.worker.personality, trait].slice(0, 4)
    this.worker = { ...this.worker, personality }
    this.commit()
  }

  setSpecialization(slot: "primary" | "secondary", specId: string | null) {
    if (!this.worker) return
    this.worker = {
      ...this.worker,
      specializations: { ...this.worker.specializations, [slot]: specId },
    }
    this.commit()
  }

  setArchetype(archetypeId: string) {
    if (!this.worker) return
    const arch = ARCHETYPE_BY_ID[archetypeId]
    if (!arch) return
    this.worker = {
      ...this.worker,
      archetype: arch.id,
      role: `AI ${arch.name} Worker`,
      tagline: this.worker.tagline || arch.tagline,
      autonomy: this.worker.autonomy ?? arch.defaultAutonomy,
      // reset specializations that don't belong to the new archetype
      specializations: {
        primary: arch.specializations.includes(this.worker.specializations.primary ?? "")
          ? this.worker.specializations.primary
          : null,
        secondary: arch.specializations.includes(this.worker.specializations.secondary ?? "")
          ? this.worker.specializations.secondary
          : null,
      },
    }
    this.commit()
  }

  /** clear the transient upgrade moment (after the modal is dismissed) */
  clearUpgrade() {
    this.lastUpgrade = null
    this.rebuild()
    this.emit()
  }

  /**
   * Develop a skill by one level. This is the core character-builder
   * action: it strengthens the worker, may unlock a new capability,
   * awards worker XP (which can raise the worker's level), and evolves
   * the Fabric. Returns the full "what changed" moment.
   */
  upgradeSkill(skillId: string): UpgradeResult | null {
    if (!this.worker) return null
    const skill = this.worker.skills.find((s) => s.id === skillId)
    if (!skill || skill.level >= skill.maxLevel) return null

    const perfBefore = derivePerformance(this.worker, SPEC_BY_ID)
    const fabricBefore = deriveFabric(this.worker, perfBefore.strength)
    const fromLevel = skill.level
    const toLevel = fromLevel + 1
    const masteryBefore = masteryForLevel(fromLevel, skill.maxLevel)
    const workerLevelBefore = this.worker.level

    // detect a newly-crossed capability unlock
    const newCapability =
      skill.unlocks.find((u) => u.level > fromLevel && u.level <= toLevel) ?? null

    // apply the level up
    const skills = this.worker.skills.map((s) =>
      s.id === skillId ? { ...s, level: toLevel, xp: 0 } : s,
    )
    // award worker XP for the development
    const gainedXp = skillXpForLevel(fromLevel)
    const totalXp = this.worker.xp + gainedXp
    const { level: newWorkerLevel } = workerLevelFromXp(totalXp)

    this.worker = { ...this.worker, skills, xp: totalXp, level: newWorkerLevel, status: this.worker.shipped ? "learning" : "training" }

    const perfAfter = derivePerformance(this.worker, SPEC_BY_ID)
    const fabricAfter = deriveFabric(this.worker, perfAfter.strength)
    const masteryAfter = masteryForLevel(toLevel, skill.maxLevel)

    // log a strength milestone when overall strength improves
    if (perfAfter.strength > perfBefore.strength) {
      this.strengthHistory = [
        ...this.strengthHistory,
        {
          strength: perfAfter.strength,
          label: `+${perfAfter.strength - perfBefore.strength} ${skill.name}`,
        },
      ].slice(-8)
    }

    const fabricEvolved =
      fabricAfter.evolutionLevel > fabricBefore.evolutionLevel ||
      fabricAfter.complexity - fabricBefore.complexity > 0.001 ||
      fabricAfter.density - fabricBefore.density > 0.001

    const result: UpgradeResult = {
      skillId,
      skillName: skill.name,
      category: skill.category,
      fromLevel,
      toLevel,
      masteryBefore,
      masteryAfter,
      newCapability,
      strengthBefore: perfBefore.strength,
      strengthAfter: perfAfter.strength,
      categoryBefore: perfBefore.dimensions[skill.category],
      categoryAfter: perfAfter.dimensions[skill.category],
      workerLevelBefore,
      workerLevelAfter: newWorkerLevel,
      fabricEvolved,
      fabricBefore,
      fabricAfter,
      at: Date.now(),
    }
    this.lastUpgrade = result
    this.commit()
    return result
  }

  /** Run a simulation → returns a scored result and awards XP on pass. */
  runSimulation(simId: string) {
    if (!this.worker) return null
    const sim = this.worker.simulations.find((s) => s.id === simId)
    if (!sim) return null
    const perf = derivePerformance(this.worker, SPEC_BY_ID)
    // score = average of the exercised dimensions, with a difficulty tax
    const base =
      sim.categories.reduce((n, c) => n + perf.dimensions[c], 0) / sim.categories.length
    const tax = { beginner: 2, intermediate: -2, advanced: -5, expert: -8, adversarial: -12 }[sim.difficulty]
    const score = Math.max(0, Math.min(100, Math.round(base + tax)))
    const passed = score >= 70
    const dims = {} as Record<SkillCategory, number>
    for (const c of sim.categories) dims[c] = perf.dimensions[c]

    if (passed) {
      const totalXp = this.worker.xp + sim.xpReward
      const { level } = workerLevelFromXp(totalXp)
      const sims = this.worker.simulations.map((s) =>
        s.id === simId ? { ...s, bestScore: Math.max(s.bestScore ?? 0, score), passed: true } : s,
      )
      this.worker = { ...this.worker, xp: totalXp, level, simulations: sims }
      this.commit()
    }
    return { sim, score, passed, dims, xp: passed ? sim.xpReward : 0 }
  }

  ship() {
    if (!this.worker) return
    const arch = ARCHETYPE_BY_ID[this.worker.archetype]
    const channels =
      this.worker.channels.length > 0
        ? this.worker.channels
        : arch?.id === "content_creator"
          ? ["Instagram", "Web", "Email"]
          : ["Email", "CRM", "Web", "Calendar"]
    this.worker = { ...this.worker, shipped: true, status: "live", channels }
    this.commit()
  }
}

export const characterStore = new CharacterStore()
