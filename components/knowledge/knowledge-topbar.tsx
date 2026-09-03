"use client"

import { LibraryBig, LogIn, Plus, Search } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { KNOWLEDGE_NAV, isNavActive } from "@/lib/knowledge/config"
import { useKnowledgeAuth } from "./knowledge-auth"

interface KnowledgeTopbarProps {
  onOpenPalette: () => void
  onOpenSave: () => void
}

function useContextLabel(pathname: string): string {
  if (pathname.startsWith("/knowledge/read/")) return "Reading"
  const match = KNOWLEDGE_NAV.find((n) => isNavActive(pathname, n.href))
  if (match?.href === "/knowledge") return "Home"
  return match?.label ?? "Knowledge"
}

export function KnowledgeTopbar({ onOpenPalette, onOpenSave }: KnowledgeTopbarProps) {
  const pathname = usePathname()
  const label = useContextLabel(pathname)
  const auth = useKnowledgeAuth()

  return (
    <header className="sticky top-0 z-30 bg-[var(--background)]/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        {/* left — contextual label (desktop) / brand (mobile) */}
        <div className="flex flex-1 items-center">
          <Link href="/knowledge" className="flex items-center gap-2 lg:hidden" aria-label="Knowledge home">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <LibraryBig className="size-4" />
            </span>
          </Link>
          <span className="hidden font-serif text-lg font-medium tracking-tight text-foreground lg:block">
            {label}
          </span>
        </div>

        {/* center — prominent search */}
        <button
          onClick={onOpenPalette}
          className="group flex h-10 flex-1 items-center gap-3 rounded-full border border-[var(--kn-edge)] bg-card px-4 text-left shadow-sm transition-colors hover:border-foreground/25 lg:max-w-md"
        >
          <Search className="size-4 text-muted-foreground" />
          <span className="flex-1 truncate text-sm text-muted-foreground">Search your knowledge…</span>
          <kbd className="hidden items-center gap-0.5 rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:flex">
            ⌘K
          </kbd>
        </button>

        {/* right — sign in (when it is the honest next step) + save */}
        <div className="flex flex-1 items-center justify-end gap-2">
          {/* The CTA that was missing. It used to exist only inside the
              sidebar's account popover — two clicks deep, behind an
              unlabelled avatar — so in practice the product had no way
              in. Shown for both guests and lapsed sessions, with copy
              that says which one this is. */}
          {auth.state !== "authenticated" && (
            <button
              onClick={auth.promptSignIn}
              className={
                auth.state === "auth_required"
                  ? "flex h-10 items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/15"
                  : "flex h-10 items-center gap-2 rounded-full border border-[var(--kn-edge)] bg-card px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-foreground/25"
              }
            >
              <LogIn className="size-4" />
              <span className="hidden sm:inline">
                {auth.state === "auth_required" ? "Sign in again" : "Sign in"}
              </span>
            </button>
          )}
          <button
            onClick={onOpenSave}
            className="flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-95"
          >
            <Plus className="size-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Save</span>
          </button>
        </div>
      </div>
    </header>
  )
}
