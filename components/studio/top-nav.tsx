"use client"

import {
  Activity,
  Boxes,
  ChevronDown,
  Circle,
  Factory,
  Gauge,
  LogOut,
  Menu,
  PackageOpen,
  PlugZap,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
} from "lucide-react"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

const GROUPS = [
  {
    label: "Workspace",
    links: [
      { href: "/", label: "Overview", icon: Gauge },
      { href: "/workforce", label: "Workers", icon: Users },
      { href: "/outputs", label: "Runs & Outputs", icon: Activity },
      { href: "/approvals", label: "Approvals", icon: ShieldCheck },
    ],
  },
  {
    label: "Build",
    links: [
      { href: "/studio", label: "Worker Studio", icon: Workflow },
      { href: "/factory", label: "Factory", icon: Factory },
      // "/library" (Skills marketplace) intentionally unlinked here — its 8
      // worker archetypes (including "FIN") are fixture data with no real
      // Skill behind them yet. Route stays reachable by direct URL; the
      // component (components/library/worker-card.tsx) is worth reusing
      // once real financial Workers exist to populate it with. See
      // docs/domain-model.md §5.
    ],
  },
  {
    label: "Connect",
    links: [{ href: "/integrations", label: "Integrations", icon: PlugZap }],
  },
  {
    label: "Observe",
    links: [
      { href: "/observatory", label: "Observatory", icon: Activity },
      { href: "/outcomes", label: "Outcomes", icon: PackageOpen },
      { href: "/evolve", label: "Improve", icon: Sparkles },
    ],
  },
] as const

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

export function TopNav({ runtimeMode }: { runtimeMode?: "development" | "preview" | "production" }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const orgName = (session as { organizationName?: string } | null)?.organizationName ?? "Primary workspace"

  useEffect(() => setOpen(false), [pathname])

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/92 backdrop-blur-xl">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Menlo Whitehabbit overview">
          <span className="flex size-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary"><Boxes className="size-4" /></span>
          <span className="hidden font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground sm:inline">Whitehabbit</span>
        </Link>

        <div className="relative hidden lg:block">
          <button onClick={() => setWorkspaceOpen((value) => !value)} className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs text-muted-foreground hover:text-foreground" aria-expanded={workspaceOpen}>
            <Circle className="size-1.5 fill-grow text-grow" />
            <span className="max-w-36 truncate">{orgName}</span>
            <ChevronDown className="size-3" />
          </button>
          {workspaceOpen && <div className="absolute left-0 top-10 w-64 rounded-lg border border-border bg-popover p-3 shadow-xl"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Authenticated organization</p><p className="mt-2 truncate text-sm font-medium text-popover-foreground">{orgName}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Organization switching is unavailable in this release.</p></div>}
        </div>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex" aria-label="Primary navigation">
          {GROUPS.map((group) => group.links.map((link) => {
            const active = isActive(pathname, link.href)
            return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`rounded-md px-2.5 py-1.5 text-[11px] transition-colors ${active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}>{link.label}</Link>
          }))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button className="hidden h-8 items-center gap-2 rounded-md border border-border bg-card px-3 text-[11px] text-muted-foreground hover:text-foreground md:flex" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))} aria-label="Open command menu"><Search className="size-3.5" />Search <kbd className="font-mono text-[9px]">⌘K</kbd></button>
          {runtimeMode && runtimeMode !== "production" && <span className="hidden rounded-full border border-warn/30 bg-warn/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-warn sm:inline">{runtimeMode}</span>}
          {session && <button onClick={() => signOut({ callbackUrl: "/login" })} className="hidden size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground sm:flex" aria-label="Sign out"><LogOut className="size-4" /></button>}
          <button onClick={() => setOpen((value) => !value)} className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground xl:hidden" aria-expanded={open} aria-label="Toggle primary navigation">{open ? <X className="size-4" /> : <Menu className="size-4" />}</button>
        </div>
      </div>

      {open && <nav className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-border bg-background px-4 py-5 xl:hidden" aria-label="Mobile primary navigation"><div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-4">{GROUPS.map((group) => <section key={group.label}><p className="px-2 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{group.label}</p><div className="mt-2 flex flex-col gap-1">{group.links.map((link) => { const active = isActive(pathname, link.href); const Icon = link.icon; return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}><Icon className="size-4" />{link.label}</Link> })}</div></section>)}</div></nav>}
    </header>
  )
}
