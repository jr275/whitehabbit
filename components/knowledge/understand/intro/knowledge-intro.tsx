"use client"

/* ================================================================== *
 * INTRO — the thesis, stated before any data.
 *
 * The whole product argument has to land here: a number is not
 * understanding. So the count is set LARGE and then immediately
 * undercut by the line beneath it, and what Keeply found is set in the
 * same weight as the count — visually claiming equal standing with it.
 * ================================================================== */

import type { KnowledgeOverview } from "@/lib/knowledge/understand/types"
import { useCountUp, useReveal } from "@/lib/knowledge/understand/use-reveal"
import { Reveal } from "../shell/section"

export function KnowledgeIntro({ overview, onExplore }: { overview: KnowledgeOverview; onExplore: () => void }) {
  const { ref, revealed } = useReveal<HTMLDivElement>({ threshold: 0.05 })
  const saved = useCountUp(overview.savedCount, revealed, 1100)

  const since = new Date(overview.since).toLocaleDateString(undefined, { month: "long", year: "numeric" })

  return (
    <section id="intro" aria-labelledby="intro-title" className="relative">
      <div
        ref={ref}
        className="mx-auto w-full max-w-[var(--kp-page)] px-[var(--kp-gutter)] pb-[clamp(4rem,9vw,8rem)] pt-[clamp(4rem,11vw,9rem)]"
      >
        <Reveal>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--kp-accent)]">
            Your knowledge
          </p>
        </Reveal>

        <Reveal delay={80}>
          <h1
            id="intro-title"
            className="mt-6 max-w-[16ch] text-balance font-[family-name:var(--font-fraunces)] text-[clamp(2.6rem,8vw,5.5rem)] font-medium leading-[0.98] tracking-[-0.03em]"
          >
            You saved{" "}
            <span className="kp-tnum tabular-nums text-[var(--kp-accent)]">{saved.toLocaleString()}</span> things.
          </h1>
        </Reveal>

        <Reveal delay={150}>
          <p className="mt-7 max-w-[42ch] text-[clamp(1.15rem,2vw,1.5rem)] leading-[1.45] tracking-[-0.01em] text-[var(--kp-ink-soft)]">
            But your library is more interesting than a number.
          </p>
        </Reveal>

        <Reveal delay={220}>
          <p className="mt-10 max-w-[46ch] text-[clamp(1.15rem,2vw,1.5rem)] leading-[1.45] tracking-[-0.01em]">
            Keeply found{" "}
            <strong className="font-medium text-[var(--kp-accent)]">{overview.conceptCount} concepts</strong> hiding
            across it, clustered into{" "}
            <strong className="font-medium text-[var(--kp-accent)]">{overview.themeCount} themes</strong>, circling{" "}
            <strong className="font-medium text-[var(--kp-accent)]">{overview.questionCount} questions</strong> you
            haven&rsquo;t answered yet.
          </p>
        </Reveal>

        <Reveal delay={300}>
          <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
            <button
              type="button"
              onClick={onExplore}
              className="group inline-flex items-center gap-3 rounded-full bg-[var(--kp-ink)] px-6 py-3 text-[14px] font-medium text-[var(--kp-paper)] transition-colors duration-[var(--kp-fast)] hover:bg-[var(--kp-accent)]"
            >
              Explore your knowledge
              <span aria-hidden className="transition-transform duration-[var(--kp-fast)] group-hover:translate-y-0.5">
                ↓
              </span>
            </button>
            <p className="text-[13px] text-[var(--kp-ink-faint)]">
              Collected since {since}
            </p>
          </div>
        </Reveal>

        {overview.origin === "demo" && (
          <Reveal delay={360}>
            <p className="mt-14 max-w-[52ch] border-l-2 border-[var(--kp-rule-strong)] pl-4 text-[12.5px] leading-relaxed text-[var(--kp-ink-faint)]">
              This page is a design prototype. Every figure below comes from a fixed sample library, not from your
              account — it shows how Keeply would present a real one.
            </p>
          </Reveal>
        )}
      </div>
    </section>
  )
}
