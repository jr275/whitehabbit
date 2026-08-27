/* ================================================================== *
 * SKILL CARD — the first component built to the Cursor reference
 * (docs/ux-reference-analysis.md), on the reference's own tokens
 * (--ref-*, app/globals.css), deliberately not the surrounding dark
 * "control room" chrome. A real, working island of the approved
 * language, not a reskin of everything around it — see that same doc's
 * §7/§10 for why, and docs/ux-design-constitution.md §21 for the
 * contract this renders: what it does, what it needs, what it
 * produces, business value, confidence, risk, provenance, economic
 * state — all sourced from lib/workforce/selectors.ts's
 * buildSkillCardView(), never invented here.
 *
 * Responsive by container, not viewport: this card's real home
 * (components/studio/worker-canvas.tsx) constrains it to a narrow
 * column at desktop widths and a wide one on mobile (the parent grid
 * collapses to one column below `lg`) — the opposite of what a
 * viewport media query would assume. `@container` on the article and
 * `@sm:` on the Needs/Produces/Business Value grid respond to the
 * actual space available, not a guess about the device.
 * ================================================================== */

import type { ConfidenceLabel, SkillCardView } from "@/lib/workforce/selectors"
import { ECONOMIC_STATE_LABEL } from "@/lib/workforce/model"

const RISK_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" }
const PROVENANCE_LABEL: Record<string, string> = { real: "Real", connected: "Connected", demo: "Demo", simulated: "Simulated", not_connected: "Not connected" }

function riskToneClass(risk?: string): string {
  if (risk === "high" || risk === "critical") return "text-ref-critical"
  if (risk === "medium") return "text-ref-warn"
  return "text-ref-ink"
}

function confidenceToneClass(label: ConfidenceLabel): string {
  if (label === "High") return "text-ref-ink"
  if (label === "Moderate") return "text-ref-warn"
  if (label === "Low") return "text-ref-critical"
  return "text-ref-ink-muted"
}

export function SkillCard({
  skill,
  executing = false,
  onConfigure,
}: {
  skill: SkillCardView
  /** A real run is in progress for this exact skill right now — never
   * a generic "something is happening" pulse. */
  executing?: boolean
  onConfigure?: () => void
}) {
  const footnotes: { term: string; value: string; tone?: string }[] = [
    { term: "Confidence basis", value: skill.confidence.label, tone: confidenceToneClass(skill.confidence.label) },
    { term: "Risk", value: skill.riskLevel ? RISK_LABEL[skill.riskLevel] : "Not set", tone: riskToneClass(skill.riskLevel) },
  ]
  if (skill.provenance) footnotes.push({ term: "Provenance", value: PROVENANCE_LABEL[skill.provenance] })
  if (skill.economicState) footnotes.push({ term: "Economic state", value: ECONOMIC_STATE_LABEL[skill.economicState] })

  return (
    <article
      className={`@container rounded-[3px] border bg-ref-paper px-4 py-4 transition-colors @sm:px-5 @sm:py-5 ${
        executing ? "border-ref-accent" : "border-ref-hairline"
      }`}
    >
      <div className="flex flex-col gap-2 @sm:flex-row @sm:items-start @sm:justify-between">
        <h3 className="min-w-0 flex-1 text-balance font-sans text-[15px] font-semibold leading-snug text-ref-ink">{skill.name}</h3>
        <div className="flex shrink-0 items-center gap-2">
          {skill.status === "beta" && (
            <span className="rounded-[2px] border border-ref-accent/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ref-accent">
              Beta
            </span>
          )}
          {onConfigure && (
            <button
              type="button"
              onClick={onConfigure}
              className="rounded-[2px] border border-ref-hairline px-2.5 py-1 font-sans text-[11px] text-ref-ink-muted transition-colors outline-offset-2 hover:border-ref-ink/30 hover:text-ref-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ref-accent)]"
            >
              {skill.enabled ? "Configure" : "Enable"}
            </button>
          )}
        </div>
      </div>

      {executing && (
        <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ref-accent" role="status">
          Running now
        </p>
      )}

      {skill.description && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ref-ink-muted">{skill.description}</p>}

      <dl className="mt-4 grid grid-cols-1 gap-3 @sm:grid-cols-3">
        <div>
          <dt className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ref-ink-muted">Needs</dt>
          <dd className="mt-1 text-[12px] leading-snug text-ref-ink">{skill.needs.length ? skill.needs.join(", ") : "Nothing — no tool required"}</dd>
        </div>
        <div>
          <dt className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ref-ink-muted">Produces</dt>
          <dd className="mt-1 text-[12px] leading-snug text-ref-ink">{skill.produces}</dd>
        </div>
        <div>
          <dt className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ref-ink-muted">Business value</dt>
          <dd className="mt-1 text-[12px] leading-snug text-ref-ink">
            {skill.businessValue.length ? skill.businessValue.join(" · ") : "Not yet quantified"}
          </dd>
          {!skill.hasRealValue && skill.businessValue.length > 0 && (
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ref-ink-muted/70">Semantic — no run yet</p>
          )}
        </div>
      </dl>

      {/* Each term/value pair stacks (label above value) below @sm and
       * sits inline (reference-style "TERM value · TERM value") from
       * @sm up — a single long label/value pair ("Confidence basis" /
       * "Not yet evaluated") must never be forced onto one line in a
       * ~200px real column; that's what wrapped mid-word before this
       * fix. See docs/ux-reference-analysis.md's note that this exact
       * column width is this component's real narrow case, not a
       * hypothetical one. */}
      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-ref-hairline pt-3 @sm:items-center @sm:gap-x-3 @sm:gap-y-1">
        {footnotes.map((f, i) => (
          <div key={f.term} className="flex items-center gap-3">
            {i > 0 && <span aria-hidden className="hidden text-ref-hairline @sm:inline">·</span>}
            <div className="flex flex-col gap-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ref-ink-muted @sm:flex-row @sm:items-center @sm:gap-1">
              <dt>{f.term}</dt>
              <dd className={`normal-case tracking-normal ${f.tone ?? "text-ref-ink"}`}>{f.value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </article>
  )
}
