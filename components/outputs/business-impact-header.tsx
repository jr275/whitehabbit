"use client"

/* ------------------------------------------------------------------ *
 * BUSINESS IMPACT HEADER — compact, per-Super-Agent summary of real
 * Business Metrics (section 7 of the Business Impact brief). Every
 * number here is a real MetricRecord.value already written by
 * lib/agent/runtime.ts; a metric this Super Agent can't measure yet
 * shows its real connect hint instead of a fabricated value. This is
 * deliberately compact — not a dashboard, a strip.
 * ------------------------------------------------------------------ */

import { domainImpactMetrics } from "@/lib/workforce/selectors"
import type { MetricRecord, WorkerExecution } from "@/lib/workforce/model"
import { ProvenanceBadge } from "@/components/outputs/provenance-badge"

export function BusinessImpactHeader({
  domainKey,
  domainLabel,
  workerId,
  accent,
  metrics,
  executions,
}: {
  domainKey: string
  domainLabel: string
  workerId: string
  accent: string
  metrics: MetricRecord[]
  executions: WorkerExecution[]
}) {
  const impact = domainImpactMetrics(domainKey, workerId, metrics, executions)

  if (impact.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-secondary/20 px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: accent }}>
          {domainLabel}
        </p>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">No business results yet — run this worker to start producing real business impact.</p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-5 py-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em]" style={{ color: accent }}>
          {domainLabel} — Business Impact
        </p>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-3 lg:grid-cols-5">
        {impact.map((m) => (
          <div key={m.key} className="bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              {m.state === "not_connected" ? (
                <span className="font-mono text-[22px] font-medium text-muted-foreground/40">—</span>
              ) : (
                <span className="font-mono text-[26px] font-medium tabular-nums tracking-tight text-foreground">
                  {m.currency ? `${m.currency}${(m.value ?? 0).toLocaleString()}` : m.unit === "%" ? `${m.value}%` : m.value?.toLocaleString()}
                </span>
              )}
              <ProvenanceBadge state={m.state} />
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">{m.label}</div>
            {m.state === "not_connected" && <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground/70">{m.connectHint}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}
