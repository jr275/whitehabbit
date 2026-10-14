"use client"

/* ================================================================== *
 * INTRO — the thesis, stated before any data.
 *
 * The argument is unchanged: a number is not understanding. The count
 * is set LARGE and then immediately undercut by the line beneath it.
 *
 * ---- WHY THIS IS A GRID AND NOT A COLUMN -------------------------
 *
 * It used to be one left-ragged column: an h1 capped at 16ch, two
 * ledes at 42ch and 46ch, and a button, stacked down the left edge of
 * a 1280px measure. On any desktop the right third of the first screen
 * was permanently empty, and the two ledes — same size, same weight,
 * 40px apart — read as two unrelated statements rather than one
 * thought with a qualifier.
 *
 * So the claim and what qualifies it now sit side by side. The left
 * column argues; the right column carries the page's PROVENANCE — when
 * the library started, and, for the sample library, the fact that it
 * is one.
 *
 * The right column deliberately does NOT restate the counts. The first
 * draft of this layout did, and the result was 428 and 37 appearing
 * twice within one screen: once here and again in Signals, which is
 * the section whose entire job is those figures. A number repeated two
 * hundred pixels from itself does not read as emphasis, it reads as a
 * layout that had a column to fill.
 *
 * When there is nothing to put there — a live library with no recorded
 * start date — the aside is not rendered and the claim takes the full
 * measure, rather than sitting beside an empty column.
 *
 * Below `lg` it collapses back to the original single column, in the
 * same order, which is the layout that was already correct there.
 * ================================================================== */

import type { KnowledgeOverview } from "@/lib/knowledge/understand/types"
import { useCountUp, useReveal } from "@/lib/knowledge/understand/use-reveal"
import { Reveal } from "../shell/section"
import { useLocale, useT } from "../../i18n"

export function KnowledgeIntro({ overview, onExplore }: { overview: KnowledgeOverview; onExplore: () => void }) {
  const { locale, n } = useLocale()
  const t = useT()
  const { ref, revealed } = useReveal<HTMLDivElement>({ threshold: 0.05 })
  const saved = useCountUp(overview.savedCount, revealed, 1100)

  /* The figure is accented, so the sentence is SPLIT around it rather
   * than assembled from an English-shaped "You saved" + number +
   * "things." Each language writes its own clause order, and the
   * number is still one styled span. A translation that moved the
   * figure elsewhere, or dropped it, renders the sentence plainly
   * instead of breaking — never a half-sentence. */
  const figure = n(saved)
  const headline = t.understand.savedThings(figure)
  const figureAt = headline.indexOf(figure)

  const since =
    overview.since === null
      ? null
      : new Date(overview.since).toLocaleDateString(locale, { month: "long", year: "numeric" })

  // What Keeply can honestly say it found. Themes and open questions
  // are not derived from anything yet, so a live library names only the
  // measures that exist — the sentence gets shorter rather than
  // carrying a number nobody computed.
  const found: string[] = [
    t.understand.concepts_n(overview.conceptCount, n(overview.conceptCount)),
    ...(overview.themeCount !== null ? [t.understand.themes_n(overview.themeCount, n(overview.themeCount))] : []),
    ...(overview.questionCount !== null
      ? [t.understand.questions_n(overview.questionCount, n(overview.questionCount))]
      : []),
  ]

  return (
    <section id="intro" aria-labelledby="intro-title" className="relative">
      <div
        ref={ref}
        className="mx-auto w-full max-w-[var(--kp-page)] px-[var(--kp-gutter)] pb-[clamp(3.5rem,7vw,6rem)] pt-[clamp(3rem,7vw,5.5rem)]"
      >
        <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-[clamp(2rem,4vw,4rem)]">
          {/* ── the claim ─────────────────────────────────────────── */}
          <div className="lg:col-span-7 xl:col-span-8">
            <Reveal>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--kp-accent)]">
                {t.understand.yourKnowledgeEyebrow}
              </p>
            </Reveal>

            <Reveal delay={80}>
              <h1
                id="intro-title"
                className="mt-5 max-w-[16ch] text-balance font-[family-name:var(--font-fraunces)] text-[clamp(2.6rem,7vw,5rem)] font-medium leading-[0.98] tracking-[-0.03em]"
              >
                {figureAt < 0 ? (
                  headline
                ) : (
                  <>
                    {headline.slice(0, figureAt)}
                    <span className="kp-tnum tabular-nums text-[var(--kp-accent)]">{figure}</span>
                    {headline.slice(figureAt + figure.length)}
                  </>
                )}
              </h1>
            </Reveal>

            {/* The qualifier is subordinate to the headline, not a
             *  second statement of equal weight: it sits tight under
             *  it, one step down the type scale. */}
            <Reveal delay={150}>
              <p className="mt-5 max-w-[44ch] text-[clamp(1.1rem,1.8vw,1.4rem)] leading-[1.45] tracking-[-0.01em] text-[var(--kp-ink-soft)]">
                {t.understand.moreThanANumber}
              </p>
            </Reveal>

            <Reveal delay={220}>
              <p className="mt-7 max-w-[46ch] text-[clamp(1.05rem,1.6vw,1.25rem)] leading-[1.5]">
                {overview.savedCount === 0 ? (
                  <>{t.understand.introEmpty}</>
                ) : overview.conceptCount === 0 ? (
                  <>{t.understand.introPending}</>
                ) : overview.themeCount !== null && overview.questionCount !== null ? (
                  <>{t.understand.keeplyFound}<strong className="font-medium text-[var(--kp-accent)]">{found[0]}</strong> hiding
                    across it, clustered into{" "}
                    <strong className="font-medium text-[var(--kp-accent)]">{found[1]}</strong>, circling{" "}
                    <strong className="font-medium text-[var(--kp-accent)]">{found[2]}</strong> you haven&rsquo;t
                    answered yet.
                  </>
                ) : (
                  <>
                    Keeply found <strong className="font-medium text-[var(--kp-accent)]">{found[0]}</strong> hiding
                    across it.
                  </>
                )}
              </p>
            </Reveal>

            <Reveal delay={300}>
              <div className="mt-9">
                <button
                  type="button"
                  onClick={onExplore}
                  className="group inline-flex items-center gap-3 rounded-full bg-[var(--kp-ink)] px-6 py-3 text-[14px] font-medium text-[var(--kp-paper)] transition-colors duration-[var(--kp-fast)] hover:bg-[var(--kp-accent)]"
                >
                  {t.understand.explore}
                  <span
                    aria-hidden
                    className="transition-transform duration-[var(--kp-fast)] group-hover:translate-y-0.5"
                  >
                    ↓
                  </span>
                </button>
              </div>
            </Reveal>
          </div>

          {/* ── provenance ───────────────────────────────────────── *
           * Not a second scoreboard — see the note at the top of this
           * file. Only what the counts below cannot say about
           * themselves. */}
          {(since || overview.origin === "demo") && (
            <Reveal delay={360} className="mt-12 lg:col-span-5 lg:mt-3 xl:col-span-4">
              <aside className="border-l border-[var(--kp-rule-strong)] pl-6 lg:pl-8">
                {since && (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--kp-ink-faint)]">{t.understand.collectingSince}</p>
                    <p className="kp-tnum mt-2 text-[clamp(1.25rem,1.8vw,1.6rem)] font-medium leading-none tracking-[-0.02em]">
                      {since}
                    </p>
                  </>
                )}

                {overview.origin === "demo" && (
                  <p
                    className={
                      "max-w-[38ch] text-[12.5px] leading-relaxed text-[var(--kp-ink-faint)] " +
                      (since ? "mt-6 border-t border-[var(--kp-rule)] pt-5" : "")
                    }
                  >
                    {t.understand.demoNotice}
                  </p>
                )}
              </aside>
            </Reveal>
          )}

        </div>
      </div>
    </section>
  )
}
