"use client"

import { useEffect, useRef } from "react"
import { ArrowUp, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface AiComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  loading?: boolean
  /** "hero" is the large centered idle composer; "compact" sits above an answer. */
  size?: "hero" | "compact"
  autoFocus?: boolean
}

/**
 * The research input. Deliberately a multiline composer, not a chat box:
 * Enter submits, Shift+Enter adds a newline, and a quiet line makes it
 * explicit that answers are grounded in the user's own saved knowledge.
 */
export function AiComposer({ value, onChange, onSubmit, loading = false, size = "hero", autoFocus = false }: AiComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const hero = size === "hero"
  const canSubmit = value.trim().length > 0 && !loading

  // Auto-grow to fit content without becoming a runaway text wall.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, hero ? 220 : 160)}px`
  }, [value, hero])

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return
    // Don't submit while a CJK IME is composing (Safari reports keyCode 229).
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    if (canSubmit) onSubmit()
  }

  return (
    <div
      className={cn(
        "group rounded-2xl border border-[var(--kn-edge)] bg-card shadow-sm transition-colors",
        "focus-within:border-[var(--kn-ai)]/60 focus-within:shadow-[0_0_0_4px_var(--kn-ai)]/10",
        hero ? "p-4 sm:p-5" : "p-3 sm:p-3.5",
      )}
    >
      <label htmlFor="kn-ai-composer" className="sr-only">
        Ask a question about your saved knowledge
      </label>
      <textarea
        id="kn-ai-composer"
        ref={ref}
        rows={hero ? 2 : 1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={loading}
        placeholder="Ask anything about your saved knowledge…"
        aria-label="Ask a question about your saved knowledge"
        className={cn(
          "w-full resize-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60",
          hero ? "text-lg leading-relaxed" : "text-base leading-relaxed",
        )}
      />

      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          <Sparkles className="size-3.5 text-[var(--kn-ai)]" />
          Grounded in your knowledge
        </span>

        <div className="flex items-center gap-2.5">
          <kbd className="hidden rounded-md border border-[var(--kn-edge)] bg-secondary/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            {"⏎"}
          </kbd>
          <button
            type="button"
            onClick={() => canSubmit && onSubmit()}
            disabled={!canSubmit}
            aria-label={loading ? "Searching your knowledge" : "Ask"}
            className={cn(
              "flex size-9 items-center justify-center rounded-xl transition-colors",
              canSubmit
                ? "bg-[var(--kn-ai)] text-primary-foreground hover:opacity-90"
                : "bg-secondary text-muted-foreground",
            )}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    </div>
  )
}
