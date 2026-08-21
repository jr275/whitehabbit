/* ------------------------------------------------------------------ *
 * Outputs Hub header — "What did my Workers actually do?" answered in
 * six numbers before anything else on the page.
 * ------------------------------------------------------------------ */

import type { HeaderMetrics } from "@/lib/workforce/selectors"

const TODAY = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })

export function OutputsHeader({ metrics }: { metrics: HeaderMetrics }) {
  const cells: { label: string; value: string; tone?: "warn" | "bad" }[] = [
    { label: "Tasks completed", value: String(metrics.tasksCompleted) },
    { label: "Outputs produced", value: String(metrics.outputsProduced) },
    { label: "Success rate", value: `${metrics.successRate}%` },
    { label: "Human approvals", value: String(metrics.humanApprovals), tone: metrics.humanApprovals > 0 ? "warn" : undefined },
    { label: "Escalations", value: String(metrics.escalations), tone: metrics.escalations > 0 ? "warn" : undefined },
    { label: "Failed tasks", value: String(metrics.failedTasks), tone: metrics.failedTasks > 0 ? "bad" : undefined },
  ]

  return (
    <section className="border-b border-border pb-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Today</p>
      <div className="mt-1 flex items-baseline justify-between gap-4">
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Worker Outputs</h1>
        <span className="hidden text-[13px] text-muted-foreground sm:inline">{TODAY}</span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {cells.map((c) => (
          <div key={c.label} className="bg-card p-4">
            <div
              className={`font-mono text-[24px] font-medium tabular-nums tracking-tight ${
                c.tone === "bad" ? "text-destructive" : c.tone === "warn" ? "text-warn" : "text-foreground"
              }`}
            >
              {c.value}
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
