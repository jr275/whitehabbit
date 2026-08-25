"use client"

/* ================================================================== *
 * OUTPUTS HUB — the operating system for Worker productivity.
 * The first question this page answers: what did my Workers actually
 * do? Everything below reads from the same workforceStore that Studio
 * writes to — a Run Worker click shows up here immediately.
 * ================================================================== */

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ActiveWork } from "@/components/outputs/active-work"
import { BusinessImpactHeader } from "@/components/outputs/business-impact-header"
import { EvolveSection } from "@/components/outputs/evolve-section"
import { OutputsHeader } from "@/components/outputs/header-metrics"
import { OutputDrawer, type DrawerFilter } from "@/components/outputs/output-drawer"
import { OutputTable } from "@/components/outputs/output-table"
import { ResultCards } from "@/components/outputs/result-cards"
import { ActivityTimeline } from "@/components/outputs/timeline"
import { WorkerOutputCard } from "@/components/outputs/worker-card"
import { WorkforcePanel } from "@/components/outputs/workforce-panel"
import { getProduct } from "@/lib/products/catalog"
import { OUTPUT_TYPE_META } from "@/lib/workforce/model"
import { headerMetrics, recentResults, todaysTimeline, workerSkillContribution } from "@/lib/workforce/selectors"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

export function OutputsHub() {
  const { hydrated, workers, tasks, executions, outputs, metrics, businessEvents, events } = useWorkforce()
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    workforceStore.hydrate()
  }, [])

  // Real deep link from Observatory (or anywhere else): /outputs?execution=<id>
  // opens the SAME OutputDrawer used everywhere else on this page — never a
  // second execution-detail UI. Clears the query param once opened so a
  // refresh/back-navigation doesn't keep forcing the drawer back open.
  useEffect(() => {
    const executionId = searchParams.get("execution")
    if (!executionId || !hydrated) return
    setDrawer({ kind: "execution", executionId })
    router.replace("/outputs")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, searchParams])

  // Super Agent context (section 8) — every Worker provisioned from a
  // Product with a real metric domain. Not shown at all when the org
  // has none (a hand-assembled Worker with no Product), and not a tab
  // bar when there's only one — nothing to switch between.
  const superAgents = useMemo(
    () =>
      workers
        .map((w) => ({ worker: w, product: w.productId ? getProduct(w.productId) : undefined }))
        .filter((x): x is { worker: (typeof workers)[number]; product: NonNullable<ReturnType<typeof getProduct>> } => !!x.product && !!x.product.metricDomain),
    [workers],
  )
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null)
  const selected = superAgents.find((s) => s.worker.id === selectedWorkerId) ?? superAgents[0]

  if (!hydrated) {
    return <div className="mx-auto max-w-[1400px] px-5 py-16 text-center text-[13px] text-muted-foreground sm:px-8">Loading outputs…</div>
  }

  const openType = (workerId: string, type: string) => setDrawer({ kind: "type", workerId, type, title: OUTPUT_TYPE_META[type]?.plural ?? type })
  const openExecution = (executionId: string) => setDrawer({ kind: "execution", executionId })

  const metricsHeader = headerMetrics(tasks, executions, outputs)
  const timeline = todaysTimeline(workers, executions, tasks, outputs)
  const results = recentResults(workers, tasks, executions, outputs, businessEvents, metrics, { workerId: selected?.worker.id, limit: 6 })
  const contributions = selected ? workerSkillContribution(selected.worker.id, tasks, outputs, businessEvents) : []

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8">
      <OutputsHeader metrics={metricsHeader} />

      {superAgents.length > 0 && selected && (
        <section className="mt-8">
          {superAgents.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {superAgents.map((s) => (
                <button
                  key={s.worker.id}
                  onClick={() => setSelectedWorkerId(s.worker.id)}
                  className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                    selected.worker.id === s.worker.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.product.name}
                </button>
              ))}
            </div>
          )}
          <BusinessImpactHeader
            domainKey={selected.product.metricDomain!}
            domainLabel={selected.product.name.toUpperCase()}
            workerId={selected.worker.id}
            accent={selected.product.accent}
            metrics={metrics}
            executions={executions}
          />
        </section>
      )}

      {selected && (
        <section className="mt-10">
          <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">Results — {selected.product.name}</h2>
          <ResultCards results={results} onInspect={openExecution} />
        </section>
      )}

      {selected && (
        <div className="mt-10">
          <WorkforcePanel worker={selected.worker} domainLabel={selected.product.name} contributions={contributions} />
        </div>
      )}

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
        <EvolveSection workers={workers} metrics={metrics} tasks={tasks} />
      </div>

      {drawer && (
        <OutputDrawer filter={drawer} workers={workers} tasks={tasks} executions={executions} outputs={outputs} events={events} businessEvents={businessEvents} metrics={metrics} onClose={() => setDrawer(null)} />
      )}
    </div>
  )
}
