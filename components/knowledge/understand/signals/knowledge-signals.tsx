"use client"

/* ================================================================== *
 * SIGNALS — four numbers, set as type rather than as cards.
 *
 * No boxes, no icons, no card chrome. Four measures separated by rules
 * and given real typographic scale, which is what makes them read as a
 * masthead rather than a KPI row. The descending order is meaningful:
 * things saved is raw input, questions are the most refined output, so
 * the row reads left-to-right as raw → understood.
 * ================================================================== */

import type { KnowledgeOverview } from "@/lib/knowledge/understand/types"
import { useCountUp, useReveal } from "@/lib/knowledge/understand/use-reveal"
import { Reveal } from "../shell/section"

interface Signal {
  value: number
  label: string
  note: string
}

function KnowledgeMetric({ signal, index, revealed }: { signal: Signal; index: number; revealed: boolean }) {
  const shown = useCountUp(signal.value, revealed, 800 + index * 120)
  return (
    <li
      data-reveal={revealed ? "in" : "out"}
      style={{ ["--kp-delay" as string]: `${index * 90}ms` }}
      className="border-t border-[var(--kp-rule-strong)] pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 sm:first:border-l-0 sm:first:pl-0"
    >
      <p className="kp-tnum font-[family-name:var(--font-fraunces)] text-[clamp(2.6rem,6vw,4.25rem)] font-medium leading-[0.95] tracking-[-0.03em]">
        {shown.toLocaleString()}
      </p>
      <p className="mt-2 text-[13px] font-medium">{signal.label}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--kp-ink-faint)]">{signal.note}</p>
    </li>
  )
}

export function KnowledgeSignals({ overview }: { overview: KnowledgeOverview }) {
  const { ref, revealed } = useReveal<HTMLDivElement>()

  const signals: Signal[] = [
    { value: overview.savedCount, label: "things saved", note: "articles, videos, PDFs and your own notes" },
    { value: overview.conceptCount, label: "concepts", note: "ideas that recur across more than one source" },
    { value: overview.themeCount, label: "themes", note: "concepts that cluster into a subject you follow" },
    { value: overview.questionCount, label: "open questions", note: "raised repeatedly, resolved nowhere" },
  ]

  return (
    <section
      id="signals"
      aria-labelledby="signals-title"
      className="border-t border-[var(--kp-rule)] py-[clamp(3rem,7vw,6rem)]"
    >
      <div ref={ref} className="mx-auto w-full max-w-[var(--kp-page)] px-[var(--kp-gutter)]">
        <Reveal>
          <h2 id="signals-title" className="sr-only">
            What Keeply found in your library
          </h2>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--kp-ink-faint)]">
            What&rsquo;s actually in there
          </p>
        </Reveal>

        <ul className="mt-9 grid grid-cols-1 gap-7 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          {signals.map((s, i) => (
            <KnowledgeMetric key={s.label} signal={s} index={i} revealed={revealed} />
          ))}
        </ul>
      </div>
    </section>
  )
}
