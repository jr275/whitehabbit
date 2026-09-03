"use client"

import { LibraryBig, LogIn, LogOut, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { KNOWLEDGE_NAV, isNavActive } from "@/lib/knowledge/config"
import { useKnowledgeAuth } from "./knowledge-auth"

/** The flat config, split into an editorial "browse" set and a quieter
 *  "tools" set below a divider — closer to a reading app than a console. */
const BROWSE = KNOWLEDGE_NAV.slice(0, 5)
const TOOLS = KNOWLEDGE_NAV.slice(5)

export function KnowledgeSidebar() {
  const pathname = usePathname()
  // One source of truth for the three states, shared with the topbar
  // and with lib/knowledge/client.ts — the sidebar used to derive its
  // own "isGuest" from useSession(), which collapsed a lapsed session
  // into a guest and was half of why an expired login was invisible.
  const auth = useKnowledgeAuth()
  const [accountOpen, setAccountOpen] = useState(false)
  const isGuest = auth.state === "guest"
  const expired = auth.state === "auth_required"
  const email = auth.email
  const name = auth.name
  const initial = (name || "Y").charAt(0).toUpperCase()
  const settingsActive = isNavActive(pathname, "/knowledge/settings")

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-sidebar lg:flex">
      {/* brand — Knowledge stands on its own, no product switcher */}
      <div className="px-5 pt-6">
        <Link href="/knowledge" className="flex items-center gap-2.5 py-1" aria-label="Knowledge home">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LibraryBig className="size-4" />
          </span>
          <span className="text-xl font-semibold leading-none tracking-tight text-foreground">
            Keeply
          </span>
        </Link>
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
                {expired ? "Session ended — saving to this device" : isGuest ? "Saved on this device" : email}
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
            {auth.state !== "authenticated" ? (
              // Opens the dialog in place instead of navigating to
              // /login, so signing in never costs the page you were on.
              <button
                onClick={() => {
                  setAccountOpen(false)
                  auth.promptSignIn()
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <LogIn className="size-4" />
                {expired ? "Sign in again" : "Sign in to save permanently"}
              </button>
            ) : (
              <button
                onClick={() => {
                  setAccountOpen(false)
                  auth.signOutOfKnowledge()
                }}
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
              {expired ? "Session ended" : isGuest ? "Guest mode" : email || "Signed in"}
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
