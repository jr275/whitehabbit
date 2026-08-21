"use client"

/* ================================================================== *
 * OUTPUTS HUB — the operating system for Worker productivity.
 * The first question this page answers: what did my Workers actually
 * do? Everything below reads from the same workforceStore that Studio
 * writes to — a Run Worker click here shows up immediately.
 * ================================================================== */

import { useEffect, useState } from "react"
import { ActiveWork } from "@/components/outputs/active-work"
import { EvolveSection } from "@/components/outputs/evolve-section"
import { OutputsHeader } from "@/components/outputs/header-metrics"
import { OutputDrawer } from "@/components/outputs/output-drawer"
import { OutputTable } from "@/components/outputs/output-table"
import { ActivityTimeline } from "@/components/outputs/timeline"
import { WorkerOutputCard } from "@/components/outputs/worker-card"
import { OUTPUT_TYPE_META, type OutputKind, type Worker, type WorkerOutput } from "@/lib/workforce/model"
import { headerMetrics, isToday, todaysTimeline } from "@/lib/workforce/selectors"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

interface DrawerState {
  title: string
  worker?: Worker
  outputs: WorkerOutput[]
}

export function OutputsHub() {
  const { hydrated, workers, tasks, executions, outputs } = useWorkforce()
  const [drawer, setDrawer] = useState<DrawerState | null>(null)

  useEffect(() => {
    workforceStore.hydrate()
  }, [])

  if (!hydrated) {
    return <div className="mx-auto max-w-[1400px] px-5 py-16 text-center text-[13px] text-muted-foreground sm:px-8">Loading outputs…</div>
  }

  const openType = (workerId: string, type: OutputKind) => {
    const worker = workers.find((w) => w.id === workerId)
    const list = outputs.filter((o) => o.workerId === workerId && o.type === type && isToday(o.createdAt))
    setDrawer({ title: OUTPUT_TYPE_META[type].plural, worker, outputs: list })
  }

  const openExecution = (executionId: string) => {
    const task = tasks.find((t) => executions.find((e) => e.id === executionId)?.taskId === t.id)
    const execution = executions.find((e) => e.id === executionId)
    const worker = workers.find((w) => w.id === execution?.workerId)
    const list = outputs.filter((o) => o.executionId === executionId)
    setDrawer({ title: task?.title ?? "Outputs", worker, outputs: list })
  }

  const metrics = headerMetrics(tasks, outputs)
  const timeline = todaysTimeline(workers, executions, tasks)

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8">
      <OutputsHeader metrics={metrics} />

      <section className="mt-10">
        <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">Today&apos;s Work</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workers.map((w) => (
            <WorkerOutputCard
              key={w.id}
              worker={w}
              tasks={tasks}
              outputs={outputs}
              running={workforceStore.isRunning(w.id)}
              onOpenType={openType}
            />
          ))}
        </div>
      </section>

      <div className="mt-10">
        <ActiveWork workers={workers} executions={executions} tasks={tasks} outputs={outputs} />
      </div>

      <section className="mt-10">
        <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">All Outputs</h2>
        <OutputTable workers={workers} tasks={tasks} executions={executions} outputs={outputs} onOpenExecution={openExecution} />
      </section>

      <div className="mt-10">
        <ActivityTimeline entries={timeline} onOpen={openExecution} />
      </div>

      <div className="mt-10 border-t border-border pt-10">
        <EvolveSection workers={workers} outputs={outputs} />
      </div>

      {drawer && <OutputDrawer outputs={drawer.outputs} worker={drawer.worker} title={drawer.title} onClose={() => setDrawer(null)} />}
    </div>
  )
}
