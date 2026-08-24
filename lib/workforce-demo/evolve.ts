/* ================================================================== *
 * DEMO WORKFORCE — EVOLVE ENGINE
 *
 * Derives improvement recommendations from the division's own data.
 * Nothing here is a static list: promotions come from proficiency near
 * a maturity threshold, heuristic promotions from confidence+evidence,
 * and IP transfers from a mastered skill a peer is missing. Applying a
 * recommendation mutates the division (see store.applyEvolve).
 * ------------------------------------------------------------------ */

import type { DemoWorker, EvolveRecommendation, Skill } from "./model"
import { SKILL_MATURITY_META, type SkillMaturity } from "./model"

const NEXT_BAND: Record<SkillMaturity, SkillMaturity | null> = {
  seed: "practiced",
  practiced: "expert",
  expert: "mastered",
  mastered: null,
}

/** The proficiency a skill would sit at once promoted to the next band. */
export function nextBandFloor(skill: Skill): number | null {
  const next = NEXT_BAND[skill.maturity]
  return next ? SKILL_MATURITY_META[next].min : null
}

export function evolveRecommendations(workers: DemoWorker[], skills: Skill[]): EvolveRecommendation[] {
  const recs: EvolveRecommendation[] = []
  const ownerOf = (skillId: string) => workers.find((w) => w.skillIds.includes(skillId))

  for (const skill of skills) {
    const owner = ownerOf(skill.id)
    if (!owner) continue

    /* 1) Skill promotion — proficiency within 6pts of the next band. */
    const floor = nextBandFloor(skill)
    const next = NEXT_BAND[skill.maturity]
    if (floor !== null && next && skill.proficiency >= floor - 6 && skill.proficiency < floor) {
      const gap = floor - skill.proficiency
      recs.push({
        id: `promote-${skill.id}`,
        kind: "promote_skill",
        title: `Promote ${skill.name} to ${SKILL_MATURITY_META[next].label}`,
        rationale: `${owner.name} is ${gap} point${gap === 1 ? "" : "s"} of proficiency from ${SKILL_MATURITY_META[next].label} across ${skill.runs} runs.`,
        projectedEffect: `Unlocks ${SKILL_MATURITY_META[next].label} autonomy and reliability on ${skill.name}.`,
        confidence: Math.min(0.95, 0.6 + skill.runs / 800),
        workerId: owner.id,
        skillId: skill.id,
      })
    }

    /* 2) Heuristic promotion — a rule proven enough to standardize. */
    const proven = skill.heuristics.find((h) => h.confidence >= 0.9 && h.evidenceRuns >= 40)
    if (proven) {
      recs.push({
        id: `heuristic-${proven.id}`,
        kind: "promote_heuristic",
        title: `Standardize a heuristic on ${skill.name}`,
        rationale: `"When ${proven.when}" is at ${Math.round(proven.confidence * 100)}% confidence over ${proven.evidenceRuns} runs — proven enough to become a division-wide play.`,
        projectedEffect: `Every worker inherits this judgment; fewer escalations on ${skill.category}.`,
        confidence: proven.confidence,
        workerId: owner.id,
        skillId: skill.id,
      })
    }

    /* 3) IP transfer — a mastered skill a same-category peer lacks. */
    if (skill.maturity === "mastered") {
      const peer = workers.find(
        (w) =>
          w.id !== owner.id &&
          w.role === "specialist" &&
          !w.skillIds.some((sid) => sid === skill.id || skills.find((s) => s.id === sid && s.name === skill.name)),
      )
      if (peer) {
        recs.push({
          id: `transfer-${skill.id}-${peer.id}`,
          kind: "transfer_skill",
          title: `Transfer ${skill.name} IP to ${peer.name}`,
          rationale: `${owner.name} has mastered ${skill.name} (${skill.proficiency}%). ${peer.name} covers ${peer.primaryKpi} without it — transferring the recipe compounds the division's know-how.`,
          projectedEffect: `${peer.name} starts at Practiced with ${owner.name}'s recipe and heuristics as lineage.`,
          confidence: 0.72,
          workerId: owner.id,
          skillId: skill.id,
          toWorkerId: peer.id,
        })
      }
    }
  }

  // strongest first, cap for a focused board
  return recs.sort((a, b) => b.confidence - a.confidence).slice(0, 6)
}
