"use client"

/* ------------------------------------------------------------------ *
 * SkillCard — a Skill rendered as owned IP, not a feature toggle. The
 * head shows the value proposition, maturity and mastery. Expanding
 * reveals the two things that make it proprietary: the ordered
 * execution recipe (how the work is actually done) and the learned
 * heuristics (the judgment earned from runs). Lineage shows when the
 * IP was transferred from another worker.
 * ------------------------------------------------------------------ */

import { ChevronDown, GitBranch, Play } from "lucide-react"
import { useState } from "react"
import {
  SKILL_MATURITY_META,
  type DemoWorker,
  type Skill,
} from "@/lib/workforce-demo/model"
import { Heuristics } from "@/components/workforce/heuristics"

export function SkillCard({
  skill,
  inheritedFromWorker,
  running,
  onRun,
}: {
  skill: Skill
  inheritedFromWorker?: DemoWorker
  running: boolean
  onRun: () => void
}) {
  const [open, setOpen] = useState(false)
  const maturity = SKILL_MATURITY_META[skill.maturity]

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card/50">
      {/* head */}
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-foreground">{skill.name}</h3>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-primary">
              {maturity.label}
            </span>
            {inheritedFromWorker && (
              <span
                className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground"
                title={`IP transferred from ${inheritedFromWorker.name}`}
              >
                <GitBranch className="h-3 w-3" />
                from {inheritedFromWorker.name.split(" ")[0]}
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {skill.ip}
          </p>
        </div>

        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary/16 disabled:opacity-60"
        >
          <Play className="h-3 w-3" />
          {running ? "Running" : "Run"}
        </button>
      </div>

      {/* mastery bar + stats */}
      <div className="flex items-center gap-4 px-4 pb-3">
        <div className="flex-1">
          <div className="h-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${skill.proficiency}%` }}
            />
          </div>
        </div>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {skill.proficiency}% mastery
        </span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {skill.runs} runs
        </span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {skill.heuristics.length} heuristics
        </span>
      </div>

      {/* expander */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-t border-border/60 px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? "Hide the IP" : "Inspect the IP — recipe & heuristics"}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-border/60 bg-background/30 p-4">
          {/* recipe */}
          <div className="mb-4">
            <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
              Execution recipe
            </div>
            <ol className="space-y-2">
              {skill.recipe.map((step, i) => (
                <li key={step.id} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/70 font-mono text-[9px] tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-foreground">{step.action}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {step.inputs.join(" + ") || "context"} → {step.output}
                      {step.tool ? ` · via ${step.tool}` : ""} · ~{step.seconds}s
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* heuristics */}
          <div>
            <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-grow">
              Learned heuristics
            </div>
            <Heuristics items={skill.heuristics} />
          </div>
        </div>
      )}
    </div>
  )
}
