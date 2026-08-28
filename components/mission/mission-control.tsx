"use client"

/* Mission Control (Phase 7, §16-17, ADR-040) — reads live API data
 * only: /api/v1/intelligence/mission (real KPIs) and
 * /api/v1/intelligence/next-action (the real highest-priority pending
 * Decision). No hardcoded metrics, no fake charts, no decorative
 * numbers — a metric this tenant has no real data for yet renders as
 * "—", never a guessed value (§40's Known/Estimated/Unavailable
 * discipline, same as the rest of this app). */

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowRight, CircleAlert, Clock3, Cpu } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import type { MissionSnapshot, NextAction } from "@/lib/intelligence/mission"
import type { TimelineEntry } from "@/lib/intelligence/timeline"
import type { Opportunity } from "@/lib/opportunity/model"
import type { WorkflowRun } from "@/lib/workflow/types"
import { ObjectInspector, useObjectInspector } from "@/components/ontology/object-inspector"

const RISK_TONE: Record<string, string> = { low: "text-grow", medium: "text-warn", high: "text-destructive", critical: "text-destructive" }

function NextActionCard({ nextAction, onActed }: { nextAction: NextAction | null; onActed: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!nextAction) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-10 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">What should I do next?</p>
        <p className="mt-3 text-sm text-muted-foreground">No real pending decision right now — the system has nothing it wants approval to act on.</p>
      </div>
    )
  }

  const { decision, plan, policy } = nextAction

  async function approveAndExecute() {
    setBusy(true)
    setError(null)
    try {
      const decideRes = await fetch(`/api/v1/intelligence/decisions/${decision.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "approved" }) })
      if (!decideRes.ok) throw new Error((await decideRes.json().catch(() => null))?.error ?? "Approval failed.")
      const execRes = await fetch(`/api/v1/intelligence/decisions/${decision.id}/execute`, { method: "POST" })
      if (!execRes.ok) throw new Error((await execRes.json().catch(() => null))?.error ?? "Execution failed.")
      onActed()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-card px-6 py-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">What should I do next?</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{decision.action.replaceAll("_", " ")}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{decision.reason}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Confidence</p><p className="mt-1 text-lg font-semibold text-foreground">{Math.round(decision.confidence * 100)}%</p></div>
        <div><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Priority</p><p className="mt-1 text-lg font-semibold text-foreground capitalize">{decision.priority}</p></div>
        <div><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Risk</p><p className={`mt-1 text-lg font-semibold capitalize ${RISK_TONE[decision.risk]}`}>{decision.risk}</p></div>
        <div><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Evidence</p><p className="mt-1 text-lg font-semibold text-foreground">{decision.evidenceIds.length} real signal{decision.evidenceIds.length === 1 ? "" : "s"}</p></div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{decision.expectedImpact}</p>

      {plan.status === "unsupported" ? (
        <p className="mt-5 flex items-center gap-2 text-xs text-warn"><AlertTriangle className="size-3.5" /> Not yet executable: {plan.unsupportedReason}</p>
      ) : (
        <div className="mt-5 flex items-center gap-3">
          <button onClick={approveAndExecute} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {busy ? "Working…" : "Approve & Execute"} <ArrowRight className="size-3.5" />
          </button>
          <span className="text-xs text-muted-foreground">Agent: {plan.agentType ?? "none required"} · Est. cost: {plan.estimatedCost.agentSteps ?? "—"} steps</span>
        </div>
      )}
      {!policy.allowed && plan.status === "supported" && <p className="mt-2 text-xs text-muted-foreground">Note: {policy.reason}</p>}
      {error && <p className="mt-3 flex items-center gap-2 text-xs text-destructive"><CircleAlert className="size-3.5" /> {error}</p>}
    </div>
  )
}

function TimelineFeed({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Intelligence Timeline</p>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No real intelligence events recorded yet for this project.</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={`${entry.type}:${entry.id}`} className="flex items-start gap-3 border-l border-border pl-3">
              <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{entry.type}</span>
              <div>
                <p className="text-xs leading-relaxed text-foreground">{entry.summary}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{new Date(entry.at).toLocaleString()}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

const ACTIVE_RUN_STATUSES = ["queued", "running", "waiting", "waiting_approval", "retrying"]

export function MissionControl() {
  const [snapshot, setSnapshot] = useState<MissionSnapshot | null>(null)
  const [nextAction, setNextAction] = useState<NextAction | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [topOpportunities, setTopOpportunities] = useState<Opportunity[]>([])
  const [activeRuns, setActiveRuns] = useState<WorkflowRun[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inspector = useObjectInspector()

  async function load() {
    try {
      const missionRes = await fetch("/api/v1/intelligence/mission")
      if (!missionRes.ok) throw new Error((await missionRes.json().catch(() => null))?.error ?? "Could not load Mission Control.")
      const missionBody = await missionRes.json()
      setSnapshot(missionBody.snapshot)
      setProjectId(missionBody.projectId)

      const [nextRes, timelineRes, oppRes, ...runResList] = await Promise.all([
        fetch("/api/v1/intelligence/next-action"),
        fetch(`/api/v1/intelligence/timeline?projectId=${missionBody.projectId}&limit=8`),
        fetch("/api/opportunities"),
        ...ACTIVE_RUN_STATUSES.map((s) => fetch(`/api/v1/workflows?status=${s}`)),
      ])
      if (nextRes.ok) setNextAction((await nextRes.json()).nextAction)
      if (timelineRes.ok) setTimeline((await timelineRes.json()).entries)
      if (oppRes.ok) {
        const opps: Opportunity[] = (await oppRes.json()).opportunities
        setTopOpportunities([...opps].sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1)).slice(0, 4))
      }
      const runLists = await Promise.all(runResList.map((r) => (r.ok ? r.json() : { workflows: [] })))
      setActiveRuns(runLists.flatMap((b) => b.workflows as WorkflowRun[]))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Mission Control.")
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main id="main-content" className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
        <header>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Mission Control</p>
          <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tight text-foreground">Knowledge Operating System</h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            What the system knows, what it discovered, and what it wants to do next — every number below is read from real, persisted state for this project.
          </p>
        </header>

        {error && <div className="mt-6 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" /> {error}</div>}

        {!snapshot ? (
          <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" /> Loading real system state…</div>
        ) : (
          <>
            {/* SYSTEM STATE — one real, readable sentence rather than a
             * grid of KPI tiles: what the system knows, right now. */}
            <p className="mt-6 max-w-3xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-foreground">{snapshot.knowledgeAuthority.entityCount}</strong> real entities tracked
              {snapshot.knowledgeAuthority.entitiesWithEvidencePct != null && <> ({snapshot.knowledgeAuthority.entitiesWithEvidencePct}% evidenced)</>}, connected to{" "}
              <strong className="font-semibold text-foreground">{snapshot.pageIntelligence.pageCount}</strong> real pages
              {snapshot.pageIntelligence.avgQualityScore != null && <> at an average quality of {snapshot.pageIntelligence.avgQualityScore}</>}. Information Gain{" "}
              {snapshot.informationGain.avgScore != null ? <>is real-checked at <strong className="font-semibold text-foreground">{snapshot.informationGain.avgScore}%</strong> confidence across {snapshot.informationGain.sampleCount} evaluations</> : "has not been evaluated yet"}.{" "}
              <strong className="font-semibold text-foreground">{snapshot.marketMomentum.risingTrendCount}</strong> of {snapshot.marketMomentum.totalTrendCount} tracked trends are rising.
            </p>

            <div className="mt-8"><NextActionCard nextAction={nextAction} onActed={() => void load()} /></div>

            {(snapshot.pendingDecisionCount > 1 || snapshot.blockedActionCount > 0) && (
              <p className="mt-4 text-xs text-muted-foreground">
                {snapshot.pendingDecisionCount > 1 && <>{snapshot.pendingDecisionCount - 1} more real decision{snapshot.pendingDecisionCount - 1 === 1 ? "" : "s"} pending. </>}
                {snapshot.blockedActionCount > 0 && <>{snapshot.blockedActionCount} action{snapshot.blockedActionCount === 1 ? "" : "s"} currently blocked. </>}
                <a href="/intelligence/decisions" className="text-primary hover:underline">View Decision Center →</a>
              </p>
            )}

            {/* WHAT'S EMERGING + AGENTS AT WORK — side by side: the
             * ontology's real top opportunities, and real agent activity
             * — never a decorative chart standing in for either. */}
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <section>
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">What's emerging</p>
                <h2 className="mt-1 text-lg font-semibold tracking-[-0.01em]">Top real opportunities</h2>
                {topOpportunities.length === 0 ? (
                  <p className="mt-3 text-[13px] text-muted-foreground">No real opportunities discovered yet.</p>
                ) : (
                  <div className="mt-3 flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                    {topOpportunities.map((o) => (
                      <button key={o.id} onClick={() => inspector.open({ type: "opportunity", id: o.id })} className="flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40">
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{o.title}</span>
                        <span className="shrink-0 font-mono text-[9px] uppercase text-muted-foreground">{o.status}</span>
                        <span className="w-8 shrink-0 text-right font-mono text-[12px] tabular-nums text-foreground">{o.finalScore != null ? Math.round(o.finalScore) : "—"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary">Agents at work</p>
                <h2 className="mt-1 text-lg font-semibold tracking-[-0.01em]">{activeRuns.length} real active run{activeRuns.length === 1 ? "" : "s"}</h2>
                {activeRuns.length === 0 ? (
                  <p className="mt-3 text-[13px] text-muted-foreground">No real agent runs are active right now.</p>
                ) : (
                  <div className="mt-3 flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                    {activeRuns.slice(0, 4).map((r) => (
                      <Link key={r.id} href={`/agent-runs/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40">
                        <Cpu className="size-3.5 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{r.pipeline.replaceAll("_", " ")} · {r.subjectType}</span>
                        <span className="shrink-0 font-mono text-[9px] uppercase text-primary">{r.status.replaceAll("_", " ")}</span>
                      </Link>
                    ))}
                  </div>
                )}
                <Link href="/agents/live" className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">Open Live Agent Graph <ArrowRight className="size-3.5" /></Link>
              </section>
            </div>

            <div className="mt-10"><TimelineFeed entries={timeline} /></div>
          </>
        )}
      </main>
      {inspector.isOpen && <ObjectInspector stack={inspector.stack} setStack={inspector.setStack} onClose={inspector.close} />}
    </div>
  )
}
