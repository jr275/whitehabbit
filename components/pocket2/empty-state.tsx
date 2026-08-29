import type { ReactNode } from "react"

/* Empty states are a designed screen, not an apology. Each one names
 * what belongs here, and offers the single action that fills it. */
export function EmptyState({
  icon, title, body, action,
}: {
  icon: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-[var(--p2-r-lg)]"
        style={{ background: "var(--p2-accent-soft)", color: "var(--p2-accent)" }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <h2 className="p2-h3 mt-5" style={{ color: "var(--p2-ink-strong)" }}>{title}</h2>
      <p className="p2-body p2-pretty mt-2 max-w-sm" style={{ color: "var(--p2-muted)" }}>{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
