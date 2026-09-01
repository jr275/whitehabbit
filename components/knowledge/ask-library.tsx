"use client"

import { ArrowRight, Sparkles } from "lucide-react"
import { useState } from "react"

const SUGGESTIONS = [
  "What have I saved about AI agents?",
  "Summarize my product strategy reading",
  "What connects my recent saves?",
]

export function AskLibrary({ compact = false }: { compact?: boolean }) {
  const [value, setValue] = useState("")

  return (
    <section
      aria-label="Ask your library"
      className="relative overflow-hidden rounded-2xl border border-[var(--kn-ai)]/25 bg-gradient-to-br from-[var(--kn-ai)]/[0.08] to-transparent p-5 sm:p-6"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[var(--kn-ai)]/10 blur-3xl" />
      <div className="relative">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--kn-ai)]">
          <Sparkles className="size-3.5" /> Ask your library
        </span>
        {!compact && (
          <h2 className="mt-2 text-balance font-serif text-2xl font-medium tracking-tight text-foreground">
            Query your own memory.
          </h2>
        )}

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--kn-edge)] bg-background/60 p-1.5 pl-4">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="What have I saved about AI agents?"
            className="h-9 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            aria-label="Ask"
            className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--kn-ai)] px-3.5 text-sm font-medium text-[color:oklch(0.2_0.02_75)] transition-transform hover:scale-[1.02] active:scale-95"
          >
            Ask <ArrowRight className="size-3.5" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setValue(s)}
              className="rounded-full border border-[var(--kn-edge)] bg-card/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
