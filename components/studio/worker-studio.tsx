"use client"

/* ================================================================== *
 * WORKER STUDIO — the real product surface.
 *
 * A single spatial environment split into three functional zones, all
 * projections of ONE source of truth (studioStore):
 *
 *   LEFT   — BUILD   : configure + build + release the worker
 *   CENTER — FABRIC  : the living worker; run tasks; watch it work
 *   RIGHT  — RESULT  : live event stream, decision, outcome, trace, history
 *
 * The center dominates. This is not a dashboard — the Fabric is the hero.
 * ================================================================== */

import Link from "next/link"
import { ArrowLeft, Plus } from "lucide-react"
import { useEffect } from "react"
import { BuildPanel } from "@/components/studio/build-panel"
import { FabricPanel } from "@/components/studio/fabric-panel"
import { ResultPanel } from "@/components/studio/result-panel"
import { studioStore, useStudio } from "@/lib/worker/worker-state"

/* status → header pill styling, driven by the real state machine */
const STATUS_STYLE: Record<string, { cls: string; label: string; pulse?: boolean }> = {
  draft: { cls: "border-white/15 text-white/55", label: "DRAFT" },
  ready: { cls: "border-[#7d8cff]/40 text-[#9aa6ff]", label: "READY" },
  live: { cls: "border-[#3ddc84]/40 text-[#3ddc84]", label: "LIVE", pulse: true },
  idle: { cls: "border-[#3ddc84]/40 text-[#3ddc84]", label: "LIVE", pulse: true },
  working: { cls: "border-[#7d8cff]/50 text-[#9aa6ff]", label: "RUNNING", pulse: true },
  waiting: { cls: "border-[#e0a53d]/50 text-[#e0a53d]", label: "WAITING", pulse: true },
}

export function WorkerStudio() {
  const { hydrated, worker, activeCapability, capPulse, activeRun, history, showTrace, runningTaskId } =
    useStudio()

  // restore persisted worker on mount (single source of truth)
  useEffect(() => {
    studioStore.hydrate()
  }, [])

  if (!hydrated) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#07080e]">
        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/40">Loading studio…</span>
      </div>
    )
  }

  // no worker yet — send the user back to CREATE
  if (!worker) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-[#07080e] px-6 text-center">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/40">Worker Studio</p>
          <h1 className="mt-3 text-balance text-2xl font-medium text-white">No worker assembled yet</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/50">
            Start on the create screen — describe what your worker should do, and it will be assembled here.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-[#5a6ef0] px-6 py-3 font-mono text-[12px] uppercase tracking-[0.2em] text-white transition hover:bg-[#6a7cf5]"
        >
          <Plus className="h-3.5 w-3.5" />
          Create a worker
        </Link>
      </div>
    )
  }

  const running = !!runningTaskId
  const status = STATUS_STYLE[worker.status] ?? STATUS_STYLE.draft

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#07080e] text-white">
      {/* header — WORKER STUDIO · identity · status */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-white/10 bg-[#0a0b12] px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 transition hover:text-white/70"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Studio</span>
        </Link>
        <span className="h-4 w-px bg-white/10" />
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/40">Worker Studio</span>
          <span className="text-[15px] font-semibold tracking-tight text-white">{worker.name}</span>
          <span className="hidden min-w-0 truncate text-[12px] text-white/45 md:inline">{worker.objective}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-[11px] text-white/40">v{worker.version || "0.0"}</span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${status.cls}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full bg-current ${status.pulse ? "animate-pulse" : ""}`} />
            {status.label}
          </span>
        </div>
      </header>

      {/* three functional zones — the center dominates */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)_23rem]">
        {/* LEFT — BUILD */}
        <aside className="hidden min-h-0 flex-col border-r border-white/10 bg-[#0a0b12] lg:flex">
          <ZoneLabel>Build</ZoneLabel>
          <div className="min-h-0 flex-1">
            <BuildPanel />
          </div>
        </aside>

        {/* CENTER — FABRIC (hero) */}
        <main className="relative min-h-0">
          <FabricPanel
            worker={worker}
            activeCapability={activeCapability}
            capPulse={capPulse}
            activeRun={activeRun}
            running={running}
          />
        </main>

        {/* RIGHT — RESULT */}
        <aside className="hidden min-h-0 flex-col border-l border-white/10 bg-[#0a0b12] lg:flex">
          <ZoneLabel>Result</ZoneLabel>
          <div className="min-h-0 flex-1">
            <ResultPanel
              worker={worker}
              activeRun={activeRun}
              history={history}
              showTrace={showTrace}
              running={running}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}

function ZoneLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 border-b border-white/10 px-4 py-2.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-white/35">{children}</span>
    </div>
  )
}
