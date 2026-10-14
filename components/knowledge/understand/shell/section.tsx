"use client"

/* ================================================================== *
 * SECTION PRIMITIVES — the page's typographic system, in three parts.
 *
 * These exist so that no section styles itself. Every heading, rule
 * and measure on this page comes from here, which is the only way a
 * twelve-section narrative reads as one document instead of twelve
 * pages that happen to be stacked.
 * ================================================================== */

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useReveal } from "@/lib/knowledge/understand/use-reveal"

export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode
  className?: string
  delay?: number
  as?: "div" | "li" | "section" | "article" | "p" | "span"
}) {
  const { ref, revealed } = useReveal<HTMLDivElement>()
  return (
    <Tag
      ref={ref as never}
      data-reveal={revealed ? "in" : "out"}
      style={{ ["--kp-delay" as string]: `${delay}ms` }}
      className={className}
    >
      {children}
    </Tag>
  )
}

/** A numbered chapter of the narrative. The number is real structure —
 *  this page IS a sequence — so it is exposed to assistive tech as part
 *  of the heading rather than hidden as decoration. */
export function Chapter({
  id,
  index,
  eyebrow,
  title,
  lede,
  children,
  className,
  bleed = false,
}: {
  id: string
  index: number
  eyebrow: string
  title: ReactNode
  lede?: ReactNode
  children: ReactNode
  className?: string
  /** Full-width content (graph, timeline) escapes the reading measure. */
  bleed?: boolean
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("border-t border-[var(--kp-rule)] py-[clamp(3rem,5.5vw,5rem)]", className)}
    >
      <div className="mx-auto w-full max-w-[var(--kp-page)] px-[var(--kp-gutter)]">
        <Reveal>
          <div className="flex items-baseline gap-4">
            <span
              aria-hidden
              className="kp-tnum text-[11px] font-medium tracking-[0.18em] text-[var(--kp-ink-faint)]"
            >
              {String(index).padStart(2, "0")}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--kp-accent)]">
              {eyebrow}
            </span>
          </div>
        </Reveal>

        <Reveal delay={60}>
          <h2
            id={`${id}-title`}
            className="mt-5 max-w-[18ch] text-balance font-[family-name:var(--font-fraunces)] text-[clamp(1.9rem,4.4vw,3.1rem)] font-medium leading-[1.06] tracking-[-0.02em]"
          >
            {title}
          </h2>
        </Reveal>

        {lede && (
          <Reveal delay={110}>
            <p className="mt-5 max-w-[52ch] text-[clamp(1rem,1.4vw,1.125rem)] leading-[1.6] text-[var(--kp-ink-soft)]">
              {lede}
            </p>
          </Reveal>
        )}

        <div className={cn("mt-[clamp(2rem,3.5vw,3rem)]", !bleed && "max-w-[var(--kp-page)]")}>{children}</div>
      </div>
    </section>
  )
}

/** A small caps label used above dense content. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--kp-ink-faint)]", className)}>
      {children}
    </span>
  )
}

/** The page's only button shape, in two weights. */
export function Action({
  children,
  onClick,
  variant = "quiet",
  className,
  ariaLabel,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "quiet" | "solid"
  className?: string
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "group inline-flex items-center gap-2 rounded-full text-[13px] font-medium transition-colors duration-[var(--kp-fast)]",
        variant === "solid"
          ? "bg-[var(--kp-ink)] px-5 py-2.5 text-[var(--kp-paper)] hover:bg-[var(--kp-accent)]"
          : "px-0 py-1 text-[var(--kp-accent)] hover:text-[var(--kp-ink)]",
        className,
      )}
    >
      {children}
      <span
        aria-hidden
        className="transition-transform duration-[var(--kp-fast)] group-hover:translate-x-0.5"
      >
        →
      </span>
    </button>
  )
}
