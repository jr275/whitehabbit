"use client"

/* ------------------------------------------------------------------ *
 * Generalized real empty state — one component for every real,
 * data-backed page (Observatory, Workers, History, Operational
 * Intelligence) to render "no data yet" honestly, distinct from a
 * loading state or an error. Never a demo placeholder. See section
 * 20 of the productization brief: "distinguish NO DATA from ERROR
 * from LOADING from NOT CONFIGURED."
 * ------------------------------------------------------------------ */

import { ArrowRight } from "lucide-react"
import Link from "next/link"
import type { ComponentType } from "react"
import { Radio } from "lucide-react"

export function EmptyState({
  icon: Icon = Radio,
  title,
  description,
  ctaHref,
  ctaLabel,
}: {
  icon?: ComponentType<{ className?: string }>
  title: string
  description: string
  ctaHref?: string
  ctaLabel?: string
}) {
  return (
    <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary/60 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-4 text-[15px] font-medium text-foreground">{title}</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.16em] text-primary-foreground transition-opacity hover:opacity-90"
        >
          {ctaLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  )
}
