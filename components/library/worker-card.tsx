"use client"

import Link from "next/link"
import { ArrowRight, ShieldCheck } from "lucide-react"
import type { WorkerSpec } from "@/lib/library/spec-model"

/* ------------------------------------------------------------------ *
 * Worker card — intelligence-first. Leads with the capabilities the
 * worker reasons over, not a chat affordance. Every card is a
 * ready-to-configure professional build.
 * ------------------------------------------------------------------ */
export function WorkerCard({
  spec,
  featured = false,
  created = false,
}: {
  spec: WorkerSpec
  featured?: boolean
  created?: boolean
}) {
  const topClusters = spec.skillClusters.slice(0, featured ? 5 : 4)
  const specCount = spec.specializations.length

  return (
    <Link
      href={`/library/${spec.id}`}
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/25 ${
        featured ? "sm:col-span-2" : ""
      }`}
    >
      {/* accent edge */}
      <span
        className="absolute inset-x-0 top-0 h-px opacity-70"
        style={{ background: `linear-gradient(90deg, transparent, ${spec.accent}, transparent)` }}
      />

      <div className={`flex flex-1 flex-col gap-5 p-5 ${featured ? "sm:p-6" : ""}`}>
        {/* header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-lg font-mono text-sm font-semibold"
              style={{ backgroundColor: `color-mix(in oklch, ${spec.accent} 20%, transparent)`, color: spec.accent }}
            >
              {spec.codename.slice(0, 2)}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-sm font-semibold tracking-tight text-foreground">{spec.codename}</h3>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                  style={{ backgroundColor: `color-mix(in oklch, var(--grow) 15%, transparent)`, color: "var(--grow)" }}
                >
                  <ShieldCheck className="h-2.5 w-2.5" />
                  {created ? "Deployed" : "Ready"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{spec.role}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-semibold leading-none text-foreground">{spec.strength}</p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Strength</p>
          </div>
        </div>

        {/* mission */}
        <p className={`text-pretty text-[13px] leading-relaxed text-muted-foreground ${featured ? "" : "line-clamp-2"}`}>
          {spec.mission}
        </p>

        {/* capability rail — the intelligence, not a chatbox */}
        <div className="flex flex-wrap gap-1.5">
          {topClusters.map((c) => (
            <span
              key={c.name}
              className="rounded-md border border-border bg-secondary/60 px-2 py-1 font-mono text-[10px] tracking-tight text-foreground/80"
            >
              {c.name}
            </span>
          ))}
        </div>

        {/* outcome preview (featured only) */}
        {featured && (
          <div className="grid gap-2 rounded-lg border border-border bg-secondary/40 p-3 sm:grid-cols-3">
            {spec.outcomes.slice(0, 3).map((o) => (
              <div key={o.id}>
                <p className="text-[11px] font-medium text-foreground">{o.label}</p>
                <p className="mt-0.5 font-mono text-[10px] leading-tight" style={{ color: "var(--grow)" }}>
                  {o.impact}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* footer stats */}
        <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
          <div className="flex items-center gap-4 font-mono text-[11px] text-muted-foreground">
            <span>
              <span className="text-foreground">{spec.skillCount}</span> skills
            </span>
            <span>
              <span className="text-foreground">{specCount}</span> specializations
            </span>
          </div>
          <span className="flex items-center gap-1 text-[12px] font-medium text-foreground opacity-70 transition-opacity group-hover:opacity-100">
            {created ? "Open" : "Configure"}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  )
}
