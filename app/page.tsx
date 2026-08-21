"use client"

import { useState } from "react"
import { CapabilityPanel } from "@/components/capability-panel"
import { EvolvePanel } from "@/components/evolve-panel"
import { FidelitySwitch } from "@/components/fidelity-switch"
import { LoopNav } from "@/components/loop-nav"
import { TraceStream } from "@/components/trace-stream"
import { WorkerFabric, type Fidelity } from "@/components/worker-fabric"
import {
  type Capability,
  type CapabilityId,
  type LoopId,
  useWorkerStream,
  WORKER,
} from "@/lib/worker"

export default function Page() {
  const { log, latest } = useWorkerStream(true)
  const [caps, setCaps] = useState<Capability[]>(WORKER.capabilities)
  const [activeCap, setActiveCap] = useState<CapabilityId | null>(null)
  const [fidelity, setFidelity] = useState<Fidelity>("activity")
  const [activeLoop, setActiveLoop] = useState<LoopId>("watch")

  const communication = caps.find((c) => c.id === "communication")?.score ?? 73

  const handleLoop = (id: LoopId) => {
    setActiveLoop(id)
    if (id === "trace") setFidelity("trace")
    else if (id === "watch") setFidelity("activity")
    else if (id === "release") setFidelity("ambient")
  }

  const applyEvolution = () => {
    setCaps((prev) =>
      prev.map((c) =>
        c.id === "communication"
          ? { ...c, score: Math.min(100, c.score + 14), warning: false }
          : c,
      ),
    )
    setActiveLoop("evolve")
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-substrate">
      <LoopNav active={activeLoop} onSelect={handleLoop} />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_1fr_340px]">
        {/* left — capabilities */}
        <aside className="hidden border-r border-border/70 lg:block">
          <CapabilityPanel caps={caps} activeCap={activeCap} onHover={setActiveCap} />
        </aside>

        {/* center — the living fabric */}
        <section className="relative flex min-h-[360px] flex-col">
          <div className="flex items-start justify-between px-6 pt-5">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-balance">
                Don&apos;t build workflows. Raise workers.
              </h1>
              <p className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-blink rounded-full bg-grow" />
                {WORKER.name} is working — the fabric moves only when it does
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Level {WORKER.level}
              </div>
              <div className="mt-1.5 h-1.5 w-28 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${WORKER.xp}%` }} />
              </div>
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
            <WorkerFabric latest={latest} fidelity={fidelity} />
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-5 flex flex-col items-center gap-2">
            <div className="pointer-events-auto">
              <FidelitySwitch value={fidelity} onChange={setFidelity} />
            </div>
            <p className="max-w-xs px-4 text-center font-mono text-[10px] leading-relaxed text-muted-foreground/80">
              {fidelity === "ambient" && "Ambient — atmosphere only. No animation without an event behind it."}
              {fidelity === "activity" && "Activity — each pulse is a real execution happening now."}
              {fidelity === "trace" && "Trace — every mark is pinned to one factual event."}
            </p>
          </div>
        </section>

        {/* right — trace + evolve */}
        <aside className="flex min-h-0 flex-col border-t border-border/70 lg:border-l lg:border-t-0">
          <div className="min-h-0 flex-1 overflow-hidden">
            <TraceStream log={log} />
          </div>
          <div className="border-t border-border/70 p-5">
            <EvolvePanel communicationScore={communication} onApply={applyEvolution} />
          </div>
        </aside>
      </div>
    </main>
  )
}
