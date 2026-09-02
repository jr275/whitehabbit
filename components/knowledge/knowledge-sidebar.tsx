"use client"

import { Boxes, ChevronsUpDown, LibraryBig, LogOut, User } from "lucide-react"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { KNOWLEDGE_NAV, isNavActive } from "@/lib/knowledge/config"

export function KnowledgeSidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const email = session?.user?.email ?? ""
  const orgName = (session as { organizationName?: string } | null)?.organizationName ?? "Your organization"

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-[var(--kn-edge)] bg-sidebar lg:flex">
      {/* brand + product switcher */}
      <div className="relative px-4 pt-5">
        <button
          onClick={() => setSwitcherOpen((v) => !v)}
          aria-expanded={switcherOpen}
          className="flex w-full items-center gap-3 rounded-xl border border-[var(--kn-edge)] bg-card/60 p-2.5 text-left transition-colors hover:border-foreground/20"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--kn-ai)]/15 text-[var(--kn-ai)]">
            <LibraryBig className="size-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              Whitehabbit
            </span>
            <span className="block truncate font-serif text-base font-medium text-foreground">
              Knowledge
            </span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>

        {switcherOpen && (
          <div className="absolute inset-x-4 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-2xl">
            <p className="px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              Switch product
            </p>
            <Link
              href="/knowledge"
              className="flex items-center gap-3 rounded-lg bg-secondary/70 px-2.5 py-2"
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-[var(--kn-ai)]/15 text-[var(--kn-ai)]">
                <LibraryBig className="size-4" />
              </span>
              <span className="text-sm font-medium text-foreground">Knowledge</span>
              <span className="ml-auto size-1.5 rounded-full bg-grow" />
            </Link>
            <Link
              href="/"
              className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Boxes className="size-4" />
              </span>
              <span className="text-sm font-medium">Workforce</span>
            </Link>
          </div>
        )}
      </div>

      {/* primary nav */}
      <nav className="mt-5 flex-1 space-y-0.5 px-3" aria-label="Knowledge navigation">
        {KNOWLEDGE_NAV.map((item) => {
          const active = isNavActive(pathname, item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--kn-ai)]" />
              )}
              <Icon className={cn("size-4", active ? "text-[var(--kn-ai)]" : "")} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* bottom — real account + sign out */}
      <div className="relative border-t border-[var(--kn-edge)] p-3">
        {accountOpen && (
          <div className="absolute inset-x-3 bottom-full z-30 mb-1.5 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-2xl">
            <div className="px-2.5 py-2">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Signed in</p>
              <p className="mt-1 truncate text-sm font-medium text-popover-foreground">{email || "Authenticated"}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{orgName}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </div>
        )}
        <button
          onClick={() => setAccountOpen((v) => !v)}
          aria-expanded={accountOpen}
          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-secondary/50"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary">
            <User className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{email || "Your account"}</span>
            <span className="block truncate font-mono text-[10px] text-muted-foreground">{orgName}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </div>
    </aside>
  )
}
