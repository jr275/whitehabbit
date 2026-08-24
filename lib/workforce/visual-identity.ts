/* ================================================================== *
 * WORKER VISUAL IDENTITY — deterministic, category-derived.
 *
 * Every worker's accent color and icon are computed purely from what
 * it actually IS (its category, taken from its primary enabled real
 * skill) — never random, never assigned once at creation and frozen.
 * Two workers with the same primary skill category always render the
 * same accent + icon; a worker's identity changes automatically if its
 * primary skill changes. This is the one place that mapping lives —
 * every surface that renders a worker avatar (Studio canvas, worker
 * switcher, Outputs Hub, evolve/activity feed) imports it from here,
 * so they can never disagree.
 *
 * Deliberately NOT random (Math.random, a hash-to-color scheme, etc.)
 * — a category's color is a fixed, named design decision, not a
 * side effect of the worker's id.
 * ================================================================== */

import type { SkillCategory, Worker } from "./model"
import { SKILL_CATEGORIES } from "./model"

export interface CategoryVisual {
  /** hex accent — the one color used for this category everywhere */
  accent: string
  /** lucide-react icon name (components/workforce/worker-avatar.tsx maps this to the actual component, kept out of this file so it stays import-light for server/lib code) */
  icon: "Search" | "PenLine" | "MessagesSquare" | "Target"
  label: string
}

export const CATEGORY_VISUAL: Record<SkillCategory, CategoryVisual> = {
  research: { accent: "#5a6ef0", icon: "Search", label: "Research" },
  content: { accent: "#a855f7", icon: "PenLine", label: "Content" },
  communication: { accent: "#14b8a6", icon: "MessagesSquare", label: "Communication" },
  sales: { accent: "#f59e0b", icon: "Target", label: "Sales" },
}

const FALLBACK_CATEGORY: SkillCategory = "research"

/** The category that defines this worker's visual identity: its first
 * ENABLED skill's category (skills are added in priority order — the
 * blueprint's primarySkillId is always first, see buildWorkerFromBlueprint()),
 * falling back to the first skill at all if none are enabled yet, and
 * to "research" for a brand-new, still-empty draft worker. */
export function getWorkerCategory(worker: Pick<Worker, "skills">): SkillCategory {
  const enabled = worker.skills.find((s) => s.enabled)
  const candidate = enabled?.category ?? worker.skills[0]?.category
  return candidate && SKILL_CATEGORIES.includes(candidate) ? candidate : FALLBACK_CATEGORY
}

export function getWorkerVisual(worker: Pick<Worker, "skills">): CategoryVisual {
  return CATEGORY_VISUAL[getWorkerCategory(worker)]
}
