"use client"

/* ------------------------------------------------------------------ *
 * Autonomy dial — a single spectrum from Suggest to Own. This is the
 * most consequential knob in Studio: how much the worker acts on its
 * own before it must pause for a human.
 * ------------------------------------------------------------------ */

import { useState } from "react"
import { AUTONOMY_LEVELS, CURRENT_AUTONOMY } from "@/lib/studio-data"

export function AutonomyDial() {
  const [level, setLevel] = useState(CURRENT_AUTONOMY)
  const current = AUTONOMY_LEVELS[level]

  return (
    <div>
      {/* segmented track */}
      <div className="flex gap-1.5">
        {AUTONOMY_LEVELS.map((l) => {
          const active = l.level <= level
          const isCurrent = l.level === level
          return (
            <button
              key={l.level}
              onClick={() => setLevel(l.level)}
              className="group flex-1 text-left"
              aria-pressed={isCurrent}
            >
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  active ? "bg-primary" : "bg-secondary"
                }`}
              />
              <div
                className={`mt-2 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  isCurrent
                    ? "text-foreground"
                    : "text-muted-foreground group-hover:text-foreground"
                }`}
              >
                {l.label}
              </div>
            </button>
          )
        })}
      </div>

      {/* current level description */}
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-border bg-secondary/50 p-3.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-[12px] font-semibold text-primary">
          {level}
        </div>
        <div>
          <div className="text-[13px] font-medium text-foreground">
            {current.label}
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {current.blurb}
          </p>
        </div>
      </div>
    </div>
  )
}
