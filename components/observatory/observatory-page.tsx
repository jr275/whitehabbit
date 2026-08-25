"use client"

/* ================================================================== *
 * OBSERVATORY — the real operational surface: "what is happening?"
 * Every number/row here is read from the real runtime tables via
 * GET /api/observatory/* (lib/db/repo.ts) — no lib/workforce-demo,
 * no hardcoded numbers, no seeded fake metrics. Polling, not a
 * WebSocket/SSE connection (section 14): refreshAll() is the single
 * seam a future real-time transport would call instead of a timer.
 * ================================================================== */

import { useCallback, useEffect, useState } from "react"
import { ActivityFeed } from "./activity-feed"
import { ObservatoryEmptyState } from "./empty-state"
import { ExecutionsTable } from "./executions-table"
import { ObservatoryFiltersBar } from "./filters-bar"
import { SummaryCards } from "./summary-cards"
import type { ActivityItem, ExecutionListItem, ExecutionSummary, ObservatoryFilters, WorkerHealth } from "./types"
import { WorkerHealthTable } from "./worker-health"

const EXECUTIONS_PAGE_SIZE = 20
const POLL_MS = 20_000

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { "content-type": "application/json" } })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Request to ${path} failed (${res.status})`)
  return body as T
}

function buildQuery(filters: ObservatoryFilters, extra: Record<string, string | number | undefined> = {}): string {
  const params = new URLSearchParams()
  if (filters.workerId) params.set("workerId", filters.workerId)
  if (filters.status) params.set("status", filters.status)
  if (filters.sinceMs != null) params.set("sinceMs", String(filters.sinceMs))
  if (filters.approvalState) params.set("approvalState", filters.approvalState)
  for (const [k, v] of Object.entries(extra)) {
    if (v != null) params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ""
}

export function ObservatoryPage() {
  const [filters, setFilters] = useState<ObservatoryFilters>({})
  const [rangeMs, setRangeMs] = useState("")
  const [offset, setOffset] = useState(0)

  const [summary, setSummary] = useState<ExecutionSummary | null>(null)
  const [executions, setExecutions] = useState<{ items: ExecutionListItem[]; total: number } | null>(null)
  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [workers, setWorkers] = useState<WorkerHealth[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const effectiveFilters: ObservatoryFilters = { ...filters, sinceMs: rangeMs ? Date.now() - Number(rangeMs) : undefined }

  const refreshAll = useCallback(async () => {
    try {
      const [summaryRes, executionsRes, activityRes, workersRes] = await Promise.all([
        api<{ summary: ExecutionSummary }>(`/api/observatory/summary${buildQuery(effectiveFilters)}`),
        api<{ items: ExecutionListItem[]; total: number }>(`/api/observatory/executions${buildQuery(effectiveFilters, { limit: EXECUTIONS_PAGE_SIZE, offset })}`),
        api<{ activity: ActivityItem[] }>(`/api/observatory/activity${filters.workerId ? `?workerId=${encodeURIComponent(filters.workerId)}` : ""}`),
        api<{ workers: WorkerHealth[] }>("/api/observatory/workers"),
      ])
      setSummary(summaryRes.summary)
      setExecutions(executionsRes)
      setActivity(activityRes.activity)
      setWorkers(workersRes.workers)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Observatory data.")
    }
    // effectiveFilters is derived fresh each render from filters/rangeMs — depend on those instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.workerId, filters.status, filters.approvalState, rangeMs, offset])

  useEffect(() => {
    refreshAll()
    const id = setInterval(refreshAll, POLL_MS)
    return () => clearInterval(id)
  }, [refreshAll])

  // Any filter change resets pagination back to the first page.
  function updateFilters(next: ObservatoryFilters) {
    setFilters(next)
    setOffset(0)
  }
  function updateRange(next: string) {
    setRangeMs(next)
    setOffset(0)
  }

  const hydrated = summary != null && executions != null && activity != null && workers != null
  const hasAnyFilter = !!(filters.workerId || filters.status || filters.approvalState || rangeMs)
  const isEmptyWorkspace = hydrated && summary!.total === 0 && !hasAnyFilter

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Operational activity</p>
      <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">Observatory</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
        What is actually happening across every real Worker execution in this workspace — read directly from the runtime, not a simulation.
      </p>

      {error && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{error}</p>}

      {!hydrated ? (
        <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Loading…</p>
      ) : isEmptyWorkspace ? (
        <ObservatoryEmptyState />
      ) : (
        <>
          <ObservatoryFiltersBar filters={filters} rangeMs={rangeMs} workers={workers!} onChange={updateFilters} onRangeChange={updateRange} />

          <div className="mt-5">
            <SummaryCards summary={summary!} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Recent executions</h2>
              <ExecutionsTable items={executions!.items} total={executions!.total} limit={EXECUTIONS_PAGE_SIZE} offset={offset} onPage={setOffset} />
            </section>

            <aside>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Recent activity</h2>
              <ActivityFeed items={activity!} />
            </aside>
          </div>

          <section className="mt-8">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Worker health</h2>
            <WorkerHealthTable workers={workers!} />
          </section>
        </>
      )}
    </div>
  )
}
