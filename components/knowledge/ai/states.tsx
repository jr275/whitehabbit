"use client"

import { useEffect, useState } from "react"
import { AlertCircle, ArrowRight, ArrowUpRight, Clock, Plug, RotateCw, SearchX, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

/* ── Loading ────────────────────────────────────────────────────────
 * The research process, made legible. Three honest phases describe what
 * the request is doing — searching, reading, synthesizing — as a small
 * progression, never fake answer text and never a paragraph skeleton that
 * implies a length the answer may not have. It occupies the Answer stage,
 * so the result structure holds steady as the answer arrives. */
const LOADING_PHASES = ["Searching your knowledge", "Reading relevant sources", "Synthesizing the answer"]

export function AiLoading() {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    // Advance through the phases; hold on the last until the answer lands.
    const timers = [
      setTimeout(() => setPhase(1), 1200),
      setTimeout(() => setPhase(2), 2600),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <ol className="flex flex-col gap-3.5 animate-in fade-in duration-300" aria-live="polite" role="status">
      {LOADING_PHASES.map((label, i) => {
        const state = i < phase ? "done" : i === phase ? "active" : "pending"
        return (
          <li key={label} className="flex items-center gap-3">
            <span className="relative flex size-3 items-center justify-center">
              {state === "active" ? (
                <>
                  <span className="absolute inline-flex size-3 animate-ping rounded-full bg-[var(--kn-ai)] opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex size-2 rounded-full bg-[var(--kn-ai)]" />
                </>
              ) : state === "done" ? (
                <span className="inline-flex size-2 rounded-full bg-[var(--kn-ai)]/45" />
              ) : (
                <span className="inline-flex size-2 rounded-full border border-muted-foreground/30" />
              )}
            </span>
            <span
              className={cn(
                "text-[15px] transition-colors",
                state === "active"
                  ? "font-medium text-foreground"
                  : state === "done"
                    ? "text-muted-foreground"
                    : "text-muted-foreground/45",
              )}
            >
              {label}
            </span>
          </li>
        )
      })}
    </ol>
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
          className="flex h-10 items-center gap-2 rounded-xl bg-[var(--kn-ai)] px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kn-paper)]"
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

/* ── Empty library ──────────────────────────────────────────────────
 * The true beginning of the product. It doesn't apologise for being
 * empty — it frames saving as step one of understanding. The action
 * reuses the real save flow (openSaveDialog); nothing here is faked. */
export function AiEmptyLibrary({ onSave }: { onSave: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] px-6 py-12 text-center animate-in fade-in duration-300">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--kn-ai)]/12 text-[var(--kn-ai)]">
        <Sparkles className="size-6" />
      </span>

      <div className="max-w-md space-y-2">
        <h2 className="text-pretty text-2xl font-medium tracking-tight text-foreground">Your knowledge starts here.</h2>
        <p className="text-pretty text-[15px] leading-relaxed text-muted-foreground">
          Save something you want to remember. Keeply will organize it, understand it, and make it searchable — so you
          can ask about it later.
        </p>
      </div>

      <ol className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <OnboardingStep n="1" label="Save" />
        <StepArrow />
        <OnboardingStep n="2" label="Understand" />
        <StepArrow />
        <OnboardingStep n="3" label="Ask" />
      </ol>

      <button
        type="button"
        onClick={onSave}
        className="flex h-10 items-center gap-2 rounded-xl bg-[var(--kn-ai)] px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kn-paper)]"
      >
        Save your first source <ArrowRight className="size-4" />
      </button>
    </div>
  )
}

function OnboardingStep({ n, label }: { n: string; label: string }) {
  return (
    <li className="flex items-center gap-2 rounded-xl border border-[var(--kn-edge)] bg-card/60 px-3 py-2">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--kn-ai)]/15 text-[11px] font-medium tabular-nums text-[var(--kn-ai)]">
        {n}
      </span>
      <span className="text-[13px] text-foreground/85">{label}</span>
    </li>
  )
}

function StepArrow() {
  return <ArrowRight className="mx-auto size-3.5 rotate-90 text-muted-foreground/40 sm:rotate-0" aria-hidden />
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
    <div className="mt-10 flex flex-col gap-9">
      {/* Examples — large editorial rows, not chat pills. Clicking one only
          fills the composer; it never fabricates an executed query. */}
      <div>
        <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
          Try asking
        </p>
        <ul className="flex flex-col">
          {examples.map((q, i) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => onPick(q)}
                className={cn(
                  "group flex w-full items-center justify-between gap-4 rounded-lg py-4 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--background)]",
                  i > 0 ? "border-t border-[var(--kn-edge)]" : "",
                )}
              >
                <span className="text-pretty text-[15px] leading-snug text-foreground/80 transition-colors group-hover:text-foreground">
                  {q}
                </span>
                <ArrowUpRight className="size-[18px] shrink-0 text-muted-foreground/35 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--kn-ai)]" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Recent — the user's own history, deliberately secondary and compact.
          Never invented; sourced from the view's localStorage. */}
      {recent.length > 0 ? (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
            <Clock className="size-3.5" /> Recent
          </p>
          <div className="flex flex-col">
            {recent.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onPick(q)}
                className="group flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-[13.5px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
              >
                <span className="min-w-0 flex-1 truncate">{q}</span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-[var(--kn-ai)]" />
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
