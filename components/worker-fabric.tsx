"use client"

import { useEffect, useRef } from "react"
import { CAPABILITY_ORDER, type CapabilityId, type WorkerEvent } from "@/lib/worker"

export type Fidelity = "ambient" | "activity" | "trace"

interface Cell {
  x: number // normalized -1..1
  y: number
  size: number // normalized
  cap: CapabilityId
  phase: number
  growBias: number // 0..1 how green this cell tends to be
}

interface Pulse {
  born: number
  cap: CapabilityId
  tone: "alive" | "grow" | "warn"
  label: string
  angle: number
}

const COLORS = {
  alive: [86, 108, 255] as const, // living blue
  grow: [86, 190, 120] as const, // growth green
  warn: [224, 170, 74] as const, // weak-capability amber
  dim: [60, 70, 110] as const,
}

function toneOf(kind: WorkerEvent["kind"], warn: boolean): Pulse["tone"] {
  if (warn) return "warn"
  if (kind === "decision_created" || kind === "action_executed" || kind === "task_completed") return "grow"
  return "alive"
}

/** Build a lumpy, pixel-blob organism once. */
function buildCells(): Cell[] {
  const cells: Cell[] = []
  const step = 0.115
  // low-freq noise for the organic edge
  const noise = (a: number) =>
    0.72 +
    0.16 * Math.sin(a * 3 + 0.6) +
    0.09 * Math.sin(a * 7 + 2.1) +
    0.05 * Math.cos(a * 11 + 1.2)
  let seed = 7
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const sectors = CAPABILITY_ORDER.length
  // score-derived green bias per capability (higher score = more growth)
  const growByCap: Record<CapabilityId, number> = {
    research: 0.72,
    reasoning: 0.55,
    communication: 0.22,
    execution: 0.78,
    reliability: 0.85,
  }
  for (let gx = -1; gx <= 1; gx += step) {
    for (let gy = -1; gy <= 1; gy += step) {
      const jx = gx + (rnd() - 0.5) * step * 0.7
      const jy = gy + (rnd() - 0.5) * step * 0.7
      const r = Math.hypot(jx, jy)
      let ang = Math.atan2(jy, jx)
      if (ang < 0) ang += Math.PI * 2
      if (r > noise(ang)) continue
      const sector = Math.floor((ang / (Math.PI * 2)) * sectors) % sectors
      const cap = CAPABILITY_ORDER[sector]
      const g = growByCap[cap]
      cells.push({
        x: jx,
        y: jy,
        size: step * (0.62 + rnd() * 0.34),
        cap,
        phase: rnd() * Math.PI * 2,
        growBias: Math.max(0, Math.min(1, g * (0.55 + rnd() * 0.7))),
      })
    }
  }
  return cells
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

export function WorkerFabric({
  latest,
  fidelity,
}: {
  latest: WorkerEvent | null
  fidelity: Fidelity
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cellsRef = useRef<Cell[]>([])
  const pulsesRef = useRef<Pulse[]>([])
  const activationRef = useRef<Record<string, number>>({})
  const fidelityRef = useRef<Fidelity>(fidelity)
  const lastIdRef = useRef<number>(-1)

  if (cellsRef.current.length === 0) cellsRef.current = buildCells()
  fidelityRef.current = fidelity

  // translate real events -> visual pulses (skipped in ambient)
  useEffect(() => {
    if (!latest || latest.id === lastIdRef.current) return
    lastIdRef.current = latest.id
    if (fidelityRef.current === "ambient") return
    const warn = latest.capability === "communication"
    const sector = CAPABILITY_ORDER.indexOf(latest.capability)
    const angle = ((sector + 0.5) / CAPABILITY_ORDER.length) * Math.PI * 2
    pulsesRef.current.push({
      born: performance.now(),
      cap: latest.capability,
      tone: toneOf(latest.kind, warn),
      label: latest.label,
      angle,
    })
    activationRef.current[latest.capability] = 1
    if (pulsesRef.current.length > 14) pulsesRef.current.shift()
  }, [latest])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf = 0
    let dpr = 1
    let w = 0
    let h = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = rect.width
      h = rect.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const draw = (now: number) => {
      const cells = cellsRef.current
      const act = activationRef.current
      const mode = fidelityRef.current
      ctx.clearRect(0, 0, w, h)

      const cx = w / 2
      const cy = h / 2
      const R = Math.min(w, h) * 0.36
      const breathe = 1 + Math.sin(now / 1400) * 0.022

      // decay per-capability activation
      for (const k of Object.keys(act)) {
        act[k] = Math.max(0, act[k] - 0.012)
      }

      // soft aura
      const aura = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.8)
      aura.addColorStop(0, "rgba(86,108,255,0.10)")
      aura.addColorStop(1, "rgba(86,108,255,0)")
      ctx.fillStyle = aura
      ctx.fillRect(0, 0, w, h)

      // cells
      for (const c of cells) {
        const px = cx + c.x * R * breathe
        const py = cy + c.y * R * breathe
        const shimmer = 0.5 + 0.5 * Math.sin(now / 900 + c.phase)
        const a = act[c.cap] ?? 0
        const size = c.size * R * (0.9 + shimmer * 0.14) * (1 + a * 0.35)

        // blend blue -> green by growth bias, brighten on activation
        const gb = c.growBias
        const base = COLORS.alive
        const target = c.cap === "communication" ? COLORS.warn : COLORS.grow
        const mix = c.cap === "communication" ? gb * 0.5 : gb
        const rC = Math.round(base[0] + (target[0] - base[0]) * mix)
        const gC = Math.round(base[1] + (target[1] - base[1]) * mix)
        const bC = Math.round(base[2] + (target[2] - base[2]) * mix)

        const baseAlpha = mode === "ambient" ? 0.62 : 0.68
        const alpha = Math.min(1, baseAlpha + shimmer * 0.16 + a * 0.32)
        ctx.fillStyle = `rgba(${rC},${gC},${bC},${alpha})`
        roundRect(ctx, px - size / 2, py - size / 2, size, size, size * 0.32)
        ctx.fill()
      }

      // core glow
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5)
      core.addColorStop(0, "rgba(150,170,255,0.5)")
      core.addColorStop(1, "rgba(150,170,255,0)")
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2)
      ctx.fill()

      // event pulses (rings + traveling particle)
      const alive = pulsesRef.current
      for (let i = alive.length - 1; i >= 0; i--) {
        const p = alive[i]
        const age = (now - p.born) / 1000
        const life = mode === "trace" ? 2.2 : 1.4
        if (age > life) {
          alive.splice(i, 1)
          continue
        }
        const t = age / life
        const [cr, cg, cb] = p.tone === "grow" ? COLORS.grow : p.tone === "warn" ? COLORS.warn : COLORS.alive

        // expanding ring
        const ringR = R * (0.4 + t * 0.9)
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(1 - t) * (mode === "trace" ? 0.5 : 0.35)})`
        ctx.lineWidth = mode === "trace" ? 1.5 : 2.5
        ctx.beginPath()
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
        ctx.stroke()

        // particle traveling from core out to the capability sector
        const dist = R * (0.15 + t * 0.95)
        const px = cx + Math.cos(p.angle) * dist
        const py = cy + Math.sin(p.angle) * dist
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${1 - t})`
        ctx.beginPath()
        ctx.arc(px, py, (mode === "trace" ? 3 : 4) * (1 - t * 0.4), 0, Math.PI * 2)
        ctx.fill()

        // TRACE fidelity: precise label pinned to the landing point
        if (mode === "trace" && t < 0.9) {
          ctx.font = "600 10px var(--font-geist-mono, monospace)"
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${Math.min(1, (1 - t) * 1.4)})`
          ctx.textAlign = Math.cos(p.angle) < 0 ? "right" : "left"
          const lx = cx + Math.cos(p.angle) * (R * 1.12)
          const ly = cy + Math.sin(p.angle) * (R * 1.12)
          ctx.fillText(p.label, lx, ly)
        }
      }

      // AMBIENT: gentle floating motes, no event coupling — purely atmospheric
      if (mode === "ambient") {
        for (let i = 0; i < 5; i++) {
          const a = now / 3000 + (i * Math.PI * 2) / 5
          const rr = R * (0.6 + 0.25 * Math.sin(now / 2000 + i))
          ctx.fillStyle = "rgba(120,140,255,0.28)"
          ctx.beginPath()
          ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />
}
