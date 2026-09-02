"use client"

import { Boxes, Check, ChevronDown, LibraryBig, LogOut } from "lucide-react"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { KNOWLEDGE_NAV, isNavActive } from "@/lib/knowledge/config"

/** The flat config, split into an editorial "browse" set and a quieter
 *  "tools" set below a divider — closer to a reading app than a console. */
const BROWSE = KNOWLEDGE_NAV.slice(0, 5)
const TOOLS = KNOWLEDGE_NAV.slice(5)

export function KnowledgeSidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const email = session?.user?.email ?? ""
  const orgName = (session as { organizationName?: string } | null)?.organizationName ?? "Your organization"
  const initial = (email || "Y").charAt(0).toUpperCase()

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-sidebar lg:flex">
      {/* brand + product switcher */}
      <div className="relative px-5 pt-6">
        <button
          onClick={() => setSwitcherOpen((v) => !v)}
          aria-expanded={switcherOpen}
          className="group flex w-full items-center gap-2.5 rounded-lg py-1 text-left"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LibraryBig className="size-4" />
          </span>
          <span className="min-w-0 flex-1 font-serif text-xl font-medium leading-none tracking-tight text-foreground">
            Knowledge
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform group-hover:text-foreground",
              switcherOpen && "rotate-180",
            )}
          />
        </button>

        {switcherOpen && (
          <div className="absolute inset-x-5 top-full z-30 mt-2 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl">
            <p className="px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">Switch product</p>
            <Link href="/knowledge" className="flex items-center gap-3 rounded-lg bg-secondary px-2.5 py-2">
              <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <LibraryBig className="size-4" />
              </span>
              <span className="text-sm font-medium text-foreground">Knowledge</span>
              <Check className="ml-auto size-4 text-primary" strokeWidth={2.5} />
            </Link>
            <Link
              href="/"
              className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-foreground/8 text-foreground/70">
                <Boxes className="size-4" />
              </span>
              <span className="text-sm font-medium">Workforce</span>
            </Link>
          </div>
        )}
      </div>

      {/* primary nav */}
      <nav className="mt-7 flex-1 px-3" aria-label="Knowledge navigation">
        <div className="space-y-0.5">
          {BROWSE.map((item) => (
            <NavLink key={item.href} item={item} active={isNavActive(pathname, item.href)} />
          ))}
        </div>

        <div className="my-4 h-px bg-[var(--kn-edge)]" />

        <div className="space-y-0.5">
          {TOOLS.map((item) => (
            <NavLink key={item.href} item={item} active={isNavActive(pathname, item.href)} />
          ))}
        </div>
      </nav>

      {/* account — deliberately subtle */}
      <div className="relative px-3 pb-4">
        {accountOpen && (
          <div className="absolute inset-x-3 bottom-full z-30 mb-2 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl">
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium text-popover-foreground">{email || "Authenticated"}</p>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{orgName}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </div>
        )}
        <button
          onClick={() => setAccountOpen((v) => !v)}
          aria-expanded={accountOpen}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/12 font-serif text-sm font-medium text-primary">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{email || "Your account"}</span>
            <span className="block truncate text-[12px] text-muted-foreground">{orgName}</span>
          </span>
        </button>
      </div>
    </aside>
  )
}

function NavLink({ item, active }: { item: (typeof KNOWLEDGE_NAV)[number]; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Icon className="size-[18px]" strokeWidth={active ? 2.25 : 2} />
      {item.label}
    </Link>
  )
}
