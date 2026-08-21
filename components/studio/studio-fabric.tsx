"use client"

import { useEffect, useMemo, useRef } from "react"
import type { Capability, WorkerStatus } from "@/lib/worker/worker-model"

/* ------------------------------------------------------------------ *
 * STUDIO FABRIC — a self-contained, event-driven canvas bound to the
 * new dynamic worker model. The worker core sits at the centre; each
 * capability orbits as a node. Node brightness/scale is driven by the
 * live `capPulse` map and `activeCapability` from the runtime stream,
 * so the fabric IS a projection of execution — never decoration.
 * ------------------------------------------------------------------ */

interface Node {
  id: string
  name: string
  category: string
  weak: boolean
  angle: number
  radius: number
  x: number
  y: number
}

const STATUS_HINT: Record<WorkerStatus, string> = {
  draft: "unbuilt",
  ready: "ready",
  live: "live",
  working: "working",
  waiting: "awaiting approval",
  idle: "idle",
}

export function StudioFabric({
  capabilities,
  status,
  activeCapability,
  capPulse,
  workerName,
  running,
}: {
  capabilities: Capability[]
  status: WorkerStatus
  activeCapability: string | null
  capPulse: Record<string, number>
  workerName: string
  running: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)

  // stable node layout derived from capabilities (radial orbit)
  const nodes = useMemo<Node[]>(() => {
    const active = capabilities.filter((c) => c.enabled)
    const n = active.length || 1
    return active.map((c, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2
      const radius = 150
      return {
        id: c.id,
        name: c.name,
        category: c.category,
        weak: c.status === "degraded",
        angle,
        radius,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      }
    })
  }, [capabilities])

  // live refs so the RAF loop reads fresh values without re-subscribing
  const pulseRef = useRef(capPulse)
  const activeRef = useRef(activeCapability)
  const runningRef = useRef(running)
  pulseRef.current = capPulse
  activeRef.current = activeCapability
  runningRef.current = running

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let width = 0
    let height = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const draw = () => {
      tRef.current += 0.016
      const t = tRef.current
      const cx = width / 2
      const cy = height / 2
      ctx.clearRect(0, 0, width, height)

      const pulse = pulseRef.current
      const active = activeRef.current
      const isRunning = runningRef.current

      // edges: core -> each node
      for (const node of nodes) {
        const p = pulse[node.id] ?? 0
        const nx = cx + node.x
        const ny = cy + node.y
        const grad = ctx.createLinearGradient(cx, cy, nx, ny)
        const alpha = 0.06 + p * 0.5
        grad.addColorStop(0, `rgba(120,140,255,${alpha})`)
        grad.addColorStop(1, `rgba(120,140,255,${alpha * 0.3})`)
        ctx.strokeStyle = grad
        ctx.lineWidth = 1 + p * 2
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(nx, ny)
        ctx.stroke()

        // travelling pulse along active edge
        if (p > 0.05 && isRunning) {
          const phase = (t * 0.6) % 1
          const px = cx + node.x * phase
          const py = cy + node.y * phase
          ctx.fillStyle = `rgba(150,170,255,${p})`
          ctx.beginPath()
          ctx.arc(px, py, 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // nodes
      for (const node of nodes) {
        const p = pulse[node.id] ?? 0
        const isActive = active === node.id
        const nx = cx + node.x
        const ny = cy + node.y
        const baseR = 20
        const r = baseR + p * 8 + (isActive ? 4 : 0)
        const breathe = 1 + Math.sin(t * 2 + node.angle) * 0.04

        // glow
        if (p > 0.02) {
          const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, r * 3)
          glow.addColorStop(0, `rgba(130,150,255,${p * 0.4})`)
          glow.addColorStop(1, "rgba(130,150,255,0)")
          ctx.fillStyle = glow
          ctx.beginPath()
          ctx.arc(nx, ny, r * 3, 0, Math.PI * 2)
          ctx.fill()
        }

        // body
        const weak = node.weak
        const fill = weak
          ? `rgba(210,150,70,${0.5 + p * 0.5})`
          : `rgba(90,110,240,${0.4 + p * 0.6})`
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.arc(nx, ny, r * breathe, 0, Math.PI * 2)
        ctx.fill()

        // ring
        ctx.strokeStyle = isActive ? "rgba(200,210,255,0.9)" : "rgba(150,165,255,0.35)"
        ctx.lineWidth = isActive ? 2 : 1
        ctx.beginPath()
        ctx.arc(nx, ny, r * breathe + 3, 0, Math.PI * 2)
        ctx.stroke()

        // label
        ctx.fillStyle = isActive ? "rgba(235,238,255,0.95)" : "rgba(180,190,220,0.7)"
        ctx.font = "600 10px ui-sans-serif, system-ui"
        ctx.textAlign = "center"
        ctx.fillText(node.name, nx, ny + r + 16)
      }

      // core
      const coreBreathe = 1 + Math.sin(t * 1.5) * 0.06
      const coreR = 30 * coreBreathe
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.4)
      const coreAlpha = isRunning ? 0.5 : 0.28
      coreGlow.addColorStop(0, `rgba(120,140,255,${coreAlpha})`)
      coreGlow.addColorStop(1, "rgba(120,140,255,0)")
      ctx.fillStyle = coreGlow
      ctx.beginPath()
      ctx.arc(cx, cy, coreR * 2.4, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = "rgba(70,90,220,0.9)"
      ctx.beginPath()
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = "rgba(190,200,255,0.6)"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cx, cy, coreR + 4, 0, Math.PI * 2)
      ctx.stroke()

      ctx.fillStyle = "rgba(235,238,255,0.95)"
      ctx.font = "700 11px ui-sans-serif, system-ui"
      ctx.textAlign = "center"
      ctx.fillText(workerName.slice(0, 10), cx, cy + 3)

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [nodes, workerName])

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a0b12]">
      <div className="absolute inset-0 bg-substrate opacity-60" />
      <canvas ref={canvasRef} className="relative h-full w-full" />
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            running ? "animate-pulse bg-[#7d8cff]" : status === "waiting" ? "bg-[#d2963f]" : "bg-white/30"
          }`}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
          {STATUS_HINT[status]}
        </span>
      </div>
    </div>
  )
}
