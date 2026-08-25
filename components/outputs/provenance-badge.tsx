/* ------------------------------------------------------------------ *
 * Provenance badge — the one visual vocabulary for "is this real?"
 * across the Outputs Hub (section 3: REAL/DEMO/SIMULATED/NOT
 * CONNECTED). Demo is always visually distinct from real — never the
 * same color, never silently upgraded to look like a production
 * result.
 * ------------------------------------------------------------------ */

import { FlaskConical, Plug, Sparkles } from "lucide-react"
import type { ProvenanceState } from "@/lib/workforce/selectors"

const META: Record<ProvenanceState, { label: string; cls: string; icon?: typeof FlaskConical }> = {
  real: { label: "Real", cls: "border-grow/30 bg-grow/10 text-grow" },
  demo: { label: "Demo data", cls: "border-warn/30 bg-warn/10 text-warn", icon: FlaskConical },
  not_connected: { label: "Not connected", cls: "border-border bg-secondary/50 text-muted-foreground", icon: Plug },
}

export function ProvenanceBadge({ state, className = "" }: { state: ProvenanceState; className?: string }) {
  const m = META[state]
  const Icon = m.icon
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${m.cls} ${className}`}>
      {Icon && <Icon className="h-2.5 w-2.5" />}
      {m.label}
    </span>
  )
}

/** Simulated is a distinct third state from Demo — a value that isn't
 * even backed by a development execution, e.g. a static product-page
 * illustration. Not used by real ledger data today, but kept as a
 * first-class state so nothing in this UI is ever tempted to relabel
 * a simulated number as "demo" or "real" to avoid adding a new badge. */
export function SimulatedBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary ${className}`}>
      <Sparkles className="h-2.5 w-2.5" />
      Simulated
    </span>
  )
}
