"use client"

import { useState } from "react"
import { StudioFabric } from "@/components/studio/studio-fabric"
import { studioStore } from "@/lib/worker/worker-state"
import type { RunResult, Worker } from "@/lib/worker/worker-model"

const SUGGESTIONS = [
  "Qualify Acme Corp as an enterprise lead",
  "Find the economic buyer at Northwind",
  "Prepare a contract for Initech",
]

export function FabricPanel({
  worker,
  activeCapability,
  capPulse,
  activeRun,
  running,
}: {
  worker: Worker
  activeCapability: string | null
  capPulse: Record<string, number>
  activeRun: RunResult | null
  running: boolean
}) {
  const [task, setTask] = useState("")
  const released = worker.status !== "draft" && worker.status !== "ready"
  const canRun = released && !running

  const submit = (value: string) => {
    const v = value.trim()
    if (!v || !canRun) return
    studioStore.runTask(v)
    setTask("")
  }

  return (
    <div className="flex h-full flex-col">
      {/* the living fabric */}
      <div className="relative flex-1">
        <StudioFabric
          capabilities={worker.capabilities}
          status={worker.status}
          activeCapability={activeCapability}
          capPulse={capPulse}
          workerName={worker.name}
          running={running}
        />

        {/* current action ticker, over the fabric */}
        {activeRun && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 w-[min(90%,26rem)] -translate-x-1/2">
            <div className="rounded-lg border border-white/10 bg-black/50 px-4 py-2.5 backdrop-blur-md">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                #{activeRun.id} · {worker.name}
              </p>
              <p className="mt-0.5 truncate text-[13px] text-white/90">{activeRun.currentAction}</p>
            </div>
          </div>
        )}

        {!released && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0b12]/70 backdrop-blur-sm">
            <div className="max-w-xs text-center">
              <p className="text-sm font-medium text-white/90">Worker not yet live</p>
              <p className="mt-1 text-xs text-white/50">
                Build and release the worker to run tasks and watch it work.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* run-task control */}
      <div className="border-t border-white/10 bg-[#0d0e16] p-3">
        <div className="flex items-center gap-2">
          <input
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) submit(task)
            }}
            placeholder={canRun ? "Give your worker a task…" : running ? "Worker is running…" : "Release the worker first"}
            disabled={!canRun}
            className="flex-1 rounded-md border border-white/12 bg-white/5 px-3 py-2 text-[13px] text-white placeholder:text-white/35 outline-none focus-visible:border-[#7d8cff]/60 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => submit(task)}
            disabled={!canRun || !task.trim()}
            className="shrink-0 rounded-md bg-[#5a6ef0] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[#6a7cf5] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Run task
          </button>
        </div>
        {canRun && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/55 transition hover:border-white/25 hover:text-white/80"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
