"use client"

import { useState } from "react"
import { TopNav } from "@/components/studio/top-nav"
import { ArchetypePanel } from "@/components/character/archetype-panel"
import { IdentityHero } from "@/components/character/identity-hero"
import { SkillTree } from "@/components/character/skill-tree"
import { UpgradeMoment } from "@/components/character/upgrade-moment"
import { ARCHETYPES } from "@/lib/character/character-data"
import { characterStore } from "@/lib/character/character-store"
import { useCharacter } from "@/lib/character/use-character"

/* Dark hero shell — the character builder makes the Fabric the hero,
   so it uses the app's immersive dark theme (not the light .studio-surface). */
function BuilderShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      {children}
    </div>
  )
}

/* Create state — birth a new character from an archetype. */
function CreateCharacter() {
  const [name, setName] = useState("")
  const [archetype, setArchetype] = useState(ARCHETYPES[0]?.id ?? "")
  const create = () => {
    const n = name.trim() || "New Worker"
    if (!archetype) return
    characterStore.createWorker(n, archetype)
  }
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.25rem)] max-w-2xl flex-col justify-center px-6 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary">Worker Studio</p>
      <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-foreground">
        Create a new worker
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Every worker is a character that grows. Give it a name and a class to start — you&apos;ll develop
        its skills, watch its Fabric evolve, and send it to work.
      </p>

      <label className="mt-8 block font-mono text-[11px] uppercase tracking-[0.22em] text-foreground/70">
        Name
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Atlas"
        className="mt-2 w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
        autoFocus
      />

      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.22em] text-foreground/70">Class</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ARCHETYPES.map((a) => {
          const active = a.id === archetype
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setArchetype(a.id)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                active
                  ? "border-primary bg-primary/10"
                  : "border-border bg-secondary/30 hover:border-muted-foreground/40"
              }`}
            >
              <span className="text-sm font-medium text-foreground">{a.name}</span>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.tagline}</p>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={create}
        className="mt-8 w-fit rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
      >
        Create worker
      </button>
    </div>
  )
}

export default function StudioPage() {
  const { hydrated, worker, performance, fabric, lastUpgrade } = useCharacter()
  const [hoverCategory, setHoverCategory] = useState<
    import("@/lib/character/character-model").SkillCategory | null
  >(null)

  if (!hydrated) {
    return (
      <BuilderShell>
        <div className="flex min-h-[calc(100vh-3.25rem)] items-center justify-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            Loading…
          </span>
        </div>
      </BuilderShell>
    )
  }

  if (!worker || !performance || !fabric) {
    return (
      <BuilderShell>
        <CreateCharacter />
      </BuilderShell>
    )
  }

  return (
    <BuilderShell>
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {/* hero: the living character */}
        <IdentityHero
          worker={worker}
          performance={performance}
          fabric={fabric}
          highlightCategory={hoverCategory}
        />

        {/* the two build columns: who it is + how it grows */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-[4.5rem] lg:self-start">
            <div className="rounded-2xl border border-border bg-card/60 p-5">
              <ArchetypePanel worker={worker} />
            </div>
          </aside>

          <section>
            <SkillTree
              worker={worker}
              onHoverCategory={setHoverCategory}
              onUpgrade={() => {
                /* store opens the upgrade moment via lastUpgrade */
              }}
            />
          </section>
        </div>
      </div>

      {/* the upgrade moment */}
      <UpgradeMoment
        result={lastUpgrade}
        workerName={worker.name}
        onClose={() => characterStore.clearUpgrade()}
      />
    </BuilderShell>
  )
}
