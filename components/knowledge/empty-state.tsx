"use client"

import { Puzzle, Plus, Sparkles } from "lucide-react"

export function EmptyLibrary({ onSave }: { onSave: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--kn-edge)] bg-[var(--kn-paper)] px-6 py-20 text-center">
      <div className="relative mb-6">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-[var(--kn-ai)]/12 text-[var(--kn-ai)]">
          <Sparkles className="size-7" />
        </span>
        <span className="absolute -right-2 -top-2 size-3 animate-blink rounded-full bg-[var(--kn-ai)]" />
      </div>
      <h2 className="max-w-md text-balance font-serif text-3xl font-medium tracking-tight text-foreground">
        Your knowledge library starts here.
      </h2>
      <p className="mt-3 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
        Save anything worth remembering. We&apos;ll fetch it, understand it and organize it for you —
        so it&apos;s there when you need it.
      </p>
      <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row">
        <button
          onClick={onSave}
          className="flex h-11 items-center gap-2 rounded-xl bg-[var(--kn-ai)] px-5 text-sm font-medium text-[color:oklch(0.2_0.02_75)] transition-transform hover:scale-[1.02] active:scale-95"
        >
          <Plus className="size-4" strokeWidth={2.5} /> Save your first link
        </button>
        <button className="flex h-11 items-center gap-2 rounded-xl border border-[var(--kn-edge)] bg-card/50 px-5 text-sm font-medium text-foreground transition-colors hover:border-foreground/20">
          <Puzzle className="size-4" /> Install browser extension
        </button>
      </div>
    </div>
  )
}
