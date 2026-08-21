"use client"

import { useState } from "react"
import { Check, Pencil } from "lucide-react"
import {
  AUTONOMY_LABEL,
  type Autonomy,
  type CharacterWorker,
  type FabricState,
  LIFECYCLE_LABEL,
  type PerformanceProfile,
  type SkillCategory,
  workerXpForLevel,
  workerLevelFromXp,
} from "@/lib/character/character-model"
import { characterStore } from "@/lib/character/character-store"
import { FabricOrganism } from "./fabric-organism"
import { StrengthRing } from "./strength-ring"

const STATUS_TONE: Record<string, string> = {
  live: "text-grow",
  learning: "text-primary",
  training: "text-primary",
  testing: "text-warn",
  ready: "text-grow",
  building: "text-white/60",
  needs_attention: "text-warn",
}

const PERSONALITY_POOL = ["Analytical", "Persistent", "Precise", "Curious", "Bold", "Empathetic", "Fast", "Rigorous", "Creative"]

export function IdentityHero({
  worker,
  performance,
  fabric,
  highlightCategory,
}: {
  worker: CharacterWorker
  performance: PerformanceProfile
  fabric: FabricState
  highlightCategory: SkillCategory | null
}) {
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(worker.name)

  const { xpIntoLevel } = workerLevelFromXp(worker.xp)
  const xpNeed = workerXpForLevel(worker.level)
  const xpPct = Math.min(100, Math.round((xpIntoLevel / xpNeed) * 100))

  const commitName = () => {
    const v = nameDraft.trim()
    if (v) characterStore.setName(v)
    else setNameDraft(worker.name)
    setEditingName(false)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0b12]">
      {/* fabric hero */}
      <div className="relative h-[300px] w-full sm:h-[360px]">
        <div className="pointer-events-none absolute inset-0 bg-substrate opacity-50" />
        <FabricOrganism fabric={fabric} name={worker.name} highlightCategory={highlightCategory} />

        {/* level badge */}
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 backdrop-blur-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">Level</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-white">{worker.level}</span>
        </div>

        {/* status */}
        <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 backdrop-blur-sm">
          <span className={`h-1.5 w-1.5 rounded-full ${worker.status === "live" ? "animate-pulse bg-grow" : "bg-current"} ${STATUS_TONE[worker.status] ?? "text-white/60"}`} />
          <span className={`font-mono text-[10px] uppercase tracking-[0.18em] ${STATUS_TONE[worker.status] ?? "text-white/60"}`}>
            {LIFECYCLE_LABEL[worker.status]}
          </span>
        </div>

        {/* strength ring */}
        <div className="absolute bottom-3 right-3">
          <StrengthRing value={performance.strength} size={104} />
        </div>
      </div>

      {/* identity card */}
      <div className="border-t border-white/10 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) commitName()
                    if (e.key === "Escape") { setNameDraft(worker.name); setEditingName(false) }
                  }}
                  className="w-40 rounded-md border border-white/20 bg-white/5 px-2 py-1 text-2xl font-semibold tracking-tight text-white outline-none focus:border-primary"
                />
                <button onClick={commitName} className="rounded-md bg-primary p-1.5 text-primary-foreground" aria-label="Save name">
                  <Check className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setNameDraft(worker.name); setEditingName(true) }}
                className="group flex items-center gap-2"
              >
                <h1 className="text-balance text-2xl font-semibold tracking-tight text-white">{worker.name}</h1>
                <Pencil className="h-3.5 w-3.5 text-white/30 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.18em] text-primary/80">{worker.role}</p>
          </div>
        </div>

        <p className="mt-3 text-pretty text-sm leading-relaxed text-white/55">{worker.tagline}</p>

        {/* xp bar */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
            <span>XP to level {worker.level + 1}</span>
            <span className="tabular-nums text-white/55">{xpIntoLevel} / {xpNeed}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary"
              style={{ width: `${xpPct}%`, transition: "width 0.9s cubic-bezier(0.22,1,0.36,1)" }}
            />
          </div>
        </div>

        {/* personality + autonomy */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {PERSONALITY_POOL.map((trait) => {
            const on = worker.personality.includes(trait)
            return (
              <button
                key={trait}
                onClick={() => characterStore.togglePersonality(trait)}
                className={`rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-tight transition-colors ${
                  on
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/60"
                }`}
              >
                {trait}
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Autonomy</span>
          <div className="flex items-center gap-1 rounded-lg border border-white/10 p-0.5">
            {(["low", "medium", "high"] as Autonomy[]).map((a) => (
              <button
                key={a}
                onClick={() => characterStore.setAutonomy(a)}
                className={`rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                  worker.autonomy === a ? "bg-primary text-primary-foreground" : "text-white/45 hover:text-white/70"
                }`}
              >
                {AUTONOMY_LABEL[a]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
