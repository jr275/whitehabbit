"use client"

/* ------------------------------------------------------------------ *
 * WorkforceNav — the dark, persistent bar across the Workforce
 * surfaces (Observatory, Workforce roster, worker detail). Distinct
 * from the light operational TopNav that serves the real Studio /
 * Outputs product. A [DEMO] marker is always visible here: these
 * surfaces run on the swappable demo execution layer, not the real
 * single-worker runtime.
 * ------------------------------------------------------------------ */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useDemoWorkforce } from "@/lib/workforce-demo/store"

const LINKS = [
  { href: "/observatory", label: "Observatory" },
  { href: "/workforce", label: "Workforce" },
  { href: "/outcomes", label: "Outcomes" },
  { href: "/approvals", label: "Approvals" },
  { href: "/evolve", label: "Evolve" },
]

export function WorkforceNav() {
  const pathname = usePathname()
  const { approvals } = useDemoWorkforce()
  const pending = approvals.filter((a) => a.status === "pending").length

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-7 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="relative flex h-5 w-5 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-primary/25 blur-[6px]" />
            <span className="relative h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_var(--color-primary)]" />
          </span>
          <span className="font-mono text-[12px] font-medium uppercase tracking-[0.22em] text-foreground">
            WhiteHabbit
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active =
              pathname === l.href || pathname.startsWith(l.href + "/")
            const showBadge = l.href === "/approvals" && pending > 0
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] transition-colors ${
                  active
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label}
                {showBadge && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warn px-1 font-mono text-[9px] font-semibold text-background">
                    {pending}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/studio"
            className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            Real Studio →
          </Link>
          <span
            className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-warn"
            title="These surfaces run on the swappable demo execution layer, not the real runtime."
          >
            Demo
          </span>
        </div>
      </div>
    </header>
  )
}
