"use client"

import { useEffect, useState } from "react"
import { AlertCircle, ArrowRight, Clock, Plug, RotateCw, SearchX, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

/* ── Loading ────────────────────────────────────────────────────────
 * A restrained, two-phase status — no theatrical "AI is thinking". The
 * phases are honest UI copy describing what the request is waiting on,
 * not claims about backend internals. */
export function AiLoading() {
  const phases = ["Searching your knowledge…", "Reading the most relevant sources…"]
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setPhase(1), 1400)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="animate-in fade-in duration-300" aria-live="polite" role="status">
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--kn-ai)] opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-[var(--kn-ai)]" />
        </span>
        {phases[phase]}
      </div>
      <div className="mt-6 space-y-3" aria-hidden>
        {[92, 100, 78].map((w, i) => (
          <div
            key={i}
            className="kn-shimmer h-3.5 rounded-full bg-[var(--kn-well)]"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    </div>
  )
}

/* ── No results ─────────────────────────────────────────────────────*/
export function AiNoResults() {
  return (
    <StatePanel
      icon={SearchX}
      title="Nothing relevant was found in your saved knowledge."
      body="Try a broader question, or save more sources on this topic and ask again."
    />
  )
}

/* ── Insufficient evidence ──────────────────────────────────────────
 * Distinct from an error and from no-results: the engine ran but would
 * not ground an answer. We never manufacture one. */
export function AiInsufficient() {
  return (
    <StatePanel
      icon={AlertCircle}
      title="Not enough evidence in your saved knowledge."
      body="There wasn’t enough in what you’ve saved to answer this confidently. Any related sources are shown below."
    />
  )
}

/* ── Error ──────────────────────────────────────────────────────────*/
export function AiError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <StatePanel
      icon={AlertCircle}
      tone="destructive"
      title="Something went wrong while searching your knowledge."
      body={message}
      action={
        <button
          type="button"
          onClick={onRetry}
          className="flex h-10 items-center gap-2 rounded-xl bg-[var(--kn-ai)] px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <RotateCw className="size-4" /> Try again
        </button>
      }
    />
  )
}

/* ── Unavailable (backend not wired yet) ────────────────────────────
 * The honest state for HTTP 501/503. Calm, not alarming — the feature is
 * designed and ready, the intelligence layer just isn't connected yet. */
export function AiUnavailable({ message }: { message?: string }) {
  return (
    <StatePanel
      icon={Plug}
      title="Ask your knowledge isn’t connected yet."
      body={
        message ||
        "The retrieval engine that answers from your saved knowledge is being built. When it’s live, your questions will be answered here with citations to your own sources."
      }
    />
  )
}

/* ── Empty library ──────────────────────────────────────────────────*/
export function AiEmptyLibrary({ onSave }: { onSave: () => void }) {
  return (
    <StatePanel
      icon={Sparkles}
      title="Save something first."
      body="Ask your knowledge answers from what you’ve saved. Add a few articles, videos or notes and then come back to ask about them."
      action={
        <button
          type="button"
          onClick={onSave}
          className="flex h-10 items-center gap-2 rounded-xl bg-[var(--kn-ai)] px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Save your first source <ArrowRight className="size-4" />
        </button>
      }
    />
  )
}

/* ── Suggestions + recent (empty idle state) ───────────────────────
 * Examples are clearly static prompts — clicking one only populates the
 * composer, it never fabricates an executed query or an answer. Recent
 * questions come from the user's own submissions (see the view's
 * localStorage), never invented. */
export function AiSuggestions({
  examples,
  recent,
  onPick,
}: {
  examples: string[]
  recent: string[]
  onPick: (q: string) => void
}) {
  return (
    <div className="mt-8">
      <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">Try asking</p>
      <div className="flex flex-col gap-2">
        {examples.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="group flex items-center justify-between gap-3 rounded-xl border border-[var(--kn-edge)] bg-card/60 px-4 py-2.5 text-left text-sm text-foreground/85 transition-colors hover:border-[var(--kn-ai)]/40 hover:bg-card hover:text-foreground"
          >
            <span className="text-pretty">{q}</span>
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-[var(--kn-ai)]" />
          </button>
        ))}
      </div>

      {recent.length > 0 ? (
        <div className="mt-7">
          <p className="mb-3 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
            <Clock className="size-3.5" /> Recent
          </p>
          <div className="flex flex-wrap gap-2">
            {recent.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onPick(q)}
                className="max-w-full truncate rounded-full border border-[var(--kn-edge)] bg-secondary/40 px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-[var(--kn-ai)]/40 hover:text-foreground"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ── Shared panel shell ─────────────────────────────────────────────*/
function StatePanel({
  icon: Icon,
  title,
  body,
  action,
  tone = "default",
}: {
  icon: typeof AlertCircle
  title: string
  body?: string
  action?: React.ReactNode
  tone?: "default" | "destructive"
}) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] px-6 py-12 text-center animate-in fade-in duration-300">
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-2xl",
          tone === "destructive" ? "bg-destructive/12 text-destructive" : "bg-[var(--kn-ai)]/12 text-[var(--kn-ai)]",
        )}
      >
        <Icon className="size-6" />
      </span>
      <div className="max-w-md space-y-2">
        <h2 className="text-pretty text-lg font-medium tracking-tight text-foreground">{title}</h2>
        {body ? <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{body}</p> : null}
      </div>
      {action}
    </div>
  )
}
