"use client"

/* ================================================================== *
 * INSIGHTS — the section where Keeply speaks.
 *
 * This is the only place on the page with an inverted surface, and it
 * is spent deliberately: the whole product claim ("Keeply noticed
 * something") lives here, so it gets the page's one moment of contrast
 * rather than sharing it with five other components.
 *
 * Each insight KIND renders its own evidence, because the evidence is
 * the argument. A contradiction that does not show both claims side by
 * side is just a sentence saying there is one; a gap that does not
 * show the explored set beside the missing one is a recommendation
 * wearing a discovery's clothes.
 *
 * Two are visible at rest. The rest are behind a control — a page that
 * shows every observation at once teaches that none of them matter.
 * ================================================================== */

import { useState } from "react"
import type { KnowledgeInsight, KnowledgeTheme } from "@/lib/knowledge/understand/types"
import { useReveal } from "@/lib/knowledge/understand/use-reveal"
import { cn } from "@/lib/utils"
import { Action, Label } from "../shell/section"

const KIND_LABEL: Record<KnowledgeInsight["kind"], string> = {
  emerging_topic: "Emerging topic",
  recurring_theme: "Recurring theme",
  knowledge_gap: "Knowledge gap",
  contradiction: "Contradiction",
  new_connection: "New connection",
  changed_interest: "Changed interest",
}

function ContradictionDetail({ detail }: { detail: Extract<KnowledgeInsight["detail"], { kind: "contradiction" }> }) {
  return (
    <div className="mt-7 grid gap-px overflow-hidden rounded-sm bg-[color-mix(in_oklab,var(--kp-paper)_20%,transparent)] sm:grid-cols-[1fr_auto_1fr]">
      {[detail.claimA, detail.claimB].map((claim, i) => (
        <div key={claim.source} className="bg-[var(--kp-ink)] p-5 sm:p-6">
          <Label className="text-[color-mix(in_oklab,var(--kp-paper)_55%,transparent)]">
            Claim {i === 0 ? "A" : "B"}
          </Label>
          <p className="mt-2.5 font-[family-name:var(--font-fraunces)] text-[clamp(1rem,1.8vw,1.2rem)] leading-[1.4] text-[var(--kp-paper)]">
            {claim.statement}
          </p>
          <p className="mt-3 text-[12.5px] text-[color-mix(in_oklab,var(--kp-paper)_60%,transparent)]">
            {claim.source} · saved{" "}
            {new Date(claim.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </p>
        </div>
      ))}
      <div
        aria-hidden
        className="hidden items-center justify-center bg-[var(--kp-ink)] px-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--kp-accent)] sm:flex sm:[grid-column:2] sm:[grid-row:1]"
      >
        vs
      </div>
    </div>
  )
}

function GapDetail({ detail }: { detail: Extract<KnowledgeInsight["detail"], { kind: "knowledge_gap" }> }) {
  return (
    <div className="mt-7 grid gap-8 sm:grid-cols-2">
      <div>
        <Label className="text-[color-mix(in_oklab,var(--kp-paper)_55%,transparent)]">You&rsquo;ve explored</Label>
        <ul className="mt-3 space-y-1.5">
          {detail.explored.map((label) => (
            <li key={label} className="flex items-baseline gap-2.5 text-[15px] text-[var(--kp-paper)]">
              <span aria-hidden className="text-[var(--kp-accent)]">
                ✓
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <Label className="text-[color-mix(in_oklab,var(--kp-paper)_55%,transparent)]">
          But almost nothing about
        </Label>
        <ul className="mt-3 space-y-1.5">
          {detail.missing.map((label) => (
            <li
              key={label}
              className="flex items-baseline gap-2.5 text-[15px] text-[color-mix(in_oklab,var(--kp-paper)_60%,transparent)]"
            >
              <span aria-hidden className="text-[var(--kp-accent)]">
                ○
              </span>
              <span className="underline decoration-dotted decoration-[var(--kp-accent)] underline-offset-4">
                {label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function ChangedDetail({ detail }: { detail: Extract<KnowledgeInsight["detail"], { kind: "changed_interest" }> }) {
  return (
    <div className="mt-7 grid gap-8 sm:grid-cols-2">
      <div>
        <Label className="text-[color-mix(in_oklab,var(--kp-paper)_55%,transparent)]">
          Already in your {detail.sourceCount} sources
        </Label>
        <ul className="mt-3 space-y-1.5">
          {detail.alreadyKnown.map((label) => (
            <li
              key={label}
              className="flex items-baseline gap-2.5 text-[15px] text-[color-mix(in_oklab,var(--kp-paper)_62%,transparent)]"
            >
              <span aria-hidden>✓</span>
              {label}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <Label className="text-[var(--kp-accent)]">This one adds</Label>
        <ul className="mt-3 space-y-1.5">
          {detail.newlyAdded.map((label) => (
            <li key={label} className="flex items-baseline gap-2.5 text-[15px] font-medium text-[var(--kp-paper)]">
              <span aria-hidden className="text-[var(--kp-accent)]">
                +
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function InsightStory({
  insight,
  themes,
  onAction,
  featured,
}: {
  insight: KnowledgeInsight
  themes: KnowledgeTheme[]
  onAction: (insight: KnowledgeInsight) => void
  featured: boolean
}) {
  const themeById = new Map(themes.map((t) => [t.id, t]))
  return (
    <article
      className={cn(
        "bg-[var(--kp-ink)] p-6 text-[var(--kp-paper)] sm:p-9",
        featured && "sm:p-11",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Label className="text-[var(--kp-accent)]">{KIND_LABEL[insight.kind]}</Label>
        <span aria-hidden className="text-[color-mix(in_oklab,var(--kp-paper)_35%,transparent)]">
          ·
        </span>
        <span className="text-[12px] text-[color-mix(in_oklab,var(--kp-paper)_55%,transparent)]">
          {insight.themeIds.map((id) => themeById.get(id)?.label ?? id).join(", ")}
        </span>
      </div>

      <h3
        className={cn(
          "mt-4 max-w-[22ch] text-balance font-[family-name:var(--font-fraunces)] font-medium leading-[1.12] tracking-[-0.02em]",
          featured ? "text-[clamp(1.6rem,3.4vw,2.4rem)]" : "text-[clamp(1.3rem,2.4vw,1.7rem)]",
        )}
      >
        {insight.headline}
      </h3>

      <p className="mt-4 max-w-[54ch] text-[15px] leading-[1.6] text-[color-mix(in_oklab,var(--kp-paper)_74%,transparent)]">
        {insight.body}
      </p>

      {insight.detail.kind === "contradiction" && <ContradictionDetail detail={insight.detail} />}
      {insight.detail.kind === "knowledge_gap" && <GapDetail detail={insight.detail} />}
      {insight.detail.kind === "changed_interest" && <ChangedDetail detail={insight.detail} />}

      <Action className="mt-7 text-[var(--kp-accent)] hover:text-[var(--kp-paper)]" onClick={() => onAction(insight)}>
        {insight.callToAction}
      </Action>
    </article>
  )
}

export function KnowledgeInsights({
  insights,
  themes,
  onAction,
}: {
  insights: KnowledgeInsight[]
  themes: KnowledgeTheme[]
  onAction: (insight: KnowledgeInsight) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { ref, revealed } = useReveal<HTMLDivElement>()

  const visible = expanded ? insights : insights.slice(0, 2)
  const hidden = insights.length - 2

  return (
    <div ref={ref}>
      <div className="grid gap-px bg-[var(--kp-rule-strong)]">
        {visible.map((insight, i) => (
          <div
            key={insight.id}
            data-reveal={revealed ? "in" : "out"}
            style={{ ["--kp-delay" as string]: `${Math.min(i * 110, 440)}ms` }}
          >
            <InsightStory insight={insight} themes={themes} onAction={onAction} featured={i === 0} />
          </div>
        ))}
      </div>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-6 inline-flex items-center gap-2 text-[13px] font-medium text-[var(--kp-accent)] transition-colors hover:text-[var(--kp-ink)]"
        >
          {expanded ? "Show fewer observations" : `Keeply noticed ${hidden} more`}
          <span aria-hidden className={cn("transition-transform duration-[var(--kp-fast)]", expanded && "rotate-180")}>
            ↓
          </span>
        </button>
      )}
    </div>
  )
}
