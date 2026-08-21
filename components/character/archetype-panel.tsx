"use client"

import { useState } from "react"
import type { CharacterWorker } from "@/lib/character/character-model"
import { AUTONOMY_LABEL, type Autonomy } from "@/lib/character/character-model"
import {
  ARCHETYPES,
  ARCHETYPE_BY_ID,
  SPEC_BY_ID,
} from "@/lib/character/character-data"
import { characterStore } from "@/lib/character/character-store"

const AUTONOMY_ORDER: Autonomy[] = ["low", "medium", "high"]

/**
 * Character class + specialization. Choosing an archetype reshapes the
 * worker's identity and available specializations; personality traits and
 * mission give it voice. Everything writes straight to the store.
 */
export function ArchetypePanel({ worker }: { worker: CharacterWorker }) {
  const arch = ARCHETYPE_BY_ID[worker.archetype]
  const [missionDraft, setMissionDraft] = useState(worker.mission)

  return (
    <div className="flex flex-col gap-6">
      {/* archetype grid */}
      <section>
        <SectionLabel>Character class</SectionLabel>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ARCHETYPES.map((a) => {
            const active = a.id === worker.archetype
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => characterStore.setArchetype(a.id)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-secondary/30 hover:border-muted-foreground/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{a.name}</span>
                  {active && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.tagline}</p>
              </button>
            )
          })}
        </div>
      </section>

      {/* specializations available to this archetype */}
      {arch && (
        <section>
          <SectionLabel>Specialization</SectionLabel>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            primary path
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {arch.specializations.map((sid) => {
              const spec = SPEC_BY_ID[sid]
              if (!spec) return null
              const active = worker.specializations.primary === sid
              return (
                <button
                  key={sid}
                  type="button"
                  onClick={() =>
                    characterStore.setSpecialization("primary", active ? null : sid)
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground hover:border-muted-foreground/50"
                  }`}
                >
                  {spec.name}
                </button>
              )
            })}
          </div>

          {worker.specializations.primary && SPEC_BY_ID[worker.specializations.primary] && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {SPEC_BY_ID[worker.specializations.primary].description}
            </p>
          )}
        </section>
      )}

      {/* personality */}
      {arch && (
        <section>
          <SectionLabel>Personality</SectionLabel>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            up to 4 traits shape its voice
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {arch.personality.map((trait) => {
              const active = worker.personality.includes(trait)
              return (
                <button
                  key={trait}
                  type="button"
                  onClick={() => characterStore.togglePersonality(trait)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? "border-grow/50 bg-grow/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-muted-foreground/50"
                  }`}
                >
                  {trait}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* mission */}
      <section>
        <SectionLabel>Mission</SectionLabel>
        <textarea
          value={missionDraft}
          onChange={(e) => setMissionDraft(e.target.value)}
          onBlur={() => characterStore.setMission(missionDraft.trim())}
          rows={2}
          placeholder="What is this worker here to accomplish?"
          className="modal-input mt-2 resize-none"
        />
      </section>

      {/* autonomy */}
      <section>
        <SectionLabel>Autonomy</SectionLabel>
        <div className="mt-2 inline-flex rounded-lg border border-border p-0.5">
          {AUTONOMY_ORDER.map((a) => {
            const active = worker.autonomy === a
            return (
              <button
                key={a}
                type="button"
                onClick={() => characterStore.setAutonomy(a)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {AUTONOMY_LABEL[a]}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground/70">
      {children}
    </p>
  )
}
