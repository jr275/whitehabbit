"use client"

/* ================================================================== *
 * OUTPUTS HUB — the operating system for Worker productivity.
 * The first question this page answers: what did my Workers actually
 * do? Everything below reads from the same workforceStore that Studio
 * writes to — a Run Worker click shows up here immediately.
 * ================================================================== */

import { useEffect, useState } from "react"
import { ActiveWork } from "@/components/outputs/active-work"
import { EvolveSection } from "@/components/outputs/evolve-section"
import { OutputsHeader } from "@/components/outputs/header-metrics"
import { OutputDrawer, type DrawerFilter } from "@/components/outputs/output-drawer"
import { OutputTable } from "@/components/outputs/output-table"
import { ActivityTimeline } from "@/components/outputs/timeline"
import { WorkerOutputCard } from "@/components/outputs/worker-card"
import { OUTPUT_TYPE_META } from "@/lib/workforce/model"
import { headerMetrics, todaysTimeline } from "@/lib/workforce/selectors"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

export function OutputsHub() {
  const { hydrated, workers, tasks, executions, outputs, metrics, events } = useWorkforce()
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null)

  useEffect(() => {
    workforceStore.hydrate()
  }, [])

  if (!hydrated) {
    return <div className="mx-auto max-w-[1400px] px-5 py-16 text-center text-[13px] text-muted-foreground sm:px-8">Loading outputs…</div>
  }

  const openType = (workerId: string, type: string) => setDrawer({ kind: "type", workerId, type, title: OUTPUT_TYPE_META[type]?.plural ?? type })
  const openExecution = (executionId: string) => setDrawer({ kind: "execution", executionId })

  const metricsHeader = headerMetrics(tasks, executions, outputs)
  const timeline = todaysTimeline(workers, executions, tasks, outputs)

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8">
      <OutputsHeader metrics={metricsHeader} />

      <section className="mt-10">
        <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">Today&apos;s Work</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workers.map((w) => (
            <WorkerOutputCard key={w.id} worker={w} tasks={tasks} outputs={outputs} running={workforceStore.isRunning(w.id)} onOpenType={openType} />
          ))}
        </div>
      </section>

      <div className="mt-10">
        <ActiveWork workers={workers} executions={executions} tasks={tasks} events={events} />
      </div>

      <section className="mt-10">
        <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">All Executions</h2>
        <OutputTable workers={workers} tasks={tasks} executions={executions} outputs={outputs} onOpenExecution={openExecution} />
      </section>

      <div className="mt-10">
        <ActivityTimeline entries={timeline} onOpen={openExecution} />
      </div>

      <div className="mt-10 border-t border-border pt-10">
        <EvolveSection workers={workers} metrics={metrics} />
      </div>

      {drawer && <OutputDrawer filter={drawer} workers={workers} tasks={tasks} executions={executions} outputs={outputs} onClose={() => setDrawer(null)} />}
    </div>
  )
}
