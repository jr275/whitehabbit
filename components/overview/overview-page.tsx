"use client"

/* ================================================================== *
 * OVERVIEW — the real operational home: "Active Agents / Tasks
 * Running / Tasks Completed / Connector Health / Recent Executions /
 * Recent Outputs / AI Workforce Activity" (product brief). Every
 * number here comes from an EXISTING endpoint already used elsewhere
 * in the product — no new API route:
 *   GET /api/observatory/workers    (Active Agents)
 *   GET /api/observatory/summary    (Tasks Running / Completed)
 *   GET /api/system/health          (Connector Health)
 *   GET /api/observatory/executions (Recent Executions)
 *   GET /api/observatory/outputs    (Recent Outputs — this route
 *                                    previously had no real caller)
 *   GET /api/observatory/activity   (AI Workforce Activity — reuses
 *                                    components/observatory/activity-
 *                                    feed.tsx verbatim, same component,
 *                                    not a second timeline)
 *
 * This is the app's real front door now (was "/", the Assemble Worker
 * flow, moved unchanged to /new) — so unlike Observatory/Integrations
 * (which nobody reaches without already being signed in via nav), an
 * unauthenticated visitor lands here directly. The unauthenticated
 * state offers BOTH a sign-in link and the same "describe a job" entry
 * point /new already provides (which itself still handles anonymous
 * guest registration, unchanged) — so nothing about the previous
 * anonymous-visitor experience is lost, just relocated.
 * ================================================================== */

import { ArrowRight, Plug } from "lucide-react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ActivityFeed } from "@/components/observatory/activity-feed"
import { StatusPill } from "@/components/observatory/status-pill"
import type { ActivityItem, ExecutionListItem, ExecutionSummary, WorkerHealth } from "@/components/observatory/types"
import { EmptyState } from "@/components/shared/empty-state"
import { SkeletonRows, SkeletonTiles } from "@/components/shared/skeleton-rows"
import type { IntegrationHealth } from "@/app/api/system/health/route"
import type { WorkerOutput } from "@/lib/workforce/model"

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { "content-type": "application/json" } })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Request to ${path} failed (${res.status})`)
  return body as T
}

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

interface ConnectorHealthTally {
  connected: number
  needsAttention: number
  notConfigured: number
}

function tallyConnectorHealth(integrations: IntegrationHealth[]): ConnectorHealthTally {
  let connected = 0
  let needsAttention = 0
  let notConfigured = 0
  for (const i of integrations) {
    if (i.state === "healthy") connected++
    else if (i.state === "auth_error" || i.state === "rate_limited" || i.state === "error" || i.state === "degraded") needsAttention++
    else notConfigured++
  }
  return { connected, needsAttention, notConfigured }
}

export function OverviewPage() {
  const { status: sessionStatus } = useSession()
  const [workers, setWorkers] = useState<WorkerHealth[] | null>(null)
  const [summary, setSummary] = useState<ExecutionSummary | null>(null)
  const [integrations, setIntegrations] = useState<IntegrationHealth[] | null>(null)
  const [executions, setExecutions] = useState<ExecutionListItem[] | null>(null)
  const [outputs, setOutputs] = useState<WorkerOutput[] | null>(null)
  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionStatus !== "authenticated") return
    let cancelled = false
    async function load() {
      try {
        const [workersRes, summaryRes, healthRes, executionsRes, outputsRes, activityRes] = await Promise.all([
          api<{ workers: WorkerHealth[] }>("/api/observatory/workers"),
          api<{ summary: ExecutionSummary }>("/api/observatory/summary"),
          api<{ integrations: IntegrationHealth[] }>("/api/system/health"),
          api<{ items: ExecutionListItem[]; total: number }>("/api/observatory/executions?limit=5"),
          api<{ outputs: WorkerOutput[] }>("/api/observatory/outputs?limit=5"),
          api<{ activity: ActivityItem[] }>("/api/observatory/activity"),
        ])
        if (cancelled) return
        setWorkers(workersRes.workers)
        setSummary(summaryRes.summary)
        setIntegrations(healthRes.integrations)
        setExecutions(executionsRes.items)
        setOutputs(outputsRes.outputs)
        setActivity(activityRes.activity.slice(0, 8))
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load Overview data.")
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [sessionStatus])

  if (sessionStatus !== "authenticated") {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-16 text-center sm:px-8">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">WhiteHabbit</p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">Your AI Agent Operating System</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">Sign in to see what your Agents are doing, or describe a new one to get started.</p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" className="rounded-full border border-border px-5 py-2.5 text-[13px] font-medium text-foreground hover:bg-secondary">
            Sign in
          </Link>
          <Link href="/new" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.16em] text-primary-foreground hover:opacity-90">
            New Agent <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    )
  }

  const hydrated = workers != null && summary != null && integrations != null && executions != null && outputs != null && activity != null
  const isEmptyWorkspace = hydrated && workers!.length === 0 && summary!.total === 0

  const activeAgents = workers?.filter((w) => w.workerStatus === "live").length ?? 0
  const health = integrations ? tallyConnectorHealth(integrations) : null
  const workerNameById = new Map((workers ?? []).map((w) => [w.workerId, w.workerName]))

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Operating system</p>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">Overview</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">Your AI workforce, at a glance — real Agents, real Connectors, real work.</p>
        </div>
        <Link href="/new" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 font-mono text-[12px] uppercase tracking-[0.16em] text-primary-foreground hover:opacity-90">
          New Agent <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {error && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{error}</p>}

      {!hydrated ? (
        <div className="mt-8">
          <SkeletonTiles count={4} />
          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <SkeletonRows count={5} />
            <SkeletonRows count={5} />
          </div>
        </div>
      ) : isEmptyWorkspace ? (
        <EmptyState title="No Agents yet" description="Describe a job in plain language and WhiteHabbit assembles a real Agent for it — skills, tools, and connectors pre-wired." ctaHref="/new" ctaLabel="New Agent" />
      ) : (
        <>
          {/* stat tiles */}
          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-4">
            <Tile label="Active Agents" value={String(activeAgents)} />
            <Tile label="Tasks Running" value={String(summary!.running)} />
            <Tile label="Tasks Completed" value={String(summary!.completed)} />
            <ConnectorHealthTile health={health!} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex flex-col gap-6">
              {/* recent executions */}
              <section>
                <div className="flex items-center justify-between">
                  <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Recent executions</h2>
                  <Link href="/observatory" className="text-[12px] text-primary hover:underline">
                    View all
                  </Link>
                </div>
                {executions!.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-center text-[12.5px] text-muted-foreground">No executions yet.</p>
                ) : (
                  <div className="mt-3 flex flex-col divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card/40">
                    {executions!.map((e) => (
                      <Link key={e.id} href={`/outputs?execution=${encodeURIComponent(e.id)}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-secondary/30">
                        <span className="min-w-0 truncate text-[12.5px] font-medium text-foreground">{e.workerName}</span>
                        <span className="flex shrink-0 items-center gap-2.5">
                          <StatusPill status={e.status} />
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{timeAgo(e.startedAt)}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {/* recent outputs */}
              <section>
                <div className="flex items-center justify-between">
                  <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Recent outputs</h2>
                  <Link href="/outputs" className="text-[12px] text-primary hover:underline">
                    View all
                  </Link>
                </div>
                {outputs!.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-center text-[12.5px] text-muted-foreground">No outputs yet.</p>
                ) : (
                  <div className="mt-3 flex flex-col divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card/40">
                    {outputs!.map((o) => (
                      <Link key={o.id} href={`/outputs?execution=${encodeURIComponent(o.executionId)}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-secondary/30">
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-medium text-foreground">{o.title}</p>
                          <p className="truncate text-[11.5px] text-muted-foreground">{workerNameById.get(o.workerId) ?? o.workerId}</p>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{timeAgo(o.createdAt)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* AI Workforce Activity */}
            <aside>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">AI Workforce Activity</h2>
              <ActivityFeed items={activity!} />
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  )
}

function ConnectorHealthTile({ health }: { health: ConnectorHealthTally }) {
  return (
    <Link href="/integrations" className="flex flex-col justify-between bg-card px-4 py-3 transition-colors hover:bg-secondary/40">
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
        <Plug className="h-3 w-3" /> Connector Health
      </div>
      <div className="mt-1 flex items-baseline gap-2.5">
        <span className="text-lg font-semibold tabular-nums text-grow">{health.connected}</span>
        {health.needsAttention > 0 && <span className="font-mono text-[11px] tabular-nums text-warn">{health.needsAttention} need attention</span>}
      </div>
    </Link>
  )
}
