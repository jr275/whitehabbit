import Link from "next/link"
import type { ReactNode } from "react"
import { BrandLockup } from "@/components/pocket2/brand"

/* The frame both auth screens share, so sign-in and sign-up cannot
 * drift apart visually. Calm and narrow: nothing on this page competes
 * with the two fields the person came here to fill in. */
export function AuthShell({
  title, subtitle, children, footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-12" style={{ background: "var(--p2-paper)" }}>
      <Link href="/pocket2" className="p2-focusable rounded-md" style={{ color: "var(--p2-ink)" }}>
        <BrandLockup size={24} />
      </Link>

      <main className="mt-9 w-full max-w-[25rem]">
        <div
          className="p-7"
          style={{
            background: "var(--p2-surface)",
            border: "1px solid var(--p2-line)",
            borderRadius: "var(--p2-r-xl)",
            boxShadow: "var(--p2-shadow-md)",
          }}
        >
          <h1 className="p2-h2" style={{ color: "var(--p2-ink-strong)" }}>{title}</h1>
          <p className="p2-small mt-1.5" style={{ color: "var(--p2-muted)" }}>{subtitle}</p>
          {children}
        </div>
        <p className="p2-small mt-5 text-center" style={{ color: "var(--p2-muted)" }}>{footer}</p>
      </main>
    </div>
  )
}

export function Field({
  label, hint, ...props
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="p2-small" style={{ color: "var(--p2-ink)", fontWeight: 520 }}>{label}</span>
      <input className="p2-field" {...props} />
      {hint && <span className="p2-meta">{hint}</span>}
    </label>
  )
}

/* Errors are announced, not just coloured — a screen reader user finds
 * out the sign-in failed at the same moment everyone else does. */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p
      role="alert"
      className="p2-small rounded-[var(--p2-r-md)] px-3 py-2"
      style={{ background: "var(--p2-danger-soft)", color: "var(--p2-danger)" }}
    >
      {children}
    </p>
  )
}
