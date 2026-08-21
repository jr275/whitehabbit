"use client"

/* ------------------------------------------------------------------ *
 * Operational top nav — a slim, persistent bar across the light
 * surfaces. Overview links back to the immersive Fabric; Studio and
 * Outputs are the operational surfaces; Activity is upcoming.
 * ------------------------------------------------------------------ */

import { Circle } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/studio", label: "Studio" },
  { href: "/outputs", label: "Outputs" },
  { href: "/activity", label: "Activity", soon: true },
]

export function TopNav() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-5 sm:px-8">
        {/* brand */}
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
            <Circle className="h-3 w-3 fill-primary-foreground text-primary-foreground" />
          </span>
          <span className="font-mono text-[13px] font-semibold tracking-tight text-foreground">
            WhiteHabbit
          </span>
        </Link>

        {/* section links */}
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)
            if (l.soon) {
              return (
                <span
                  key={l.href}
                  className="flex cursor-default items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] text-muted-foreground/50"
                  aria-disabled="true"
                >
                  {l.label}
                  <span className="rounded bg-muted px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    Soon
                  </span>
                </span>
              )
            }
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                  active
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            )
          })}
        </nav>

        {/* right — worker chip */}
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 sm:flex">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-grow opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-grow" />
            </span>
            <span className="font-mono text-[11px] tracking-tight text-foreground">
              Atlas
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              v3.2 · Live
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
