"use client"

import { Moon, Plus, Search, Sun } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { KNOWLEDGE_NAV, isNavActive } from "@/lib/knowledge/config"
import type { KnowledgeTheme } from "@/lib/knowledge/theme"
import { KeeplyWordmark } from "./keeply-wordmark"

interface KnowledgeTopbarProps {
  onOpenPalette: () => void
  onOpenSave: () => void
  theme: KnowledgeTheme
  onToggleTheme: () => void
}

function useContextLabel(pathname: string): string {
  if (pathname.startsWith("/knowledge/read/")) return "Reading"
  const match = KNOWLEDGE_NAV.find((n) => isNavActive(pathname, n.href))
  if (match?.href === "/knowledge") return "Home"
  return match?.label ?? "Knowledge"
}

export function KnowledgeTopbar({ onOpenPalette, onOpenSave, theme, onToggleTheme }: KnowledgeTopbarProps) {
  const pathname = usePathname()
  const label = useContextLabel(pathname)

  return (
    <header className="sticky top-0 z-30 bg-[var(--background)]/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        {/* left — contextual label (desktop) / brand (mobile) */}
        <div className="flex flex-1 items-center">
          <Link href="/knowledge" className="flex items-center lg:hidden" aria-label="Keeply home">
            <KeeplyWordmark className="text-xl" />
          </Link>
          <span className="hidden font-serif text-lg font-medium tracking-tight text-foreground lg:block">
            {label}
          </span>
        </div>

        {/* center — prominent search */}
        <button
          onClick={onOpenPalette}
          aria-label="Search your knowledge"
          className="group flex h-10 flex-1 items-center gap-3 rounded-full border border-[var(--kn-edge)] bg-card px-4 text-left shadow-sm transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] lg:max-w-md"
        >
          <Search className="size-4 text-muted-foreground" />
          <span className="flex-1 truncate text-sm text-muted-foreground">Search your knowledge…</span>
          <kbd className="hidden items-center gap-0.5 rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:flex">
            ⌘K
          </kbd>
        </button>

        {/* right — save */}
        <div className="flex flex-1 items-center justify-end gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === "black" ? "Switch to Clean theme" : "Switch to Black theme"}
            title={theme === "black" ? "Clean theme" : "Black theme"}
            className="flex h-10 items-center gap-2 rounded-full border border-[var(--kn-edge)] bg-card px-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)]"
          >
            {theme === "black" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span className="hidden md:inline">{theme === "black" ? "Clean" : "Black"}</span>
          </button>
          <button
            onClick={onOpenSave}
            className="flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            <Plus className="size-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Save</span>
          </button>
        </div>
      </div>
    </header>
  )
}
