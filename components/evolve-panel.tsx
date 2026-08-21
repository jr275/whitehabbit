"use client"

import { useEffect, useState } from "react"
import { ArrowUpRight, Dna, Sparkles, X } from "lucide-react"

type Stage = "idle" | "analyzing" | "proposal" | "simulating" | "applied"

export function EvolvePanel({
  communicationScore,
  onApply,
}: {
  communicationScore: number
  onApply: () => void
}) {
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>("idle")

  useEffect(() => {
    if (stage === "analyzing") {
      const t = setTimeout(() => setStage("proposal"), 1400)
      return () => clearTimeout(t)
    }
    if (stage === "simulating") {
      const t = setTimeout(() => setStage("applied"), 1600)
      return () => clearTimeout(t)
    }
  }, [stage])

  const start = () => {
    setOpen(true)
    setStage("analyzing")
  }
  const close = () => {
    setOpen(false)
    setStage("idle")
  }

  return (
    <>
      {/* the CTA — not "Edit agent", but EVOLVE a creature that works for you */}
      <div className="rounded-xl border border-primary/25 bg-gradient-to-b from-primary/10 to-transparent p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              <Dna className="h-3.5 w-3.5" />
              Evolve
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-pretty">
              You don&apos;t edit this worker. You make it better. An opportunity was found in{" "}
              <span className="font-medium text-warn">Communication</span>.
            </p>
          </div>
        </div>
        <button
          onClick={start}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Sparkles className="h-4 w-4" />
          Evolve worker
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="WhiteHabbit Evolution"
          onClick={close}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={close}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="border-b border-border/70 px-5 py-4">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
                <Dna className="h-4 w-4" />
                WhiteHabbit Evolution
              </div>
            </div>

            <div className="px-5 py-5">
              {stage === "analyzing" && (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  <p className="font-mono text-[12px] text-muted-foreground">
                    Analyzing 12,481 executions…
                  </p>
                </div>
              )}

              {stage === "proposal" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Current problem
                    </div>
                    <p className="mt-1 text-sm">Low reply quality on enterprise prospects.</p>
                  </div>
                  <div className="rounded-lg border border-grow/30 bg-grow/5 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-grow">
                      Recommended evolution
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                      <span className="text-grow">+</span> Contextual Personalization
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-sm">
                      <ArrowUpRight className="h-4 w-4 text-grow" />
                      <span className="font-mono tabular-nums text-grow">+18%</span>
                      <span className="text-muted-foreground">expected reply rate</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setStage("simulating")}
                    className="mt-1 rounded-lg border border-border bg-secondary py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    Simulate change
                  </button>
                </div>
              )}

              {stage === "simulating" && (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-grow/30 border-t-grow" />
                  <p className="font-mono text-[12px] text-muted-foreground">
                    Simulating against held-out prospects…
                  </p>
                </div>
              )}

              {stage === "applied" && (
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-grow/30 bg-grow/5 p-4 text-center">
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-grow">
                      Evolution applied
                    </div>
                    <div className="mt-2 flex items-center justify-center gap-2 font-mono text-sm tabular-nums">
                      <span className="text-muted-foreground">Communication {communicationScore}</span>
                      <ArrowUpRight className="h-4 w-4 text-grow" />
                      <span className="text-grow">{Math.min(100, communicationScore + 14)}</span>
                    </div>
                  </div>
                  <p className="text-center text-[13px] leading-relaxed text-muted-foreground text-pretty">
                    Atlas didn&apos;t get reconfigured. It became better. The change is already live on
                    the fabric.
                  </p>
                  <button
                    onClick={() => {
                      onApply()
                      close()
                    }}
                    className="rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Return to worker
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
