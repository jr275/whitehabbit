"use client"

/* ================================================================== *
 * MARKETING COMMAND CENTER — section 16. WORLD -> BRAND -> AUDIENCE ->
 * OPPORTUNITY -> CREATIVE, made visible. Not a generic dashboard: one
 * page that answers "what is the agent doing, and why" for the
 * Marketing Super Agent, reading only real, already-persisted data
 * from the same workforceStore every other surface uses.
 * ================================================================== */

import { Radar, Sparkles } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CreativeDetail } from "@/components/marketing/creative-detail"
import { CreativeWall } from "@/components/marketing/creative-wall"
import { ObservabilityPanel } from "@/components/marketing/observability-panel"
import { SignalsPanel } from "@/components/marketing/signals-panel"
import { SystemHealth } from "@/components/marketing/system-health"
import { ProvenanceBadge } from "@/components/outputs/provenance-badge"
import { getProduct } from "@/lib/products/catalog"
import { latestCreativeConcepts, latestIntelligenceReport, worldRightNow } from "@/lib/marketing/selectors"
import type { CreativeConcept } from "@/lib/marketing/model"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

const PRODUCT = getProduct("product_marketing_superagent")!

export function MarketingCommandCenter() {
  const { hydrated, workers, tasks, executions, outputs, metrics, events } = useWorkforce()
  const [query, setQuery] = useState("")
  const [running, setRunning] = useState<"scan" | "creative" | null>(null)
  const [openConcept, setOpenConcept] = useState<CreativeConcept | null>(null)

  useEffect(() => {
    workforceStore.hydrate()
  }, [])

  const worker = useMemo(() => workers.find((w) => w.productId === PRODUCT.id), [workers])

  if (!hydrated) {
    return <div className="mx-auto max-w-[1400px] px-5 py-16 text-center text-[13px] text-muted-foreground sm:px-8">Loading…</div>
  }

  if (!worker) {
    return (
      <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-md rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-primary" />
          <h1 className="mt-3 text-[16px] font-semibold text-foreground">Marketing Super Agent</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            Put a cultural intelligence and creative workforce to work — real signal detection, real opportunity scoring, real distinct creative territories.
          </p>
          <Link href="/products/marketing/onboard" className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:opacity-90">
            Set up Marketing Super Agent
          </Link>
        </div>
      </div>
    )
  }

  const stats = worldRightNow(worker.id, metrics, executions)
  const report = latestIntelligenceReport(outputs, worker.id)
  const creative = latestCreativeConcepts(outputs, worker.id)
  const reportIsDemo = report ? executions.find((e) => e.id === report.output.executionId)?.executionMode === "development" : false
  const creativeIsDemo = creative ? executions.find((e) => e.id === creative.output.executionId)?.executionMode === "development" : false

  const runScan = async () => {
    setRunning("scan")
    await workforceStore.runWorkerSkill(worker.id, "skill_cultural_intelligence", { query: query.trim() || worker.mission || "current cultural and market signals" })
    setRunning(null)
  }

  const runCreative = async (topic: string) => {
    setRunning("creative")
    await workforceStore.runWorkerSkill(worker.id, "skill_creative_territory_generation", { query: topic })
    setRunning(null)
  }

  const matchedOpportunity = openConcept ? report?.payload.opportunities.find((o) => o.topic === openConcept.opportunityTopic) : undefined
  const matchedSignals = matchedOpportunity ? (report?.payload.signals ?? []).filter((s) => matchedOpportunity.signalIds.includes(s.id)) : []

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: PRODUCT.accent }}>
          Marketing Super Agent
        </p>
        <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-foreground">Command Center</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{worker.identity.name} — {worker.identity.role}</p>
      </header>

      <div className="mt-6">
        <SystemHealth />
      </div>

      {/* WORLD RIGHT NOW */}
      <section className="mt-6 overflow-hidden rounded-xl border border-border">
        <div className="border-b border-border bg-secondary/30 px-5 py-2">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Today — World right now</p>
        </div>
        {stats.length === 0 ? (
          <p className="px-5 py-4 text-[12.5px] text-muted-foreground">No activity yet — scan for signals to get started.</p>
        ) : (
          <div className="grid grid-cols-1 gap-px overflow-hidden bg-border sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.key} className="bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[26px] font-medium tabular-nums tracking-tight text-foreground">{s.value.toLocaleString()}</span>
                  <ProvenanceBadge provenance={s.state} />
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SCAN CONTROL */}
      <section className="mt-8 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <Radar className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What cultural or market space should it monitor?"
            className="modal-input flex-1 text-[13px]"
          />
          <button
            disabled={running !== null}
            onClick={runScan}
            className="shrink-0 rounded-md bg-primary px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {running === "scan" ? "Scanning…" : "Scan for signals"}
          </button>
        </div>
      </section>

      {/* CREATIVE WALL */}
      <section className="mt-8">
        <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">Creative Wall</h2>
        <CreativeWall concepts={creative?.payload.concepts ?? []} isDemo={creativeIsDemo} onOpen={setOpenConcept} />
      </section>

      {/* SIGNALS & OPPORTUNITIES */}
      <section className="mt-8">
        <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">Signals &amp; Opportunities</h2>
        <SignalsPanel
          signals={report?.payload.signals ?? []}
          opportunities={report?.payload.opportunities ?? []}
          isDemo={reportIsDemo}
          onGenerateCreative={runCreative}
          generating={running === "creative"}
        />
      </section>

      {/* OBSERVABILITY */}
      <div className="mt-8">
        <ObservabilityPanel workerId={worker.id} tasks={tasks} executions={executions} outputs={outputs} events={events} />
      </div>

      {openConcept && (
        <CreativeDetail
          concept={openConcept}
          opportunity={matchedOpportunity}
          signals={matchedSignals}
          worker={worker}
          execution={creative ? executions.find((e) => e.id === creative.output.executionId) : undefined}
          outputId={creative?.output.id}
          isDemo={creativeIsDemo}
          onClose={() => setOpenConcept(null)}
        />
      )}
    </div>
  )
}
