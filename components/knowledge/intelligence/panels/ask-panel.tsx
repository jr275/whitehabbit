"use client"

import { ArrowRight, Loader2, Mic, Search, Sparkles, Telescope } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { openCommandPalette } from "@/lib/knowledge/config"
import { cn } from "@/lib/utils"
import { PanelHeading } from "../shared"

/**
 * Entry points into the three ASK-style surfaces that already exist and
 * work today: Ask (`/knowledge/ai`), Research (`/knowledge/research`) and
 * Voice (browser search). This panel does not reimplement any of them —
 * Ask and Research are real links; Voice is a visual-state preview only.
 */
export function AskPanel() {
  return (
    <div>
      <PanelHeading title="Ask, research & voice" hint="Three ways to interrogate your library — all live." />

      <div className="grid gap-3 lg:grid-cols-3">
        <Link
          href="/knowledge/ai"
          className="group flex flex-col gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-6 transition-colors hover:border-[var(--kn-ai)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)]"
        >
          <Sparkles className="size-6 text-[var(--kn-ai)]" />
          <h3 className="font-serif text-xl font-medium tracking-tight text-foreground">Ask</h3>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            Ask a question and get an answer grounded in what you&apos;ve saved, with sources.
          </p>
          <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[13px] font-medium text-[var(--kn-ai)]">
            Open Ask <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link
          href="/knowledge/research"
          className="group flex flex-col gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-6 transition-colors hover:border-[var(--kn-ai)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)]"
        >
          <Telescope className="size-6 text-[var(--kn-ai)]" />
          <h3 className="font-serif text-xl font-medium tracking-tight text-foreground">Research</h3>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            Go beyond your library — Keeply searches the web and synthesizes a cited briefing.
          </p>
          <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[13px] font-medium text-[var(--kn-ai)]">
            Start research <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <VoiceCard />
      </div>
    </div>
  )
}

type VoiceState = "idle" | "listening" | "processing" | "ready"

/** Interactive VISUAL preview of the voice states only. It runs no
 *  speech engine and stores nothing; "Use voice search" hands off to the
 *  real command palette where the shipped Web Speech search lives. */
function VoiceCard() {
  const [state, setState] = useState<VoiceState>("idle")

  useEffect(() => {
    if (state === "listening") {
      const t = setTimeout(() => setState("processing"), 2200)
      return () => clearTimeout(t)
    }
    if (state === "processing") {
      const t = setTimeout(() => setState("ready"), 1200)
      return () => clearTimeout(t)
    }
  }, [state])

  const label =
    state === "idle"
      ? "Tap to preview"
      : state === "listening"
        ? "Listening…"
        : state === "processing"
          ? "Understanding…"
          : "Ready to search"

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-6">
      <div className="flex items-center justify-between">
        <Mic className="size-6 text-[var(--kn-ai)]" />
        <span className="rounded-full border border-[var(--kn-edge)] bg-[var(--kn-well)]/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Visual preview
        </span>
      </div>
      <h3 className="font-serif text-xl font-medium tracking-tight text-foreground">Voice</h3>

      <div className="flex flex-col items-center py-2">
        <button
          onClick={() => setState(state === "idle" || state === "ready" ? "listening" : "idle")}
          aria-label={state === "listening" ? "Stop preview" : "Preview voice states"}
          className="relative flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kn-paper)]"
        >
          {state === "listening" && (
            <>
              <span className="absolute inset-0 animate-ping rounded-full bg-[var(--kn-ai)]/40" />
              <span className="absolute -inset-2 animate-pulse rounded-full border border-[var(--kn-ai)]/30" />
            </>
          )}
          {state === "processing" ? <Loader2 className="size-6 animate-spin" /> : <Mic className="size-6" />}
        </button>
        <p className={cn("mt-3 text-[13px]", state === "idle" ? "text-muted-foreground" : "text-foreground")}>{label}</p>

        {/* equalizer while listening */}
        {state === "listening" && (
          <div className="mt-3 flex h-6 items-end gap-1" aria-hidden>
            {[0.4, 0.9, 0.6, 1, 0.5, 0.8, 0.3].map((h, i) => (
              <span
                key={i}
                className="w-1 animate-pulse rounded-full bg-[var(--kn-ai)]/70"
                style={{ height: `${h * 100}%`, animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
        )}
      </div>

      {state === "ready" ? (
        <button
          onClick={openCommandPalette}
          className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-2 text-[13px] font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)]"
        >
          <Search className="size-3.5" /> Use voice search
        </button>
      ) : (
        <p className="mt-auto text-[12px] leading-relaxed text-muted-foreground">
          Preview the listening states. The real voice search lives in the command palette.
        </p>
      )}
    </div>
  )
}
