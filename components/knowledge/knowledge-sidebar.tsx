"use client"

import { LogIn, LogOut, Search, Settings } from "lucide-react"
import { signOut, useSession } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { KeeplyWordmark } from "./keeply-wordmark"
import { KNOWLEDGE_NAV, KNOWLEDGE_SECONDARY_NAV, isNavActive, openCommandPalette } from "@/lib/knowledge/config"

export function KnowledgeSidebar() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const [accountOpen, setAccountOpen] = useState(false)
  const isGuest = status === "unauthenticated"
  const email = session?.user?.email ?? ""
  const name = isGuest ? "Guest" : session?.user?.name || email.split("@")[0] || "Your account"
  const initial = (name || "Y").charAt(0).toUpperCase()
  const settingsActive = isNavActive(pathname, "/knowledge/settings")

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-sidebar lg:flex">
      {/* brand — Knowledge stands on its own, no product switcher */}
      <div className="px-5 pt-6">
        <Link href="/knowledge" className="flex items-center py-1" aria-label="Keeply home">
          <KeeplyWordmark />
        </Link>
      </div>

      {/* primary nav */}
      <nav className="mt-7 flex-1 px-3" aria-label="Knowledge navigation">
        <div className="space-y-0.5">
          {/* Home · Library · Topics */}
          {KNOWLEDGE_NAV.slice(0, 3).map((item) => (
            <NavLink key={item.href} item={item} active={isNavActive(pathname, item.href)} />
          ))}

          {/* Search is an action, not a route: it opens the existing
              command palette (same engine as ⌘K), surfaced here so it is
              discoverable without knowing the shortcut. */}
          <SearchNavButton />

          {/* Ask */}
          {KNOWLEDGE_NAV.slice(3).map((item) => (
            <NavLink key={item.href} item={item} active={isNavActive(pathname, item.href)} />
          ))}
        </div>

        <div className="my-4 h-px bg-[var(--kn-edge)]" />

        <div className="space-y-0.5">
          {KNOWLEDGE_SECONDARY_NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isNavActive(pathname, item.href)} />
          ))}
        </div>

        <div className="my-4 h-px bg-[var(--kn-edge)]" />

        <Link
          href="/knowledge/settings"
          aria-current={settingsActive ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors",
            settingsActive
              ? "bg-primary/10 font-medium text-primary"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          <Settings className="size-[18px]" strokeWidth={settingsActive ? 2.25 : 2} />
          Settings
        </Link>
      </nav>

      {/* account — deliberately subtle; no organization/workspace exposed */}
      <div className="relative px-3 pb-4">
        {accountOpen && (
          <div className="absolute inset-x-3 bottom-full z-30 mb-2 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl">
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium text-popover-foreground">{name}</p>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                {isGuest ? "Saved on this device" : email}
              </p>
            </div>
            <Link
              href="/knowledge/settings"
              onClick={() => setAccountOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Settings className="size-4" />
              Settings
            </Link>
            {isGuest ? (
              <Link
                href="/login?callbackUrl=/knowledge"
                onClick={() => setAccountOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <LogIn className="size-4" />
                Sign in to save permanently
              </Link>
            ) : (
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            )}
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
            <span className="block truncate text-sm font-medium text-foreground">{name}</span>
            <span className="block truncate text-[12px] text-muted-foreground">
              {isGuest ? "Guest mode" : email || "Signed in"}
            </span>
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
        "flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--kn-ai)]",
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

/** Search rendered as a nav-styled action. Visually a sibling of the
 *  NavLinks, but it opens the command palette instead of routing, so the
 *  same real search engine is one click (or ⌘K) away from every screen. */
function SearchNavButton() {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[15px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--kn-ai)]"
    >
      <Search className="size-[18px]" strokeWidth={2} />
      <span className="flex-1 text-left">Search</span>
      <kbd className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
    </button>
  )
}
