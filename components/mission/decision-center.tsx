"use client"

/* Decision Center (Phase 7, §21, ADR-040) — reads live
 * /api/v1/intelligence/decisions data only. Every decision shown here
 * is real: a deterministic Correlation+Decision Engine output, never a
 * fabricated example. Tabs match the real, closed DecisionStatus
 * values this system actually has (pending/approved/executed/
 * rejected/expired/cancelled) rather than inventing "Executing"/
 * "Completed" states the Decision itself doesn't carry — the linked
 * Action's own real status (visible on expand) is what distinguishes
 * "approved, not yet dispatched" from "approved, running." */

import { useEffect, useState } from "react"
import { CircleAlert, Clock3 } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import type { IntelligenceDecision, DecisionStatus } from "@/lib/intelligence/decisions"
import type { IntelligenceAction } from "@/lib/intelligence/actions"

const TABS: { status: DecisionStatus; label: string }[] = [
  { status: "pending", label: "Pending" },
  { status: "approved", label: "Approved" },
  { status: "executed", label: "Executed" },
  { status: "rejected", label: "Rejected" },
  { status: "expired", label: "Expired" },
  { status: "cancelled", label: "Cancelled" },
]

const RISK_TONE: Record<string, string> = { low: "text-grow", medium: "text-warn", high: "text-destructive", critical: "text-destructive" }

function DecisionCard({ decision, onChanged }: { decision: IntelligenceDecision; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [actions, setActions] = useState<IntelligenceAction[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggleExpand() {
    setExpanded((v) => !v)
    if (!expanded && actions === null) {
      const res = await fetch(`/api/v1/intelligence/actions?projectId=${decision.projectId}&decisionId=${decision.id}`)
      if (res.ok) setActions((await res.json()).actions)
    }
  }

  async function decide(status: "approved" | "rejected") {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/intelligence/decisions/${decision.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Decision failed.")
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decision failed.")
    } finally {
      setBusy(false)
    }
  }

  async function execute() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/intelligence/decisions/${decision.id}/execute`, { method: "POST" })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Execution failed.")
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">{decision.action.replaceAll("_", " ")}</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{decision.reason}</p>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-right">
          <div><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Confidence</p><p className="text-sm font-semibold text-foreground">{Math.round(decision.confidence * 100)}%</p></div>
          <div><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Risk</p><p className={`text-sm font-semibold capitalize ${RISK_TONE[decision.risk]}`}>{decision.risk}</p></div>
        </div>
      </div>

      <button onClick={() => void toggleExpand()} className="mt-3 text-xs text-primary hover:underline">{expanded ? "Hide detail" : "Show evidence & actions"}</button>

      {expanded && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">{decision.expectedImpact}</p>
          <p className="text-[11px] text-muted-foreground">Evidence: {decision.evidenceIds.length} real signal(s) · Subject: {decision.subjectType} {decision.subjectId ?? ""} · Recommended agent: {decision.recommendedAgent ?? "none"}</p>
          {actions === null ? (
            <p className="text-[11px] text-muted-foreground">Loading real actions…</p>
          ) : actions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No action has been dispatched for this decision yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {actions.map((a) => (
                <li key={a.id} className="text-[11px] text-muted-foreground">
                  Action {a.id.slice(0, 12)}… — <span className="text-foreground">{a.status}</span>
                  {a.blockedReason && <span className="text-warn"> — {a.blockedReason}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {decision.status === "pending" && (
        <div className="mt-4 flex items-center gap-2">
          <button onClick={() => void decide("approved")} disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">Approve</button>
          <button onClick={() => void decide("rejected")} disabled={busy} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">Reject</button>
        </div>
      )}
      {decision.status === "approved" && (
        <div className="mt-4">
          <button onClick={() => void execute()} disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">Execute</button>
        </div>
      )}
      {error && <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive"><CircleAlert className="size-3.5" /> {error}</p>}
    </div>
  )
}

export function DecisionCenter() {
  const [tab, setTab] = useState<DecisionStatus>("pending")
  const [decisions, setDecisions] = useState<IntelligenceDecision[] | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load(status: DecisionStatus) {
    setDecisions(null)
    try {
      let pid = projectId
      if (!pid) {
        const missionRes = await fetch("/api/v1/intelligence/mission")
        if (missionRes.ok) pid = (await missionRes.json()).projectId
        setProjectId(pid)
      }
      if (!pid) throw new Error("No project available.")
      const res = await fetch(`/api/v1/intelligence/decisions?projectId=${pid}&status=${status}`)
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not load decisions.")
      setDecisions((await res.json()).decisions)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load decisions.")
    }
  }

  useEffect(() => {
    void load(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main id="main-content" className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
        <header>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Decision Center</p>
          <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tight text-foreground">Every real Decision, explained</h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            Every row is a real, explainable choice from the Correlation + Decision Engine — reason, evidence, and expected impact, never &quot;AI decided this.&quot;
          </p>
        </header>

        <div className="mt-6 flex flex-wrap gap-1 border-b border-border">
          {TABS.map((t) => (
            <button key={t.status} onClick={() => setTab(t.status)} className={`rounded-t-md px-3 py-2 text-xs transition-colors ${tab === t.status ? "border-b-2 border-primary font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {error && <div className="mt-6 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" /> {error}</div>}

        <div className="mt-6 flex flex-col gap-3">
          {decisions === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" /> Loading real decisions…</div>
          ) : decisions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">No real decisions in this state right now.</p>
          ) : (
            decisions.map((d) => <DecisionCard key={d.id} decision={d} onChanged={() => void load(tab)} />)
          )}
        </div>
      </main>
    </div>
  )
}
