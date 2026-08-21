"use client"

import { CATEGORY_LABEL, SKILL_CATEGORIES, type PerformanceProfile, type SkillCategory } from "@/lib/character/character-model"

const CAT_HUE: Record<SkillCategory, number> = {
  research: 226,
  reasoning: 250,
  communication: 202,
  execution: 266,
  reliability: 190,
}

/* Worker development — performance per dimension, as elegant meters. */
export function PerformanceBars({
  performance,
  highlight = null,
  compact = false,
}: {
  performance: PerformanceProfile
  highlight?: SkillCategory | null
  compact?: boolean
}) {
  return (
    <div className={compact ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
      {SKILL_CATEGORIES.map((cat) => {
        const v = performance.dimensions[cat]
        const hue = CAT_HUE[cat]
        const on = highlight === cat
        return (
          <div key={cat} className="flex items-center gap-3">
            <span
              className={`w-[92px] shrink-0 font-mono text-[11px] tracking-tight ${on ? "text-white" : "text-white/60"}`}
            >
              {CATEGORY_LABEL[cat]}
            </span>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${v}%`,
                  background: `linear-gradient(90deg, hsl(${hue} 80% 60%), hsl(${hue} 88% 70%))`,
                  boxShadow: on ? `0 0 12px hsl(${hue} 90% 65% / 0.7)` : "none",
                  transition: "width 0.9s cubic-bezier(0.22,1,0.36,1)",
                }}
              />
            </div>
            <span className="w-7 shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums text-white/80">
              {v}
            </span>
          </div>
        )
      })}
    </div>
  )
}
