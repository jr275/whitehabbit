"use client"

/* ================================================================== *
 * APPROVALS — the real Human-in-the-Loop queue (section "PHASE 6").
 * Reads GET /api/approvals — real, persisted rows created the instant
 * runToolAction() (lib/agent/tool-runner.ts) throws
 * ApprovalRequiredError, never a demo/mock list.
 * ================================================================== */

import { Check, Clock, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

interface ApprovalRow {
  id: string
  workerId: string
  executionId?: string
  toolId: string
  toolName: string
  actionId: string
  actionLabel: string
  permission: string
  reason: string
  input: unknown
  status: "pending" | "approved" | "rejected"
  result?: unknown
  requestedAt: number
  decidedAt?: number
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...init })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Request to ${path} failed (${res.status})`)
  return body as T
}

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

export function ApprovalsPage() {
  const { hydrated, workers } = useWorkforce()
  const [approvals, setApprovals] = useState<ApprovalRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  async function refresh() {
    try {
      const data = await api<{ approvals: ApprovalRow[] }>("/api/approvals")
      setApprovals(data.approvals)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load approvals.")
    }
  }

  useEffect(() => {
    workforceStore.hydrate()
    refresh()
  }, [])

  async function decide(id: string, decision: "approve" | "reject") {
    setPendingId(id)
    try {
      await api(`/api/approvals/${encodeURIComponent(id)}/decide`, { method: "POST", body: JSON.stringify({ decision }) })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the decision.")
    } finally {
      setPendingId(null)
    }
  }

  const pending = (approvals ?? []).filter((a) => a.status === "pending")
  const decided = (approvals ?? []).filter((a) => a.status !== "pending").slice(0, 20)

  return (
    <div className="mx-auto max-w-[900px] px-5 py-10 sm:px-8">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Human-in-the-Loop</p>
      <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">Approvals</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
        A real action a Worker attempted — write/publish/delete/financial/external-communication, or anything an operator explicitly marked{" "}
        <span className="font-mono text-[12px]">requires_approval</span> in Studio — pauses here before it ever runs. Approving runs that exact
        real action now; rejecting means it never happens.
      </p>

      {error && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{error}</p>}

      {!hydrated || !approvals ? (
        <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Loading…</p>
      ) : (
        <>
          <section className="mt-8">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                {pending.length > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warn/60" />}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${pending.length ? "bg-warn" : "bg-muted"}`} />
              </span>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Awaiting decision · {pending.length}</h2>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              {pending.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-card/40 px-5 py-8 text-center">
                  <p className="text-[13px] text-muted-foreground">Nothing waiting. Real approval requests appear here the moment a Worker attempts a gated action.</p>
                </div>
              )}
              {pending.map((a) => (
                <PendingCard key={a.id} approval={a} workerName={workers.find((w) => w.id === a.workerId)?.identity.name ?? a.workerId} busy={pendingId === a.id} onDecide={decide} />
              ))}
            </div>
          </section>

          {decided.length > 0 && (
            <section className="mt-10">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Recent decisions</h2>
              <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/50">
                {decided.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[9px] font-semibold ${
                        a.status === "approved" ? "bg-grow/15 text-grow" : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {a.status === "approved" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-foreground">
                        <span className="font-medium">{workers.find((w) => w.id === a.workerId)?.identity.name ?? a.workerId}</span> · {a.actionLabel} on {a.toolName}
                      </p>
                      <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {a.status} · {a.decidedAt ? timeAgo(a.decidedAt) : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function PendingCard({
  approval,
  workerName,
  busy,
  onDecide,
}: {
  approval: ApprovalRow
  workerName: string
  busy: boolean
  onDecide: (id: string, decision: "approve" | "reject") => void
}) {
  const inputEntries = approval.input && typeof approval.input === "object" ? Object.entries(approval.input as Record<string, unknown>) : []
  return (
    <div className="rounded-xl border border-warn/40 bg-warn/[0.06] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-warn">
              <Clock className="h-2.5 w-2.5" /> {approval.permission}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{timeAgo(approval.requestedAt)}</span>
          </div>
          <p className="mt-2 text-[15px] font-medium text-foreground">
            {approval.actionLabel} <span className="text-muted-foreground">on {approval.toolName}</span>
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">{approval.reason}</p>
          <p className="mt-2 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">{workerName}</span> is blocked mid-run.
          </p>
          {inputEntries.length > 0 && (
            <dl className="mt-2.5 flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2">
              {inputEntries.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 text-[11.5px]">
                  <dt className="shrink-0 font-mono text-muted-foreground">{k}</dt>
                  <dd className="truncate text-right text-foreground">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => onDecide(approval.id, "reject")}
            disabled={busy}
            className="rounded-lg border border-border px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={() => onDecide(approval.id, "approve")}
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}
