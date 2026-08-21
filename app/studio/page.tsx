"use client"

import { useEffect, useState } from "react"
import { BuildPanel } from "@/components/studio/build-panel"
import { FabricPanel } from "@/components/studio/fabric-panel"
import { ResultPanel } from "@/components/studio/result-panel"
import { StudioShell } from "@/components/studio/studio-shell"
import { studioStore, useStudio } from "@/lib/worker/worker-state"

const OBJECTIVE_SUGGESTIONS = [
  "Qualify inbound enterprise leads and book meetings with the best ones.",
  "Monitor target accounts and alert me when buying signals appear.",
  "Research competitors weekly and summarise what changed.",
]

/* Create state — shown when no worker exists yet. */
function CreateWorker() {
  const [objective, setObjective] = useState("")
  const create = (value: string) => {
    const v = value.trim()
    if (!v) return
    studioStore.createWorker(v)
  }
  return (
    <div className="flex min-h-[calc(100vh-3.25rem)] items-center justify-center bg-grid-light px-6">
      <div className="w-full max-w-xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Worker Studio</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground text-balance">
          What should your worker do?
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Describe an objective. The studio will assemble a worker with the capabilities, tools and policies it needs —
          then you can build it, release it, and watch it work.
        </p>
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          rows={3}
          placeholder="e.g. Qualify inbound enterprise leads and book meetings…"
          className="modal-input mt-5 resize-none"
          autoFocus
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {OBJECTIVE_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setObjective(s)}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              {s.length > 42 ? `${s.slice(0, 42)}…` : s}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => create(objective)}
          disabled={!objective.trim()}
          className="mt-5 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Create worker
        </button>
      </div>
    </div>
  )
}

/* A slim toast for store notices (autonomy, evolution, teach). */
function Notice({ text }: { text: string }) {
  useEffect(() => {
    const t = setTimeout(() => studioStore.dismissNotice(), 4000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 shadow-lg">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="text-[12px] text-foreground">{text}</span>
        <button
          type="button"
          onClick={() => studioStore.dismissNotice()}
          className="text-[12px] text-muted-foreground transition hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

export default function StudioPage() {
  const s = useStudio()

  // hydrate the store from localStorage once on mount
  useEffect(() => {
    studioStore.hydrate()
  }, [])

  // avoid hydration mismatch: render a stable shell until the store is ready
  if (!s.hydrated) {
    return (
      <StudioShell>
        <div className="flex min-h-[calc(100vh-3.25rem)] items-center justify-center bg-grid-light">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Loading…</span>
        </div>
      </StudioShell>
    )
  }

  if (!s.worker) {
    return (
      <StudioShell>
        <CreateWorker />
        {s.notice && <Notice text={s.notice} />}
      </StudioShell>
    )
  }

  const running = s.worker.status === "working" || s.worker.status === "waiting"

  return (
    <StudioShell>
      {/* three zones: BUILD · FABRIC · LIVE RESULT */}
      <div className="grid h-[calc(100vh-3.25rem)] grid-cols-1 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-h-0 overflow-hidden border-r border-border max-lg:h-auto max-lg:border-b">
          <BuildPanel />
        </div>
        <div className="relative min-h-0 border-r border-border max-lg:h-[60vh] max-lg:border-b">
          <FabricPanel
            worker={s.worker}
            activeCapability={s.activeCapability}
            capPulse={s.capPulse}
            activeRun={s.activeRun}
            running={running}
          />
        </div>
        <div className="min-h-0 overflow-hidden bg-background max-lg:h-[70vh]">
          <ResultPanel
            worker={s.worker}
            activeRun={s.activeRun}
            history={s.history}
            showTrace={s.showTrace}
            running={running}
          />
        </div>
      </div>
      {s.notice && <Notice text={s.notice} />}
    </StudioShell>
  )
}
