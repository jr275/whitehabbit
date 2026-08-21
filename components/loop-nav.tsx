"use client"

import { LOOP, type LoopId, WORKER } from "@/lib/worker"

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid h-7 w-7 place-items-center rounded-md bg-primary/15 ring-1 ring-primary/40">
        <span className="h-2.5 w-2.5 rounded-[3px] bg-primary shadow-[0_0_12px_2px] shadow-primary/60" />
      </div>
      <div className="leading-none">
        <div className="text-sm font-semibold tracking-tight">WhiteHabbit</div>
        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Raise workers
        </div>
      </div>
    </div>
  )
}

export function LoopNav({
  active,
  onSelect,
}: {
  active: LoopId
  onSelect: (id: LoopId) => void
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border/70 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-5">
        <Logo />
        <div className="hidden h-6 w-px bg-border lg:block" />
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{WORKER.name}</span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {WORKER.role} · LVL {WORKER.level}
          </span>
        </div>
      </div>

      {/* the eight-beat loop — the worker is never "done" */}
      <nav aria-label="Worker lifecycle" className="thin-scroll -mx-1 overflow-x-auto px-1">
        <ul className="flex items-center gap-1">
          {LOOP.map((step, i) => {
            const isActive = step.id === active
            return (
              <li key={step.id} className="flex items-center">
                <button
                  onClick={() => onSelect(step.id as LoopId)}
                  title={step.hint}
                  className={`rounded-md px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                    isActive
                      ? "bg-primary/15 text-foreground ring-1 ring-primary/40"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {step.label}
                </button>
                {i < LOOP.length - 1 && (
                  <span aria-hidden className="px-0.5 text-border">
                    ·
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </header>
  )
}
