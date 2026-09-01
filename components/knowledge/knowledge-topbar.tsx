"use client"

import { LibraryBig, Plus, Search } from "lucide-react"
import Link from "next/link"

interface KnowledgeTopbarProps {
  onOpenPalette: () => void
  onOpenSave: () => void
}

export function KnowledgeTopbar({ onOpenPalette, onOpenSave }: KnowledgeTopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--kn-edge)] bg-[var(--background)]/85 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        {/* mobile brand */}
        <Link href="/knowledge" className="flex items-center gap-2 lg:hidden" aria-label="Knowledge home">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--kn-ai)]/15 text-[var(--kn-ai)]">
            <LibraryBig className="size-4" />
          </span>
        </Link>

        {/* search */}
        <button
          onClick={onOpenPalette}
          className="group flex h-10 flex-1 items-center gap-3 rounded-xl border border-[var(--kn-edge)] bg-card/50 px-3.5 text-left transition-colors hover:border-foreground/20 sm:max-w-md"
        >
          <Search className="size-4 text-muted-foreground" />
          <span className="flex-1 truncate text-sm text-muted-foreground">Search your knowledge…</span>
          <kbd className="hidden items-center gap-0.5 rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:flex">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onOpenSave}
            className="flex h-10 items-center gap-2 rounded-xl bg-[var(--kn-ai)] px-4 text-sm font-medium text-[color:oklch(0.2_0.02_75)] transition-transform hover:scale-[1.02] active:scale-95"
          >
            <Plus className="size-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Save</span>
          </button>
        </div>
      </div>
    </header>
  )
}
