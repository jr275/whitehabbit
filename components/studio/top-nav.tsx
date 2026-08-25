"use client"

import { Boxes, Circle, LogOut, Menu, X } from "lucide-react"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

const GROUPS = [
  { label: "Build", links: [{ href: "/factory", label: "Factory" }, { href: "/studio", label: "Studio" }, { href: "/library", label: "Skills" }] },
  { label: "Connect", links: [{ href: "/integrations", label: "Integrations" }] },
  { label: "Operate", links: [{ href: "/workforce", label: "Workforce" }, { href: "/outputs", label: "Executions" }, { href: "/approvals", label: "Approvals" }, { href: "/observatory", label: "Observatory" }] },
]

export function TopNav({ runtimeMode }: { runtimeMode?: "development" | "preview" | "production" }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const orgName = (session as { organizationName?: string } | null)?.organizationName
  const links = GROUPS.flatMap((group) => group.links)

  return <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-xl">
    <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-5 px-4 sm:px-6">
      <Link href="/" className="flex items-center gap-2" aria-label="Menlo Whitehabbit home"><span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Boxes className="size-3.5" /></span><span className="font-mono text-[13px] font-semibold tracking-tight text-foreground">Menlo Whitehabbit</span></Link>
      <nav className="hidden min-w-0 items-center gap-5 lg:flex" aria-label="Product navigation">{GROUPS.map((group) => <div key={group.label} className="flex items-center gap-1"><span className="mr-1 font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground/60">{group.label}</span>{group.links.map((link) => { const active = pathname.startsWith(link.href); return <Link key={link.href} href={link.href} className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}>{link.label}</Link> })}</div>)}</nav>
      <div className="ml-auto flex items-center gap-2">{runtimeMode && runtimeMode !== "production" && <span className="hidden rounded-full border border-warn/30 bg-warn/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-warn sm:inline">{runtimeMode}</span>}{orgName && <div className="hidden items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 sm:flex"><Circle className="size-1.5 fill-grow text-grow" /><span className="max-w-32 truncate font-mono text-[10px] text-foreground">{orgName}</span></div>}{session && <button onClick={() => signOut({ callbackUrl: "/login" })} className="hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground sm:flex"><LogOut className="size-3.5" />Sign out</button>}<button onClick={() => setOpen((value) => !value)} className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground lg:hidden" aria-expanded={open} aria-label="Toggle product navigation">{open ? <X className="size-4" /> : <Menu className="size-4" />}</button></div>
    </div>
    {open && <nav className="border-t border-border px-4 py-4 lg:hidden" aria-label="Mobile product navigation"><div className="grid gap-5 sm:grid-cols-2">{GROUPS.map((group) => <div key={group.label} className="flex flex-col gap-1"><span className="px-2 pb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{group.label}</span>{group.links.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className={`rounded-lg px-3 py-2 text-sm ${pathname.startsWith(link.href) ? "bg-secondary text-foreground" : "text-muted-foreground"}`}>{link.label}</Link>)}</div>)}</div></nav>}
  </header>
}
