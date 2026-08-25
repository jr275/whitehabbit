"use client"

/* ================================================================== *
 * AGENT DETAIL — replaces the old app/workforce/[id]/page.tsx, which
 * rendered 100% fabricated demo content (lib/workforce-demo/) keyed
 * against a demo store that almost never matched a real DB id. This
 * is the real thing: GET /api/workers/[id] (live-hydrated tool
 * status) + useWorkforce()'s already-loaded tasks/executions (no new
 * fetch for those two tabs) + GET /api/observatory/outputs?workerId=
 * (a real, complete per-worker list — the store's own outputs array
 * is org-wide-capped, so this dedicated endpoint is more correct for
 * a worker that isn't among the most recently active) + GET
 * /api/connectors (to resolve a wired Connector's real action
 * labels/permissions for the Tools tab's Connector -> Action ->
 * Permission tree).
 *
 * Execution/Output detail is never a second UI here — clicking a row
 * opens the exact same OutputDrawer /outputs already uses, same as
 * Observatory's executions table.
 * ================================================================== */

import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { EXECUTION_STATUS_META, type Worker, type WorkerOutput } from "@/lib/workforce/model"
import { classifyWorkerHealth, classifyWorkerRuntimeStatus, WORKER_HEALTH_STATE_META, WORKER_RUNTIME_STATUS_META, type WorkerHealthInput } from "@/lib/workforce/health"
import { toolPermissionLabel, toolPermissionTone } from "@/lib/ui/permission-label"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"
import { TonePill } from "@/components/shared/tone-pill"
import { SkeletonRows } from "@/components/shared/skeleton-rows"
import { OutputDrawer, type DrawerFilter } from "@/components/outputs/output-drawer"

interface ConnectorActionSummary {
  id: string
  label: string
  permission: "read" | "write" | "publish" | "delete" | "financial" | "external_communication"
  riskLevel: "low" | "medium" | "high" | "critical"
}
interface ConnectorSummary {
  id: string
  name: string
  actions: ConnectorActionSummary[]
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "skills", label: "Skills" },
  { key: "tools", label: "Tools" },
  { key: "tasks", label: "Tasks" },
  { key: "executions", label: "Executions" },
  { key: "outputs", label: "Outputs" },
  { key: "settings", label: "Settings" },
] as const
type Tab = (typeof TABS)[number]["key"]

const RISK_TONE: Record<string, "good" | "info" | "warn" | "bad" | "muted"> = { low: "muted", medium: "info", high: "warn", critical: "bad" }

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
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function WorkerDetail({ id }: { id: string }) {
  const { workers, tasks, executions, events, businessEvents, metrics } = useWorkforce()
  const [worker, setWorker] = useState<Worker | null>(null)
  const [connectors, setConnectors] = useState<ConnectorSummary[] | null>(null)
  const [workerOutputs, setWorkerOutputs] = useState<WorkerOutput[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<Tab>("overview")
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null)

  useEffect(() => {
    workforceStore.hydrate()
    let cancelled = false
    async function load() {
      try {
        const workerRes = await fetch(`/api/workers/${encodeURIComponent(id)}`, { headers: { "content-type": "application/json" } })
        if (workerRes.status === 404) {
          if (!cancelled) setNotFound(true)
          return
        }
        const workerBody = await workerRes.json().catch(() => null)
        if (!workerRes.ok) throw new Error(workerBody?.error ?? `Request failed (${workerRes.status})`)
        const [connectorsRes, outputsRes] = await Promise.all([
          api<{ connectors: ConnectorSummary[] }>("/api/connectors"),
          api<{ outputs: WorkerOutput[] }>(`/api/observatory/outputs?workerId=${encodeURIComponent(id)}&limit=50`),
        ])
        if (cancelled) return
        setWorker(workerBody.worker)
        setConnectors(connectorsRes.connectors)
        setWorkerOutputs(outputsRes.outputs)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this Agent.")
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  if (notFound) {
    return (
      <div className="mx-auto max-w-[900px] px-5 py-16 text-center sm:px-8">
        <p className="text-[14px] text-muted-foreground">This Agent doesn&apos;t exist, or isn&apos;t in your organization.</p>
        <Link href="/workforce" className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Agents
        </Link>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[900px] px-5 py-16 text-center sm:px-8">
        <p className="flex items-center justify-center gap-2 text-[14px] text-destructive">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      </div>
    )
  }

  if (!worker || !connectors || !workerOutputs) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8">
        <SkeletonRows count={6} />
      </div>
    )
  }

  const workerExecutions = executions.filter((e) => e.workerId === id)
  const workerTasks = tasks.filter((t) => t.workerId === id)
  const healthInput: WorkerHealthInput = {
    workerStatus: worker.status,
    executions: workerExecutions.length,
    successRate: workerExecutions.length ? workerExecutions.filter((e) => e.status === "completed").length / workerExecutions.length : null,
    lastExecutionStatus: workerExecutions[0]?.status ?? null,
  }
  const runtimeStatus = WORKER_RUNTIME_STATUS_META[classifyWorkerRuntimeStatus(healthInput)]
  const healthState = WORKER_HEALTH_STATE_META[classifyWorkerHealth(healthInput)]

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8">
      <Link href="/workforce" className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Agents
      </Link>

      {/* identity header */}
      <header className="mt-4 flex flex-wrap items-start gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl font-mono text-xl font-semibold" style={{ background: `${worker.identity.accent}22`, color: worker.identity.accent }}>
          {worker.identity.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{worker.identity.name}</h1>
            <TonePill label={runtimeStatus.label} tone={runtimeStatus.tone} />
            <TonePill label={healthState.label} tone={healthState.tone} />
          </div>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{worker.identity.role}</p>
          <p className="mt-2 max-w-2xl text-pretty text-[13px] leading-relaxed text-muted-foreground">{worker.mission}</p>
        </div>
      </header>

      {/* tabs */}
      <nav className="mt-6 flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
              tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {tab === "overview" && <OverviewTab worker={worker} healthInput={healthInput} />}
        {tab === "skills" && <SkillsTab worker={worker} />}
        {tab === "tools" && <ToolsTab worker={worker} connectors={connectors} />}
        {tab === "tasks" && <TasksTab tasks={workerTasks} executions={workerExecutions} onOpenExecution={(executionId) => setDrawer({ kind: "execution", executionId })} />}
        {tab === "executions" && <ExecutionsTab executions={workerExecutions} onOpen={(executionId) => setDrawer({ kind: "execution", executionId })} />}
        {tab === "outputs" && <OutputsTab outputs={workerOutputs} onOpen={(executionId) => setDrawer({ kind: "execution", executionId })} />}
        {tab === "settings" && <SettingsTab worker={worker} />}
      </div>

      {drawer && (
        <OutputDrawer filter={drawer} workers={workers} tasks={tasks} executions={executions} outputs={workforceStore.getSnapshot().outputs} events={events} businessEvents={businessEvents} metrics={metrics} onClose={() => setDrawer(null)} />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[18px] font-medium tabular-nums tracking-tight text-foreground">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

function OverviewTab({ worker, healthInput }: { worker: Worker; healthInput: WorkerHealthInput }) {
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_240px]">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">Identity</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{worker.identity.description}</p>
        {worker.identity.tone.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {worker.identity.tone.map((t) => (
              <span key={t} className="rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}
        {worker.objectives.length > 0 && (
          <>
            <h3 className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Objectives</h3>
            <ul className="mt-1.5 flex flex-col gap-1">
              {worker.objectives.map((o) => (
                <li key={o.id} className={`text-[13px] ${o.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  · {o.text}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <Stat label="Autonomy" value={worker.autonomy} />
        <Stat label="Skills enabled" value={String(worker.skills.filter((s) => s.enabled).length)} />
        <Stat label="Real executions" value={String(healthInput.executions)} />
        <Stat label="Success rate" value={healthInput.successRate == null ? "—" : `${Math.round(healthInput.successRate * 100)}%`} />
      </div>
    </div>
  )
}

function SkillsTab({ worker }: { worker: Worker }) {
  if (worker.skills.length === 0) return <p className="rounded-xl border border-dashed border-border bg-card/40 px-5 py-8 text-center text-[13px] text-muted-foreground">No skills configured yet — add some in Studio.</p>
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Skill</th>
            <th className="px-4 py-2.5 font-medium">Category</th>
            <th className="px-4 py-2.5 font-medium">Output type</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {worker.skills.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-2.5 font-medium text-foreground">{s.name}</td>
              <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{s.category}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{s.outputType}</td>
              <td className="px-4 py-2.5">
                <TonePill label={s.enabled ? "Enabled" : "Disabled"} tone={s.enabled ? "good" : "muted"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ToolsTab({ worker, connectors }: { worker: Worker; connectors: ConnectorSummary[] }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Tools</h2>
        {worker.tools.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border bg-card/40 px-5 py-8 text-center text-[13px] text-muted-foreground">No tools configured yet.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Tool</th>
                  <th className="px-4 py-2.5 font-medium">Permission</th>
                  <th className="px-4 py-2.5 font-medium">Risk</th>
                  <th className="px-4 py-2.5 font-medium">Connection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {worker.tools.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2.5 font-medium text-foreground">{t.name}</td>
                    <td className="px-4 py-2.5">
                      <TonePill label={toolPermissionLabel(t.permission)} tone={toolPermissionTone(t.permission)} />
                    </td>
                    <td className="px-4 py-2.5">
                      <TonePill label={t.risk} tone={RISK_TONE[t.risk]} />
                    </td>
                    <td className="px-4 py-2.5">
                      {t.connected ? <TonePill label="Connected" tone="good" /> : <span className="text-[12px] text-muted-foreground">{t.notConnectedReason ?? "Not connected"}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Connectors</h2>
        {worker.integrations.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border bg-card/40 px-5 py-8 text-center text-[13px] text-muted-foreground">No Connectors wired to this Agent yet — add one in Studio.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {worker.integrations.map((cfg) => {
              const connector = connectors.find((c) => c.id === cfg.connectorId)
              return (
                <div key={cfg.connectorId} className="overflow-hidden rounded-xl border border-border">
                  <div className="border-b border-border bg-secondary/40 px-4 py-2.5 text-[13px] font-medium text-foreground">{connector?.name ?? cfg.connectorId}</div>
                  <div className="divide-y divide-border/70">
                    {cfg.actions.map((act) => {
                      const action = connector?.actions.find((a) => a.id === act.actionId)
                      return (
                        <div key={act.actionId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <span className={`font-mono text-[12.5px] ${act.enabled ? "text-foreground" : "text-muted-foreground line-through"}`}>{action?.label ?? act.actionId}</span>
                          <span className="flex items-center gap-2">
                            {action && <TonePill label={toolPermissionLabel(action.permission)} tone={toolPermissionTone(action.permission)} />}
                            <TonePill label={act.permission.replace(/_/g, " ")} tone={act.permission === "allow" ? "good" : act.permission === "deny" ? "bad" : "warn"} />
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function TasksTab({ tasks, executions, onOpenExecution }: { tasks: import("@/lib/workforce/model").WorkerTask[]; executions: import("@/lib/workforce/model").WorkerExecution[]; onOpenExecution: (id: string) => void }) {
  const sorted = [...tasks].sort((a, b) => b.createdAt - a.createdAt)
  if (sorted.length === 0) return <p className="rounded-xl border border-dashed border-border bg-card/40 px-5 py-8 text-center text-[13px] text-muted-foreground">No tasks yet.</p>
  return (
    <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card/40">
      {sorted.map((t) => {
        const execution = executions.find((e) => e.taskId === t.id)
        const meta = EXECUTION_STATUS_META[t.status]
        const clickable = !!execution
        const Row = clickable ? "button" : "div"
        return (
          <Row key={t.id} onClick={clickable ? () => onOpenExecution(execution!.id) : undefined} className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${clickable ? "hover:bg-secondary/30" : ""}`}>
            <span className="min-w-0 truncate text-[12.5px] font-medium text-foreground">{t.title}</span>
            <span className="flex shrink-0 items-center gap-2.5">
              <TonePill label={meta.label} tone={meta.tone} />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{timeAgo(t.createdAt)}</span>
            </span>
          </Row>
        )
      })}
    </div>
  )
}

function ExecutionsTab({ executions, onOpen }: { executions: import("@/lib/workforce/model").WorkerExecution[]; onOpen: (id: string) => void }) {
  const sorted = [...executions].sort((a, b) => b.startedAt - a.startedAt)
  if (sorted.length === 0) return <p className="rounded-xl border border-dashed border-border bg-card/40 px-5 py-8 text-center text-[13px] text-muted-foreground">No executions yet.</p>
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-border bg-secondary/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Execution</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Started</th>
            <th className="px-4 py-2.5 font-medium">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {sorted.map((e) => {
            const meta = EXECUTION_STATUS_META[e.status]
            return (
              <tr key={e.id} className="cursor-pointer transition-colors hover:bg-secondary/30" onClick={() => onOpen(e.id)}>
                <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{e.id.replace(/^exec_/, "").slice(0, 8)}</td>
                <td className="px-4 py-2.5">
                  <TonePill label={meta.label} tone={meta.tone} />
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{timeAgo(e.startedAt)}</td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{e.durationMs != null ? `${(e.durationMs / 1000).toFixed(1)}s` : "—"}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function OutputsTab({ outputs, onOpen }: { outputs: WorkerOutput[]; onOpen: (executionId: string) => void }) {
  if (outputs.length === 0) return <p className="rounded-xl border border-dashed border-border bg-card/40 px-5 py-8 text-center text-[13px] text-muted-foreground">No outputs yet.</p>
  return (
    <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card/40">
      {outputs.map((o) => (
        <button key={o.id} onClick={() => onOpen(o.executionId)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary/30">
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-medium text-foreground">{o.title}</p>
            <p className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{o.type}</p>
          </div>
          <span className="flex shrink-0 items-center gap-2.5">
            <TonePill label={o.status === "completed" ? "Completed" : "Failed"} tone={o.status === "completed" ? "good" : "bad"} />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{timeAgo(o.createdAt)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function SettingsTab({ worker }: { worker: Worker }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">Identity & mission</h2>
      <dl className="mt-3 flex flex-col divide-y divide-border">
        <Row k="Name" v={worker.identity.name} />
        <Row k="Role" v={worker.identity.role} />
        <Row k="Mission" v={worker.mission} />
        <Row k="Autonomy" v={worker.autonomy} />
        <Row k="Status" v={worker.status} />
        <Row k="Created" v={new Date(worker.createdAt).toLocaleString()} />
        {worker.releasedAt && <Row k="Released" v={new Date(worker.releasedAt).toLocaleString()} />}
      </dl>
      <p className="mt-4 text-[12.5px] text-muted-foreground">
        Editing this Agent&apos;s configuration happens in Studio.{" "}
        <Link href={`/studio?worker=${encodeURIComponent(worker.id)}`} className="font-medium text-primary hover:underline">
          Open in Studio →
        </Link>
      </p>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-2">
      <dt className="shrink-0 text-[12px] text-muted-foreground">{k}</dt>
      <dd className="truncate text-right text-[12.5px] text-foreground">{v}</dd>
    </div>
  )
}
