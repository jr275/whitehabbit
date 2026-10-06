"use client"

/* ================================================================== *
 * MOBILE HEADER.
 *
 * This file used to render a desktop top bar as well, carrying a
 * context label that every page already states in its own H1, a second
 * copy of the search field, and a second Save button. On desktop all
 * three now live in the rail and this header does not render at all —
 * which is how a screen gets its top 64 pixels back and stops opening
 * with two bands of chrome.
 *
 * On a phone there is no rail, so the same three affordances have to
 * be somewhere: brand, search, save, on one line.
 * ================================================================== */

import { Plus, Search } from "lucide-react"
import Link from "next/link"

interface KnowledgeTopbarProps {
  onOpenPalette: () => void
  onOpenSave: () => void
}

export function KnowledgeTopbar({ onOpenPalette, onOpenSave }: KnowledgeTopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--pk-rule)] bg-[var(--pk-ground)]/88 backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center gap-2 px-4">
        <Link
          href="/knowledge/home"
          className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--pk-ink)]"
          aria-label="Keeply home"
        >
          Keeply
        </Link>

        <div className="flex flex-1 items-center justify-end gap-1">
          <button
            onClick={onOpenPalette}
            aria-label="Search your knowledge"
            className="flex size-9 items-center justify-center rounded-full text-[var(--pk-ink-2)] transition-colors active:bg-[var(--pk-sunken)]"
          >
            <Search className="size-[18px]" strokeWidth={1.9} />
          </button>
          <button
            onClick={onOpenSave}
            aria-label="Save a link"
            className="flex h-9 items-center gap-1 rounded-full bg-[var(--pk-accent)] px-3.5 text-[13px] font-medium text-[var(--pk-accent-ink)]"
          >
            <Plus className="size-4" strokeWidth={2.4} />
            Save
          </button>
        </div>
      </div>
    </header>
  )
}
