"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Mic, Square, Type, X, ArrowRight, Sparkles } from "lucide-react"
import { Waveform } from "./waveform"
import { useVoiceBrief } from "@/lib/library/use-voice-brief"
import { extractIntent, extractionConfidence } from "@/lib/library/intent"
import { PREFABS, getPrefab } from "@/lib/library/prefabs"
import { CATEGORY_META } from "@/lib/library/spec-model"

const SAMPLE =
  "Create me a finance worker. I want it to monitor cash flow, find anomalies in accounts payable, identify opportunities to negotiate supplier discounts, and never make payments without my approval."

type Mode = "voice" | "text"

/* ------------------------------------------------------------------ *
 * Create launcher — brief WhiteHabbit like a senior employee, by
 * voice or text. It identifies the right professional build and hands
 * off to last-mile configuration. It never creates silently: the user
 * always confirms the identified worker first.
 * ------------------------------------------------------------------ */
export function CreateLauncher({ initialMode, onClose }: { initialMode: Mode; onClose: () => void }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [text, setText] = useState("")
  const [resolved, setResolved] = useState<string | null>(null)

  const resolve = (brief: string) => {
    const e = extractIntent(brief)
    const prefab =
      (e.category && PREFABS.find((p) => p.category === e.category)) || getPrefab("maky")!
    setResolved(brief.trim())
    // stash the brief so the config page runs the full transformation
    try {
      sessionStorage.setItem(`wh.brief.${prefab.id}`, brief.trim())
    } catch {}
    return prefab
  }

  const voice = useVoiceBrief({
    sampleBrief: SAMPLE,
    onComplete: (t) => resolve(t),
  })

  const activeBrief = mode === "voice" ? voice.transcript : text
  const preview = resolved ? extractIntent(resolved) : activeBrief ? extractIntent(activeBrief) : null
  const matchedPrefab =
    preview?.category ? PREFABS.find((p) => p.category === preview.category) ?? null : null

  const proceed = () => {
    const brief = resolved ?? text
    if (!brief.trim()) return
    const prefab = resolve(brief)
    router.push(`/library/${prefab.id}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-mono text-sm font-semibold tracking-tight text-foreground">
              Brief your worker
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* mode toggle */}
        <div className="flex gap-1 px-5 pt-4">
          {(["voice", "text"] as Mode[]).map((m) => (
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

        <div className="flex flex-col gap-4 p-5">
          <p className="text-pretty text-[13px] leading-relaxed text-muted-foreground">
            {mode === "voice"
              ? "Press the mic and speak naturally — describe the role, focus, and any approvals it must respect."
              : "Describe the worker you need in plain language, like you're briefing a new hire."}
          </p>

          {mode === "voice" ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-secondary/40 p-6">
              <div className="h-16 w-full max-w-sm">
                <Waveform amplitudes={voice.amplitudes} active={voice.status === "listening"} />
              </div>
              {voice.status === "idle" ? (
                <button
                  onClick={voice.start}
                  className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Mic className="h-4 w-4" />
                  Start speaking
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
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {voice.status === "processing" ? "Interpreting…" : "Captured"}
                </p>
              )}
              {voice.usingDemo && voice.status !== "idle" && (
                <p className="text-center font-mono text-[10px] text-muted-foreground/70">
                  Mic unavailable here — running a sample brief
                </p>
              )}
              {voice.transcript && (
                <p className="text-pretty text-center text-[13px] leading-relaxed text-foreground">
                  &ldquo;{voice.transcript}&rdquo;
                </p>
              )}
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={SAMPLE}
              className="modal-input resize-none font-sans"
            />
          )}

          {/* identified worker */}
          {matchedPrefab && (activeBrief || resolved) && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-lg font-mono text-xs font-semibold"
                style={{ backgroundColor: `color-mix(in oklch, ${matchedPrefab.accent} 20%, transparent)`, color: matchedPrefab.accent }}
              >
                {matchedPrefab.codename.slice(0, 2)}
              </span>
              <div className="flex-1">
                <p className="text-[13px] font-medium text-foreground">
                  Best match: {matchedPrefab.codename} · {CATEGORY_META[matchedPrefab.category].label}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {matchedPrefab.role} · {preview ? extractionConfidence(preview) : 0}% confident
                </p>
              </div>
            </div>
          )}

          <button
            onClick={proceed}
            disabled={!(activeBrief || resolved)}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity enabled:hover:opacity-90 disabled:opacity-40"
          >
            Continue to configuration
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
