"use client"

import { useEffect, useRef } from "react"
import { ArrowUp, Library, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface AiComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  loading?: boolean
  /** "hero" is the large centered idle instrument; "compact" sits above a result. */
  size?: "hero" | "compact"
  autoFocus?: boolean
  /** Real count of the user's saved sources, from the library check. Shown
   *  only when a number is provided — never invented. */
  scopeCount?: number | null
}

/**
 * The research instrument. Deliberately a multiline composer, not a chat
 * box: Enter submits, Shift+Enter adds a newline, and a quiet scope line
 * makes it explicit that every answer is grounded in the user's own saved
 * knowledge — the query never leaves their library.
 */
export function AiComposer({
  value,
  onChange,
  onSubmit,
  loading = false,
  size = "hero",
  autoFocus = false,
  scopeCount = null,
}: AiComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const hero = size === "hero"
  const canSubmit = value.trim().length > 0 && !loading

  // Auto-grow to fit content without becoming a runaway text wall.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, hero ? 240 : 160)}px`
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
        "group rounded-2xl border transition-all duration-200",
        "border-[var(--kn-edge)] bg-[var(--kn-paper)]",
        "focus-within:border-[var(--kn-ai)]/70 focus-within:shadow-[0_0_0_4px_var(--kn-ai)]/12",
        hero ? "px-5 pt-5 pb-3.5 sm:px-6 sm:pt-6 sm:pb-4" : "px-3.5 pt-3.5 pb-2.5",
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
        placeholder="What do you want to understand?"
        aria-label="Ask a question about your saved knowledge"
        className={cn(
          "w-full resize-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-60",
          hero ? "text-xl leading-[1.55] tracking-tight" : "text-base leading-relaxed",
        )}
      />

      <div className={cn("flex items-center justify-between gap-3", hero ? "mt-3" : "mt-2")}>
        <span className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-muted-foreground">
          <Library className="size-3.5 shrink-0 text-[var(--kn-ai)]" />
          <span className="truncate">
            Your knowledge
            {typeof scopeCount === "number" && scopeCount > 0 ? (
              <span className="text-muted-foreground/60">
                {" · "}
                {scopeCount.toLocaleString()} saved {scopeCount === 1 ? "source" : "sources"}
              </span>
            ) : null}
          </span>
        </span>

        <div className="flex shrink-0 items-center gap-2.5">
          <kbd className="hidden rounded-md border border-[var(--kn-edge)] bg-secondary/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            {hero ? "⏎ to ask" : "⏎"}
          </kbd>
          <button
            type="button"
            onClick={() => canSubmit && onSubmit()}
            disabled={!canSubmit}
            aria-label={loading ? "Searching your knowledge" : "Ask"}
            className={cn(
              "flex items-center justify-center rounded-xl transition-colors",
              hero ? "size-10" : "size-9",
              canSubmit
                ? "bg-[var(--kn-ai)] text-primary-foreground hover:opacity-90"
                : "bg-secondary text-muted-foreground",
            )}
          >
            {loading ? (
              <Loader2 className={cn("animate-spin", hero ? "size-[18px]" : "size-4")} />
            ) : (
              <ArrowUp className={cn(hero ? "size-[18px]" : "size-4")} strokeWidth={2.5} />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
