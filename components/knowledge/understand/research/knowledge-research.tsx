"use client"

/* ================================================================== *
 * RESEARCH — where the page turns outward.
 *
 * Ask reads the library. Research leaves it. That transition is the
 * emotional beat of this section, so the result is deliberately split
 * into YOUR KNOWLEDGE / WEB RESEARCH / WHAT CHANGED rather than merged
 * into one answer — the delta between the two columns is the entire
 * reason to run it.
 *
 * The stage list is rendered from RESEARCH_STAGES, so the visual state
 * machine and the type cannot drift apart. No pipeline is implemented
 * here; this renders states a real one would produce.
 * ================================================================== */

import type { ResearchController } from "@/lib/knowledge/understand/hooks"
import { RESEARCH_STAGES, type ResearchStage } from "@/lib/knowledge/understand/types"
import { cn } from "@/lib/utils"
import { Label } from "../shell/section"

const STAGE_LABEL: Record<ResearchStage, string> = {
  understanding: "Understanding your question",
  searching: "Searching the web",
  analyzing: "Analyzing sources",
  comparing: "Comparing with your knowledge",
}

export function KnowledgeResearch({ research }: { research: ResearchController }) {
  const running = research.status === "running"

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          research.start()
        }}
        className="border-y border-[var(--kp-rule-strong)] py-2"
      >
        <label htmlFor="kp-research" className="sr-only">
          What would you like to understand?
        </label>
        <div className="flex items-center gap-4">
          <input
            id="kp-research"
            value={research.objective}
            onChange={(e) => research.setObjective(e.target.value)}
            placeholder="What would you like to understand?"
            autoComplete="off"
            disabled={running}
            className="min-w-0 flex-1 bg-transparent py-3 font-[family-name:var(--font-fraunces)] text-[clamp(1.1rem,2.4vw,1.6rem)] leading-snug tracking-[-0.02em] placeholder:text-[var(--kp-ink-faint)] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!research.objective.trim() || running}
            className="shrink-0 rounded-full bg-[var(--kp-ink)] px-5 py-2.5 text-[13px] font-medium text-[var(--kp-paper)] transition-colors duration-[var(--kp-fast)] hover:bg-[var(--kp-accent)] disabled:opacity-30"
          >
            {running ? "Researching" : "Research"}
          </button>
        </div>
      </form>

      {research.status === "idle" && (
        <div className="mt-6">
          <Label>Or start from a gap in your library</Label>
          <ul className="mt-3 flex flex-wrap gap-2">
            {research.suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => research.start(s)}
                  className="rounded-full border border-[var(--kp-rule)] px-3.5 py-1.5 text-[13px] text-[var(--kp-ink-soft)] transition-colors duration-[var(--kp-fast)] hover:border-[var(--kp-accent)] hover:text-[var(--kp-accent)]"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- progress ---- */}
      {running && (
        <ol className="mt-10 space-y-0" aria-live="polite">
          {RESEARCH_STAGES.map((stage) => {
            const done = research.completed.includes(stage)
            const current = research.stage === stage
            return (
              <li
                key={stage}
                className={cn(
                  "flex items-center gap-4 border-b border-[var(--kp-rule)] py-3.5 transition-opacity duration-[var(--kp-fast)]",
                  !done && !current && "opacity-35",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                    done ? "bg-[var(--kp-accent)]" : current ? "bg-[var(--kp-ink)]" : "bg-[var(--kp-rule-strong)]",
                  )}
                />
                <span className={cn("text-[15px]", current && "font-medium")}>{STAGE_LABEL[stage]}</span>
                {done && (
                  <span aria-hidden className="ml-auto text-[13px] text-[var(--kp-accent)]">
                    ✓
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {/* ---- result ---- */}
      {research.status === "complete" && research.finding && (
        <div className="mt-10">
          <p className="text-[13px] text-[var(--kp-ink-faint)]">
            Researched: <span className="text-[var(--kp-ink)]">{research.objective}</span>
          </p>

          <div className="mt-7 grid gap-px bg-[var(--kp-rule-strong)] sm:grid-cols-2">
            <div className="bg-[var(--kp-paper)] p-6">
              <Label>Your knowledge</Label>
              <p className="kp-tnum mt-3 font-[family-name:var(--font-fraunces)] text-[clamp(2rem,4vw,2.75rem)] font-medium leading-none">
                {research.finding.existingSourceCount}
              </p>
              <p className="mt-1.5 text-[13px] text-[var(--kp-ink-faint)]">sources you had already saved</p>
              <p className="mt-4 max-w-[38ch] text-[14.5px] leading-[1.6] text-[var(--kp-ink-soft)]">
                {research.finding.existingSummary}
              </p>
            </div>
            <div className="bg-[var(--kp-paper)] p-6">
              <Label>Web research</Label>
              <p className="kp-tnum mt-3 font-[family-name:var(--font-fraunces)] text-[clamp(2rem,4vw,2.75rem)] font-medium leading-none text-[var(--kp-accent)]">
                {research.finding.webSourceCount}
              </p>
              <p className="mt-1.5 text-[13px] text-[var(--kp-ink-faint)]">new sources analyzed</p>
              <p className="mt-4 max-w-[38ch] text-[14.5px] leading-[1.6] text-[var(--kp-ink-soft)]">
                {research.finding.webSummary}
              </p>
            </div>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <Label>What changed</Label>
              <ul className="mt-4 space-y-4">
                {research.finding.whatChanged.map((line) => (
                  <li key={line} className="flex items-baseline gap-3">
                    <span aria-hidden className="mt-0.5 shrink-0 text-[var(--kp-accent)]">
                      +
                    </span>
                    <span className="max-w-[52ch] text-[15.5px] leading-[1.6]">{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <Label>Sources</Label>
              <ul className="mt-4 divide-y divide-[var(--kp-rule)] border-y border-[var(--kp-rule)]">
                {research.finding.sources.map((s) => (
                  <li key={s.title} className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] leading-snug">{s.title}</span>
                      <span className="block text-[12px] text-[var(--kp-ink-faint)]">{s.domain}</span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em]",
                        s.isNew
                          ? "bg-[var(--kp-accent-soft)] text-[var(--kp-accent)]"
                          : "bg-[var(--kp-wash)] text-[var(--kp-ink-faint)]",
                      )}
                    >
                      {s.isNew ? "New" : "In library"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <button
            type="button"
            onClick={research.reset}
            className="mt-10 text-[13px] text-[var(--kp-ink-faint)] underline-offset-4 hover:text-[var(--kp-ink)] hover:underline"
          >
            Research something else
          </button>
        </div>
      )}
    </div>
  )
}
