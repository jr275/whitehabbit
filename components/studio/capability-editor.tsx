"use client"

/* ------------------------------------------------------------------ *
 * Capability editor — the core of Studio. Each capability is a
 * first-class, configurable object: enable it, see its health, version,
 * tools, and knowledge/memory footprint. This is the build-time twin of
 * the nodes in the live Fabric.
 * ------------------------------------------------------------------ */

import { useState } from "react"
import { CAPABILITY_CONFIG, CAPABILITY_DETAIL } from "@/lib/studio-data"
import { Meter, Tag } from "./primitives"

export function CapabilityEditor() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CAPABILITY_CONFIG.map((c) => [c.id, c.enabled])),
  )
  const [open, setOpen] = useState<string | null>(null)

  return (
    <ul className="flex flex-col divide-y divide-border">
      {CAPABILITY_CONFIG.map((c) => {
        const d = CAPABILITY_DETAIL[c.id]
        const on = enabled[c.id]
        const isOpen = open === c.id
        return (
          <li key={c.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-4">
              {/* toggle */}
              <button
                role="switch"
                aria-checked={on}
                aria-label={`Toggle ${c.name}`}
                onClick={() =>
                  setEnabled((p) => ({ ...p, [c.id]: !p[c.id] }))
                }
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  on ? "bg-primary" : "bg-secondary"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-card shadow-sm transition-all ${
                    on ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>

              {/* name + role */}
              <button
                onClick={() => setOpen(isOpen ? null : c.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[14px] font-medium ${
                        on ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {c.name}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      v{d.version}
                    </span>
                    {c.weak && <Tag tone="primary">Improve</Tag>}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {c.role}
                  </p>
                </div>

                {/* health */}
                <div className="hidden w-28 shrink-0 sm:block">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Health
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-foreground">
                      {d.health}
                    </span>
                  </div>
                  <div className="mt-1">
                    <Meter
                      value={d.health}
                      tone={c.weak ? "warn" : "grow"}
                    />
                  </div>
                </div>
              </button>
            </div>

            {/* expanded detail */}
            {isOpen && (
              <div className="ml-[3.25rem] mt-3 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-border bg-secondary/50 p-4 sm:grid-cols-4">
                <Detail label="Category" value={d.category} />
                <Detail label="Success rate" value={`${d.successRate}%`} />
                <Detail
                  label="Executions"
                  value={d.executions.toLocaleString()}
                />
                <Detail
                  label="Knowledge"
                  value={d.knowledgeSources.toLocaleString()}
                />
                <div className="col-span-2 sm:col-span-4">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Tools
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {d.tools.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[13px] tabular-nums text-foreground">
        {value}
      </div>
    </div>
  )
}
