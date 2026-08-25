"use client"

/* ------------------------------------------------------------------ *
 * Operational top nav — a slim, persistent bar across the light
 * surfaces. Every link here is a real, connected surface backed by
 * the real runtime — no link points at a page with no real data
 * behind it.
 *
 * The AI Agent Operating System information architecture (Overview /
 * Agents / Studio / Connectors / Executions / Outputs / Knowledge /
 * Settings): "/" is now Overview (real, DB-backed — the old precedent
 * here about Overview having "no real Worker data behind it" no
 * longer holds, now that Observatory/Outputs are fully real).
 * Approvals is a real, separate actionable inbox — kept as a
 * secondary link on the right rather than one of the primary 8, no
 * live badge count yet (would need a new global fetch this bar
 * doesn't have today).
 *
 * Products, Marketing, Library, and Insights are deliberately NOT
 * linked here — same reasoning this bar already applied to Library/
 * Insights: a different, disconnected surface with no place in the
 * new IA yet. Their routes and code are untouched and still reachable
 * directly (/products, /marketing, /library, /insights) — a
 * navigation decision only, never a removal. /evolve and /outcomes
 * are still demo-store-backed (see lib/workforce-demo/) and are left
 * off this bar for the same reason — reachable directly, unchanged.
 * ------------------------------------------------------------------ */

import { Circle, LogOut } from "lucide-react"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/workforce", label: "Agents" },
  { href: "/studio", label: "Studio" },
  { href: "/integrations", label: "Connectors" },
  { href: "/observatory", label: "Executions" },
  { href: "/outputs", label: "Outputs" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/settings", label: "Settings" },
]

export function TopNav({ runtimeMode }: { runtimeMode?: "development" | "preview" | "production" }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const orgName = (session as { organizationName?: string } | null)?.organizationName

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
            // "/" (Overview) must match exactly — every path "starts
            // with" "/", which would otherwise mark Overview active
            // everywhere.
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)
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

        {/* right — Approvals (a real, separate actionable inbox — see
         * header comment), real runtime mode, real authenticated
         * organization, real sign-out */}
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/approvals"
            className={`rounded-md px-2.5 py-1.5 text-[12px] transition-colors ${
              pathname.startsWith("/approvals") ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Approvals
          </Link>
          {runtimeMode && runtimeMode !== "production" && (
            <span className="hidden rounded-full border border-warn/30 bg-warn/10 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-wider text-warn sm:inline">
              {runtimeMode}
            </span>
          )}
          {orgName && (
            <div className="hidden items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 sm:flex">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-grow opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-grow" />
              </span>
              <span className="max-w-[10rem] truncate font-mono text-[11px] tracking-tight text-foreground">{orgName}</span>
            </div>
          )}
          {session && (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
