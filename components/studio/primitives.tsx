/* ------------------------------------------------------------------ *
 * Light operational primitives shared by /studio and /outputs.
 * Precise, hairline-bordered, information-dense. No decoration for its
 * own sake — every element is load-bearing.
 * ------------------------------------------------------------------ */

import type { ReactNode } from "react"

/* A titled section card. */
export function Section({
  title,
  hint,
  action,
  children,
  className = "",
}: {
  title: string
  hint?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-xl border border-border bg-card ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">
            {title}
          </h2>
          {hint && (
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {hint}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

/* A thin horizontal health/score meter. */
export function Meter({
  value,
  tone = "primary",
}: {
  value: number
  tone?: "primary" | "grow" | "warn"
}) {
  const bar =
    tone === "grow" ? "bg-grow" : tone === "warn" ? "bg-warn" : "bg-primary"
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={`h-full rounded-full ${bar}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

/* A small status dot + label. */
export function StatusDot({
  tone,
  label,
}: {
  tone: "good" | "info" | "warn" | "bad" | "muted"
  label: string
}) {
  const dot =
    tone === "good"
      ? "bg-grow"
      : tone === "info"
        ? "bg-primary"
        : tone === "warn"
          ? "bg-warn"
          : tone === "bad"
            ? "bg-destructive"
            : "bg-muted-foreground/50"
  const text =
    tone === "good"
      ? "text-grow"
      : tone === "info"
        ? "text-primary"
        : tone === "warn"
          ? "text-warn"
          : tone === "bad"
            ? "text-destructive"
            : "text-muted-foreground"
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className={`font-mono text-[11px] tracking-tight ${text}`}>
        {label}
      </span>
    </span>
  )
}

/* A compact metric cell. */
export function Metric({
  value,
  label,
}: {
  value: string
  label: string
}) {
  return (
    <div>
      <div className="font-mono text-[18px] font-medium tabular-nums tracking-tight text-foreground">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

/* A pill-style tag. */
export function Tag({
  children,
  tone = "muted",
}: {
  children: ReactNode
  tone?: "primary" | "muted"
}) {
  const cls =
    tone === "primary"
      ? "border-primary/25 bg-primary/8 text-primary"
      : "border-border bg-secondary text-muted-foreground"
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${cls}`}
    >
      {children}
    </span>
  )
}
