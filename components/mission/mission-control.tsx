"use client"

/* Mission Control (Phase 7, §16-17, ADR-040) — reads live API data
 * only: /api/v1/intelligence/mission (real KPIs) and
 * /api/v1/intelligence/next-action (the real highest-priority pending
 * Decision). No hardcoded metrics, no fake charts, no decorative
 * numbers — a metric this tenant has no real data for yet renders as
 * "—", never a guessed value (§40's Known/Estimated/Unavailable
 * discipline, same as the rest of this app). */

import { useEffect, useState } from "react"
import { AlertTriangle, ArrowRight, CircleAlert, Clock3, Gauge, Radar, Sparkles, TrendingUp } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import type { MissionSnapshot, NextAction } from "@/lib/intelligence/mission"
import type { TimelineEntry } from "@/lib/intelligence/timeline"

function Metric({ label, value, sublabel, icon: Icon }: { label: string; value: string; sublabel?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="font-mono text-[9px] uppercase tracking-[0.16em]">{label}</span>
      </div>
      <span className="text-2xl font-semibold tracking-tight text-foreground">{value}</span>
      {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
    </div>
  )
}

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

export function MissionControl() {
  const [snapshot, setSnapshot] = useState<MissionSnapshot | null>(null)
  const [nextAction, setNextAction] = useState<NextAction | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const missionRes = await fetch("/api/v1/intelligence/mission")
      if (!missionRes.ok) throw new Error((await missionRes.json().catch(() => null))?.error ?? "Could not load Mission Control.")
      const missionBody = await missionRes.json()
      setSnapshot(missionBody.snapshot)
      setProjectId(missionBody.projectId)

      const [nextRes, timelineRes] = await Promise.all([
        fetch("/api/v1/intelligence/next-action"),
        fetch(`/api/v1/intelligence/timeline?projectId=${missionBody.projectId}&limit=8`),
      ])
      if (nextRes.ok) setNextAction((await nextRes.json()).nextAction)
      if (timelineRes.ok) setTimeline((await timelineRes.json()).entries)
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
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Metric icon={Radar} label="Knowledge Authority" value={String(snapshot.knowledgeAuthority.entityCount)} sublabel={snapshot.knowledgeAuthority.entitiesWithEvidencePct != null ? `${snapshot.knowledgeAuthority.entitiesWithEvidencePct}% evidenced` : "entities"} />
              <Metric icon={Sparkles} label="Page Intelligence" value={String(snapshot.pageIntelligence.pageCount)} sublabel={snapshot.pageIntelligence.avgQualityScore != null ? `avg quality ${snapshot.pageIntelligence.avgQualityScore}` : "pages"} />
              <Metric icon={Gauge} label="Information Gain" value={snapshot.informationGain.avgScore != null ? `${snapshot.informationGain.avgScore}` : "—"} sublabel={snapshot.informationGain.sampleCount > 0 ? `${snapshot.informationGain.sampleCount} real evaluations` : "no data yet"} />
              <Metric icon={TrendingUp} label="Organic Growth" value={snapshot.organicGrowth ? String(snapshot.organicGrowth.totalClicks) : "—"} sublabel={snapshot.organicGrowth ? `${snapshot.organicGrowth.snapshotDays} real days` : "Search Console not connected"} />
              <Metric icon={Sparkles} label="AI Visibility" value={String(snapshot.aiVisibility.answerCount)} sublabel={`${snapshot.aiVisibility.citationCount} real citations`} />
              <Metric icon={TrendingUp} label="Market Momentum" value={String(snapshot.marketMomentum.risingTrendCount)} sublabel={`of ${snapshot.marketMomentum.totalTrendCount} tracked trends`} />
            </div>

            <div className="mt-8">
              <NextActionCard nextAction={nextAction} onActed={() => void load()} />
            </div>

            {(snapshot.pendingDecisionCount > 1 || snapshot.blockedActionCount > 0) && (
              <p className="mt-4 text-xs text-muted-foreground">
                {snapshot.pendingDecisionCount > 1 && <>{snapshot.pendingDecisionCount - 1} more real decision{snapshot.pendingDecisionCount - 1 === 1 ? "" : "s"} pending. </>}
                {snapshot.blockedActionCount > 0 && <>{snapshot.blockedActionCount} action{snapshot.blockedActionCount === 1 ? "" : "s"} currently blocked. </>}
                <a href="/intelligence/decisions" className="text-primary hover:underline">View Decision Center →</a>
              </p>
            )}

            <div className="mt-8">
              <TimelineFeed entries={timeline} />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
