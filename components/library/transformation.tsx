"use client"

import { useMemo, useState } from "react"
import { Mic, Square, Type, Check, Pencil, Trash2, ChevronRight } from "lucide-react"
import { Waveform } from "./waveform"
import { useVoiceBrief } from "@/lib/library/use-voice-brief"
import {
  extractIntent,
  extractionConfidence,
  STAGE_ORDER,
  STAGE_LABEL,
  type Extraction,
  type IntentStage,
} from "@/lib/library/intent"
import type { WorkerSpec } from "@/lib/library/spec-model"

/* ------------------------------------------------------------------ *
 * Transformation — brief the worker (voice or text), watch the
 * VOICE -> TRANSCRIPT -> INTENT -> SPEC pipeline resolve, then review
 * PROPOSED CHANGES and Apply / Edit / Discard. Nothing is applied
 * until the user explicitly approves.
 * ------------------------------------------------------------------ */
export function Transformation({
  base,
  initialBrief,
  onApply,
  onSkip,
}: {
  base: WorkerSpec
  initialBrief?: string
  onApply: (e: Extraction) => void
  onSkip: () => void
}) {
  const [mode, setMode] = useState<"voice" | "text">(initialBrief ? "text" : "voice")
  const [text, setText] = useState(initialBrief ?? "")
  const [committed, setCommitted] = useState<string | null>(initialBrief ?? null)

  const sample =
    "Make her focused on B2B SaaS companies. Prioritize LTV/CAC and pipeline generated. She can analyze campaigns automatically but should ask before changing budget."

  const voice = useVoiceBrief({
    sampleBrief: sample,
    onComplete: (t) => setCommitted(t),
  })

  const liveBrief = mode === "voice" ? voice.transcript : text
  const extraction = useMemo<Extraction | null>(() => {
    const b = committed ?? liveBrief
    return b && b.trim().length > 4 ? extractIntent(b, base) : null
  }, [committed, liveBrief, base])

  const resolved = committed !== null || (mode === "text" && text.trim().length > 4)
  const confidence = extraction ? extractionConfidence(extraction) : 0

  const changesByStage = (stage: IntentStage) =>
    extraction?.changes.filter((c) => c.stage === stage) ?? []

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      {/* ---- capture ---- */}
      <div className="flex flex-col gap-4">
        <div className="flex gap-1">
          {(["voice", "text"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                mode === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "voice" ? <Mic className="h-3 w-3" /> : <Type className="h-3 w-3" />}
              {m}
            </button>
          ))}
        </div>

        {mode === "voice" ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-6">
            <div className="h-20 w-full">
              <Waveform amplitudes={voice.amplitudes} active={voice.status === "listening"} />
            </div>
            {voice.status === "idle" || voice.status === "done" ? (
              <button
                onClick={() => {
                  setCommitted(null)
                  voice.reset()
                  voice.start()
                }}
                className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Mic className="h-4 w-4" />
                {voice.status === "done" ? "Re-record" : "Start speaking"}
              </button>
            ) : voice.status === "listening" ? (
              <button
                onClick={voice.stop}
                className="flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground"
              >
                <Square className="h-3.5 w-3.5 fill-destructive text-destructive" />
                Stop
              </button>
            ) : (
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Interpreting…</p>
            )}
            {voice.usingDemo && voice.status !== "idle" && (
              <p className="text-center font-mono text-[10px] text-muted-foreground/70">
                Mic unavailable here — running a sample brief
              </p>
            )}
          </div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setCommitted(null)
            }}
            rows={5}
            placeholder={sample}
            className="modal-input resize-none font-sans"
          />
        )}

        {/* transcript */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Transcript</p>
          <p className="min-h-[2.5rem] text-pretty text-[13px] leading-relaxed text-foreground">
            {liveBrief ? (
              <>&ldquo;{liveBrief}&rdquo;</>
            ) : (
              <span className="text-muted-foreground">Your brief will appear here as you speak or type.</span>
            )}
          </p>
        </div>
      </div>

      {/* ---- pipeline + proposed changes ---- */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Voice → Transcript → Intent → Specification
          </p>
          {extraction && (
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[10px]"
              style={{ backgroundColor: "color-mix(in oklch, var(--grow) 15%, transparent)", color: "var(--grow)" }}
            >
              {confidence}% confident
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
          {STAGE_ORDER.map((stage) => {
            const items = changesByStage(stage)
            const filled = items.length > 0
            return (
              <div
                key={stage}
                className={`flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  filled ? "bg-secondary/50" : ""
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] ${
                    filled ? "text-primary-foreground" : "text-muted-foreground"
                  }`}
                  style={{ backgroundColor: filled ? "var(--primary)" : "var(--muted)" }}
                >
                  {filled ? <Check className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                </span>
                <div className="flex-1">
                  <p
                    className={`font-mono text-[10px] uppercase tracking-wider ${
                      filled ? "text-foreground" : "text-muted-foreground/60"
                    }`}
                  >
                    {STAGE_LABEL[stage]}
                  </p>
                  {filled && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {items.map((c) => (
                        <span
                          key={c.id}
                          className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-foreground"
                        >
                          {c.value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* apply / edit / discard */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => extraction && onApply(extraction)}
            disabled={!extraction || !resolved}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity enabled:hover:opacity-90 disabled:opacity-40"
          >
            <Check className="h-4 w-4" />
            Apply changes
          </button>
          <button
            onClick={() => {
              setMode("text")
              setText(liveBrief)
              setCommitted(null)
              voice.reset()
            }}
            disabled={!liveBrief}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors enabled:hover:border-foreground/25 disabled:opacity-40"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            onClick={() => {
              setText("")
              setCommitted(null)
              voice.reset()
            }}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Discard
          </button>
          <button
            onClick={onSkip}
            className="ml-auto text-[12px] font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Skip — configure manually
          </button>
        </div>
      </div>
    </div>
  )
}
