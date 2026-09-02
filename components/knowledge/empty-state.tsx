"use client"

import { BookOpen, Plus, Puzzle } from "lucide-react"

export function EmptyLibrary({ onSave }: { onSave: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-[var(--kn-edge)] bg-card px-6 py-24 text-center shadow-sm">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <BookOpen className="size-7" />
      </span>
      <h2 className="mt-7 max-w-md text-balance font-serif text-3xl font-medium leading-tight tracking-tight text-foreground">
        Your library starts here.
      </h2>
      <p className="mt-3 max-w-sm text-pretty text-[15px] leading-relaxed text-muted-foreground">
        Save something interesting from the web — an article, a video, a paper — and we&apos;ll keep it here,
        beautifully readable, whenever you want to come back to it.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <button
          onClick={onSave}
          className="flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-95"
        >
          <Plus className="size-4" strokeWidth={2.5} /> Save your first link
        </button>
        <button className="flex h-11 items-center gap-2 rounded-full border border-[var(--kn-edge)] bg-card px-6 text-sm font-medium text-foreground transition-colors hover:border-foreground/25">
          <Puzzle className="size-4" /> Install browser extension
        </button>
      </div>
    </div>
  )
}
