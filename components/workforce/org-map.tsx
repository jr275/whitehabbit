"use client"

/* ------------------------------------------------------------------ *
 * OrgMap — the signature living-org visualization. The division lead
 * sits at the center; specialists radiate around it on a ring. Edges
 * are the reporting lines. Each worker token pulses with its live
 * state (working / blocked / learning), so the whole org visibly
 * breathes as work flows through it. Click a token -> worker detail.
 * ------------------------------------------------------------------ */

import { useRouter } from "next/navigation"
import { useMemo } from "react"
import type { DemoWorker, WorkerState } from "@/lib/workforce-demo/model"

const STATE_RING: Record<WorkerState, string> = {
  idle: "var(--color-border)",
  working: "var(--color-primary)",
  blocked: "var(--color-warn)",
  learning: "var(--color-grow)",
}

/* viewBox is a fixed design space; SVG scales it responsively */
const W = 720
const H = 560
const CX = W / 2
const CY = H / 2
const RING = 200

export function OrgMap({
  lead,
  specialists,
  running,
}: {
  lead: DemoWorker | undefined
  specialists: DemoWorker[]
  running: string[]
}) {
  const router = useRouter()

  const placed = useMemo(() => {
    const n = specialists.length
    return specialists.map((w, i) => {
      // distribute around the ring, starting at the top
      const angle = -Math.PI / 2 + (i / n) * Math.PI * 2
      return {
        worker: w,
        x: CX + Math.cos(angle) * RING,
        y: CY + Math.sin(angle) * RING * 0.82,
      }
    })
  }, [specialists])

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full"
      role="img"
      aria-label="Division org map"
    >
      <defs>
        <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* reporting edges */}
      {placed.map(({ worker, x, y }) => {
        const active = running.includes(worker.id)
        return (
          <line
            key={`edge-${worker.id}`}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            stroke={active ? "var(--color-primary)" : "var(--color-border)"}
            strokeOpacity={active ? 0.7 : 0.35}
            strokeWidth={active ? 1.6 : 1}
          >
            {active && (
              <animate
                attributeName="stroke-opacity"
                values="0.7;0.25;0.7"
                dur="1.6s"
                repeatCount="indefinite"
              />
            )}
          </line>
        )
      })}

      {/* specialists */}
      {placed.map(({ worker, x, y }) => (
        <WorkerToken
          key={worker.id}
          worker={worker}
          x={x}
          y={y}
          r={34}
          running={running.includes(worker.id)}
          onClick={() => router.push(`/workforce/${worker.id}`)}
        />
      ))}

      {/* lead core */}
      {lead && (
        <>
          <circle cx={CX} cy={CY} r={92} fill="url(#coreGlow)" />
          <WorkerToken
            worker={lead}
            x={CX}
            y={CY}
            r={44}
            running={running.includes(lead.id)}
            onClick={() => router.push(`/workforce/${lead.id}`)}
            isLead
          />
        </>
      )}
    </svg>
  )
}

function WorkerToken({
  worker,
  x,
  y,
  r,
  running,
  onClick,
  isLead,
}: {
  worker: DemoWorker
  x: number
  y: number
  r: number
  running: boolean
  onClick: () => void
  isLead?: boolean
}) {
  const ring = STATE_RING[worker.state]
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="cursor-pointer"
      onClick={onClick}
      role="button"
      aria-label={`${worker.name}, ${worker.title}`}
    >
      {/* live pulse when working */}
      {(running || worker.state === "working") && (
        <circle r={r + 6} fill="none" stroke={ring} strokeWidth={1.5} opacity={0.5}>
          <animate attributeName="r" values={`${r};${r + 14};${r}`} dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
      <circle r={r} fill="var(--color-card)" stroke={ring} strokeWidth={isLead ? 2.4 : 1.8} />
      <circle r={r} fill={worker.accent} fillOpacity={0.14} />
      <text
        textAnchor="middle"
        dy={isLead ? "-0.05em" : "0.34em"}
        className="fill-foreground font-mono font-semibold"
        style={{ fontSize: isLead ? 20 : 15 }}
      >
        {worker.initials}
      </text>
      {isLead && (
        <text
          textAnchor="middle"
          dy="1.5em"
          className="fill-muted-foreground font-mono uppercase"
          style={{ fontSize: 8, letterSpacing: "0.16em" }}
        >
          Lead
        </text>
      )}
      {/* name label under specialists */}
      {!isLead && (
        <text
          textAnchor="middle"
          y={r + 16}
          className="fill-foreground"
          style={{ fontSize: 11, fontWeight: 500 }}
        >
          {worker.name.split(" ")[0]}
        </text>
      )}
      {!isLead && (
        <text
          textAnchor="middle"
          y={r + 30}
          className="fill-muted-foreground font-mono uppercase"
          style={{ fontSize: 8, letterSpacing: "0.12em" }}
        >
          {worker.title}
        </text>
      )}
    </g>
  )
}
