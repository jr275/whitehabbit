"use client"

import { useEffect, useMemo, useState } from "react"
import { Mic, Type } from "lucide-react"
import { TopNav } from "@/components/studio/top-nav"
import { WorkerCard } from "@/components/library/worker-card"
import { CreateLauncher } from "@/components/library/create-launcher"
import { PREFABS, FLAGSHIP_ID } from "@/lib/library/prefabs"
import { CATEGORY_META, type WorkerCategory } from "@/lib/library/spec-model"
import { draftStore, useDraft } from "@/lib/library/draft-store"

const CATEGORY_ORDER: WorkerCategory[] = [
  "marketing",
  "sales",
  "finance",
  "operations",
  "legal",
  "people",
  "content",
]

export default function LibraryPage() {
  const [launcher, setLauncher] = useState<"voice" | "text" | null>(null)
  const { created } = useDraft()

  useEffect(() => {
    draftStore.hydrate()
  }, [])

  const flagship = useMemo(() => PREFABS.find((p) => p.id === FLAGSHIP_ID)!, [])
  const rest = useMemo(() => PREFABS.filter((p) => p.id !== FLAGSHIP_ID), [])

  const [filter, setFilter] = useState<WorkerCategory | "all">("all")
  const shown = filter === "all" ? rest : rest.filter((p) => p.category === filter)

  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      <main className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8">
        {/* hero */}
        <section className="flex flex-col gap-6 border-b border-border pb-10">
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              Worker Library
            </p>
            <h1 className="mt-3 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
              Expert AI workers, pre-built by WhiteHabbit.
            </h1>
            <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
              Why build an AI worker from zero? Each professional build already contains identity,
              reasoning patterns, skills, tools, KPIs and outcome models. You configure only the
              final 10–20% — then ship.
            </p>
          </div>

          {/* creation CTAs */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setLauncher("voice")}
              className="group flex items-center gap-2.5 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Mic className="h-4 w-4" />
              Create with voice
            </button>
            <button
              onClick={() => setLauncher("text")}
              className="flex items-center gap-2.5 rounded-full border border-border bg-card px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-foreground/25"
            >
              <Type className="h-4 w-4" />
              Describe with text
            </button>
            <span className="font-mono text-[11px] text-muted-foreground">
              or start from a professional build below
            </span>
          </div>
        </section>

        {/* flagship */}
        <section className="pt-10">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              Flagship
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">Start with MAKY</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <WorkerCard spec={flagship} featured created={created.includes(flagship.id)} />
          </div>
        </section>

        {/* category filter */}
        <section className="pt-10">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                filter === "all" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {CATEGORY_ORDER.filter((c) => rest.some((p) => p.category === c)).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  filter === c ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {CATEGORY_META[c].label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((spec) => (
              <WorkerCard key={spec.id} spec={spec} created={created.includes(spec.id)} />
            ))}
          </div>
        </section>
      </main>

      {launcher && <CreateLauncher initialMode={launcher} onClose={() => setLauncher(null)} />}
    </div>
  )
}
