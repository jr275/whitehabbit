"use client"

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { intelligence } from "@/lib/knowledge/intelligence/client"
import { useEnvelope } from "@/lib/knowledge/intelligence/use-intelligence"
import { PanelHeading, PanelSkeleton } from "../shared"

export function OverviewPanel() {
  const ov = useEnvelope("overview", intelligence.getOverview)
  const sig = useEnvelope("signals", intelligence.getSignals)

  if (ov.isLoading || sig.isLoading) return <PanelSkeleton rows={3} />
  if (!ov.data || !sig.data) return null
  const o = ov.data
  const maxWeek = Math.max(...o.weeklySaves)

  return (
    <div>
      <PanelHeading
        title="What's happening inside your knowledge"
        hint="A live read on the shape of your library."
        provenance={ov.provenance}
      />

      {/* signals */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sig.data.map((s) => {
          const up = s.delta > 0
          const flat = s.delta === 0
          const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
          return (
            <div key={s.id} className="rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-5">
              <p className="text-[13px] text-muted-foreground">{s.label}</p>
              <div className="mt-2 flex items-end justify-between gap-2">
                <span className="font-serif text-3xl font-medium tracking-tight text-foreground">{s.value}</span>
                <span
                  className={
                    "flex items-center gap-0.5 text-[12px] font-medium " +
                    (flat ? "text-muted-foreground" : up ? "text-emerald-500" : "text-amber-500")
                  }
                >
                  <Icon className="size-3.5" />
                  {flat ? "0" : Math.abs(s.delta)}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-muted-foreground">{s.hint}</p>
            </div>
          )
        })}
      </div>

      {/* library shape + weekly rhythm */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-6">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Library at a glance</h3>
          <dl className="mt-4 grid grid-cols-3 gap-4">
            {[
              ["Saved", o.totalItems],
              ["Read", o.readItems],
              ["Favorites", o.favoriteItems],
              ["Concepts", o.conceptCount],
              ["Connections", o.connectionCount],
              ["Open questions", o.openQuestionCount],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-[12px] text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 font-serif text-2xl font-medium tracking-tight text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-6">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Saving rhythm</h3>
          <p className="mt-1 text-sm text-muted-foreground">Last 8 weeks</p>
          <div className="mt-5 flex h-24 items-end gap-1.5">
            {o.weeklySaves.map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="w-full rounded-t bg-[var(--kn-ai)]/70"
                  style={{ height: `${Math.max(8, (n / maxWeek) * 100)}%` }}
                  title={`${n} saved`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* top themes */}
      <div className="mt-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-6">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Strongest themes</h3>
        <div className="mt-4 space-y-3">
          {o.topThemes.map((t) => (
            <div key={t.id} className="flex items-center gap-4">
              <span className="w-44 shrink-0 truncate text-[15px] text-foreground">{t.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-[var(--kn-ai)]/70" style={{ width: `${t.weight * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
