"use client"

import type { Fidelity } from "@/components/worker-fabric"

const MODES: { id: Fidelity; label: string; hint: string }[] = [
  { id: "ambient", label: "Ambient", hint: "Atmosphere only — the fabric breathes" },
  { id: "activity", label: "Activity", hint: "Real execution, visualized as it happens" },
  { id: "trace", label: "Trace", hint: "Precise — every mark maps to one event" },
]

export function FidelitySwitch({
  value,
  onChange,
}: {
  value: Fidelity
  onChange: (f: Fidelity) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Visual fidelity"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-card/70 p-1 backdrop-blur"
    >
      {MODES.map((m) => {
        const active = m.id === value
        return (
          <button
            key={m.id}
            role="radio"
            aria-checked={active}
            title={m.hint}
            onClick={() => onChange(m.id)}
            className={`rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
              active ? "bg-primary/20 text-foreground ring-1 ring-primary/40" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
