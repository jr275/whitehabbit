"use client"

/* ================================================================== *
 * WORKERS — the real Worker directory (section 3/4 of the
 * productization brief). Reads GET /api/observatory/workers — the
 * SAME real, org-scoped, DB-backed aggregate Observatory's own Worker
 * health panel already uses; this page doesn't run a second query, it
 * just shows more of what that one already returns, plus search/
 * filter/sort. Search/filter/sort are all client-side over this one
 * real (small, org-bounded) list — never a second network round trip
 * for a UI-only refinement.
 * ================================================================== */

import { ArrowRight, Search } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { EmptyState } from "@/components/shared/empty-state"
import { TonePill } from "@/components/shared/tone-pill"
import type { WorkerHealth } from "@/components/observatory/types"
import { classifyWorkerHealth, classifyWorkerRuntimeStatus, WORKER_HEALTH_STATE_META, WORKER_RUNTIME_STATUS_META, type WorkerRuntimeStatus } from "@/lib/workforce/health"

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

type SortKey = "name" | "status" | "executions" | "successRate" | "avgDuration" | "outputs" | "lastRun" | "updated"

const STATUS_OPTIONS: WorkerRuntimeStatus[] = ["draft", "building", "ready", "live", "running", "idle", "failed"]

export function WorkersDirectory() {
  const [workers, setWorkers] = useState<WorkerHealth[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<WorkerRuntimeStatus | "">("")
  const [sortKey, setSortKey] = useState<SortKey>("updated")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  useEffect(() => {
    fetch("/api/observatory/workers", { headers: { "content-type": "application/json" } })
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
        setWorkers(body.workers)
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load Workers."))
  }, [])

  const rows = useMemo(() => {
    if (!workers) return []
    const withStatus = workers.map((w) => ({ w, status: classifyWorkerRuntimeStatus(w), health: classifyWorkerHealth(w) }))
    const filtered = withStatus.filter(({ w, status }) => {
      if (statusFilter && status !== statusFilter) return false
      if (search.trim() && !w.workerName.toLowerCase().includes(search.trim().toLowerCase())) return false
      return true
    })
    const dir = sortDir === "asc" ? 1 : -1
    return filtered.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * a.w.workerName.localeCompare(b.w.workerName)
        case "status":
          return dir * a.status.localeCompare(b.status)
        case "executions":
          return dir * (a.w.executions - b.w.executions)
        case "successRate":
          return dir * ((a.w.successRate ?? -1) - (b.w.successRate ?? -1))
        case "avgDuration":
          return dir * ((a.w.avgDurationMs ?? -1) - (b.w.avgDurationMs ?? -1))
        case "outputs":
          return dir * (a.w.outputs - b.w.outputs)
        case "lastRun":
          return dir * ((a.w.lastExecutionAt ?? 0) - (b.w.lastExecutionAt ?? 0))
        case "updated":
        default:
          return dir * (a.w.updatedAt - b.w.updatedAt)
      }
    })
  }, [workers, search, statusFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  const hydrated = workers != null
  const isEmpty = hydrated && workers!.length === 0

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Who is working</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">Workers</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
            Every real Worker in this workspace — its lifecycle state, released version, and real execution/output history.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-primary-foreground transition-opacity hover:opacity-90"
        >
          Create Worker
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {error && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{error}</p>}

      {!hydrated ? (
        <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Loading…</p>
      ) : isEmpty ? (
        <EmptyState title="No Workers yet." description="Create your first Worker from the Factory and it will appear here immediately." ctaHref="/" ctaLabel="Create a Worker" />
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Workers…"
                className="w-40 bg-transparent font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as WorkerRuntimeStatus | "")}
              className="rounded-lg border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-foreground outline-none"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {WORKER_RUNTIME_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-border/60 bg-card/40">
            <table className="w-full min-w-[980px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border/60 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <Th label="Worker" onClick={() => toggleSort("name")} />
                  <Th label="Status" onClick={() => toggleSort("status")} />
                  <th className="px-4 py-2.5 font-medium">Health</th>
                  <th className="px-4 py-2.5 font-medium">Version</th>
                  <Th label="Executions" onClick={() => toggleSort("executions")} />
                  <Th label="Success rate" onClick={() => toggleSort("successRate")} />
                  <Th label="Avg duration" onClick={() => toggleSort("avgDuration")} />
                  <Th label="Outputs" onClick={() => toggleSort("outputs")} />
                  <Th label="Last execution" onClick={() => toggleSort("lastRun")} />
                  <Th label="Updated" onClick={() => toggleSort("updated")} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map(({ w, status, health }) => (
                  <tr key={w.workerId} className="transition-colors hover:bg-secondary/30">
                    <td className="px-4 py-2.5">
                      <Link href={`/workforce/${w.workerId}`} className="font-medium text-foreground hover:text-primary">
                        {w.workerName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <TonePill label={WORKER_RUNTIME_STATUS_META[status].label} tone={WORKER_RUNTIME_STATUS_META[status].tone} />
                    </td>
                    <td className="px-4 py-2.5">
                      <TonePill label={WORKER_HEALTH_STATE_META[health].label} tone={WORKER_HEALTH_STATE_META[health].tone} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{w.releasedVersionNumber != null ? `v${w.releasedVersionNumber}` : "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{w.executions}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{w.successRate == null ? "—" : `${Math.round(w.successRate * 100)}%`}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{w.avgDurationMs != null ? `${(w.avgDurationMs / 1000).toFixed(1)}s` : "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{w.outputs}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{w.lastExecutionAt != null ? timeAgo(w.lastExecutionAt) : "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{timeAgo(w.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-border bg-card/40 px-5 py-8 text-center text-[13px] text-muted-foreground">No Workers match these filters.</p>}
        </>
      )}
    </div>
  )
}

function Th({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <th className="px-4 py-2.5 font-medium">
      <button onClick={onClick} className="transition-colors hover:text-foreground">
        {label}
      </button>
    </th>
  )
}
