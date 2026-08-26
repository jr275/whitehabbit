import type { ResultProvenance } from "@/lib/workforce/business-results"

const META: Record<ResultProvenance, { label: string; className: string }> = {
  real: { label: "REAL", className: "border-grow/30 bg-grow/10 text-grow" },
  connected: { label: "CONNECTED", className: "border-primary/30 bg-primary/10 text-primary" },
  demo: { label: "DEMO", className: "border-warn/30 bg-warn/10 text-warn" },
  simulated: { label: "SIMULATED", className: "border-warn/30 bg-warn/10 text-warn" },
  not_connected: { label: "NOT CONNECTED", className: "border-border bg-secondary text-muted-foreground" },
}

export function ProvenanceBadge({ provenance }: { provenance: ResultProvenance }) {
  const meta = META[provenance]
  return <span className={`inline-flex rounded-md border px-2 py-1 font-mono text-[9px] font-semibold tracking-[0.12em] ${meta.className}`}>{meta.label}</span>
}
