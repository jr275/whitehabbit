"use client"

/* ------------------------------------------------------------------ *
 * WhiteHabbit — FABRIC CANVAS (the hero)
 * Renders the worker as a living force-directed organism. Reads the
 * simulation's events and activation; draws core, capabilities, orbs
 * and connections. Owns the camera (pan / zoom / cinematic follow).
 * It only renders state — it never generates events.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useRef } from "react"
import {
  type Camera,
  type Graph,
  lerpCamera,
  stepPhysics,
  worldToScreen,
} from "@/lib/fabric-graph"
import type { CapabilityId, NodeState, WorkerEvent } from "@/lib/worker"

const C = {
  alive: [96, 118, 255] as const,
  grow: [86, 196, 128] as const,
  warn: [230, 176, 82] as const,
  fail: [226, 96, 96] as const,
  dim: [96, 110, 150] as const,
  core: [150, 170, 255] as const,
}

interface EdgePulse {
  born: number
  from: string
  to: string
  tone: keyof typeof C
}

/* precomputed core blob cells — the living-organism identity, in miniature */
function buildCoreCells() {
  const cells: { x: number; y: number; s: number; green: number; ph: number }[] = []
  let seed = 9
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const step = 0.34
  for (let gx = -1; gx <= 1; gx += step) {
    for (let gy = -1; gy <= 1; gy += step) {
      const jx = gx + (rnd() - 0.5) * step * 0.6
      const jy = gy + (rnd() - 0.5) * step * 0.6
      if (Math.hypot(jx, jy) > 0.92) continue
      cells.push({ x: jx, y: jy, s: 0.26 + rnd() * 0.16, green: rnd(), ph: rnd() * 6.28 })
    }
  }
  return cells
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

export interface FabricHandle {
  reveal: number
}

export function FabricCanvas({
  graph,
  activation,
  latest,
  revealCount,
  cameraTarget,
  cameraKey,
  focusCapId,
  warnCaps,
  activePath,
  capStates,
  dense,
  onSelectCapability,
  onUserCamera,
}: {
  graph: Graph
  activation: Record<CapabilityId, number>
  latest: WorkerEvent | null
  revealCount: number
  cameraTarget: Camera
  cameraKey: string | number
  focusCapId: CapabilityId | null
  /** capabilities currently flagged weak (amber) — data-driven */
  warnCaps: CapabilityId[]
  /** capabilities on the currently executing task's path (others quiet) */
  activePath: CapabilityId[]
  /** discrete visual state per capability (active/success/error/…) */
  capStates: Record<CapabilityId, NodeState>
  /** rabbit-hole density (small type, brighter internals) */
  dense: boolean
  onSelectCapability: (id: CapabilityId | null) => void
  onUserCamera: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const coreCells = useMemo(buildCoreCells, [])
  const pulsesRef = useRef<EdgePulse[]>([])
  const lastEvId = useRef(-1)

  const camRef = useRef<Camera>({ ...cameraTarget })
  const lerpTargetRef = useRef<Camera>({ ...cameraTarget })
  const lerpingRef = useRef(false)
  const draggingRef = useRef(false)
  const dragLast = useRef({ x: 0, y: 0 })
  const movedRef = useRef(false)

  const activationRef = useRef(activation)
  activationRef.current = activation
  const focusRef = useRef(focusCapId)
  focusRef.current = focusCapId
  const denseRef = useRef(dense)
  denseRef.current = dense
  const revealRef = useRef(revealCount)
  revealRef.current = revealCount
  const warnRef = useRef(warnCaps)
  warnRef.current = warnCaps
  const pathRef = useRef(activePath)
  pathRef.current = activePath
  const stateRef = useRef(capStates)
  stateRef.current = capStates

  // camera command: whenever cameraKey changes, lerp toward the new target
  useEffect(() => {
    lerpTargetRef.current = { ...cameraTarget }
    lerpingRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraKey])

  // translate the latest real event into an edge pulse
  useEffect(() => {
    if (!latest || latest.id === lastEvId.current) return
    lastEvId.current = latest.id
    const fromId = latest.from === "core" ? "core" : `cap:${latest.from}`
    const toId = `cap:${latest.to}`
    let tone: keyof typeof C = "alive"
    if (warnRef.current.includes(latest.to)) tone = "warn"
    else if (
      latest.kind === "decision_created" ||
      latest.kind === "action_executed" ||
      latest.kind === "task_completed"
    )
      tone = "grow"
    pulsesRef.current.push({ born: performance.now(), from: fromId, to: toId, tone })
    if (pulsesRef.current.length > 20) pulsesRef.current.shift()
  }, [latest])

  const screenToWorld = useCallback((sx: number, sy: number, vw: number, vh: number) => {
    const cam = camRef.current
    return {
      x: (sx - vw / 2) / cam.zoom + cam.x,
      y: (sy - vh / 2) / cam.zoom + cam.y,
    }
  }, [])

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

    const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

    const draw = (now: number) => {
      const cam = camRef.current
      const reveal = revealRef.current
      const focus = focusRef.current
      const isDense = denseRef.current
      const act = activationRef.current
      const path = pathRef.current
      const states = stateRef.current
      const pathActive = path.length > 0
      const offPath = (cap?: CapabilityId | "core") =>
        pathActive && !!cap && cap !== "core" && !path.includes(cap)

      // camera lerp toward command target
      if (lerpingRef.current) {
        camRef.current = lerpCamera(cam, lerpTargetRef.current, 0.08)
        const dz = Math.abs(camRef.current.zoom - lerpTargetRef.current.zoom)
        const dx = Math.abs(camRef.current.x - lerpTargetRef.current.x)
        const dy = Math.abs(camRef.current.y - lerpTargetRef.current.y)
        if (dz < 0.002 && dx < 0.6 && dy < 0.6) lerpingRef.current = false
      }

      // physics only over revealed nodes
      stepPhysics(graph, reveal)

      ctx.clearRect(0, 0, w, h)

      // ambient substrate glow that tracks the core
      const coreS = worldToScreen(0, 0, camRef.current, w, h)
      const aura = ctx.createRadialGradient(
        coreS.x,
        coreS.y,
        0,
        coreS.x,
        coreS.y,
        Math.max(w, h) * 0.6,
      )
      aura.addColorStop(0, "rgba(96,118,255,0.10)")
      aura.addColorStop(0.5, "rgba(96,118,255,0.03)")
      aura.addColorStop(1, "rgba(96,118,255,0)")
      ctx.fillStyle = aura
      ctx.fillRect(0, 0, w, h)

      const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
      const isRevealed = (id: string) => {
        const i = graph.nodes.findIndex((n) => n.id === id)
        return i > -1 && i < reveal
      }

      // ---- edges ----
      for (const e of graph.edges) {
        const a = nodeById.get(e.a)
        const b = nodeById.get(e.b)
        if (!a || !b || !isRevealed(e.a) || !isRevealed(e.b)) continue
        const pa = worldToScreen(a.x, a.y, camRef.current, w, h)
        const pb = worldToScreen(b.x, b.y, camRef.current, w, h)
        const capActive = e.capB ? act[e.capB] ?? 0 : 0
        const focusDim = focus && e.capB && e.capB !== focus && e.capA !== focus
        const pathDim = offPath(e.capB) || offPath(e.capA)
        const dimmed = focusDim || pathDim
        const baseA = e.flow ? 0.16 : 0.1
        const alpha = Math.min(0.6, baseA + capActive * 0.5) * (dimmed ? 0.16 : 1)
        ctx.strokeStyle = rgba(C.dim, alpha)
        ctx.lineWidth = (e.flow ? 1 : 0.75) + capActive * 1.4
        ctx.beginPath()
        ctx.moveTo(pa.x, pa.y)
        ctx.lineTo(pb.x, pb.y)
        ctx.stroke()
      }

      // ---- edge pulses (traveling particles) ----
      const pulses = pulsesRef.current
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]
        const age = (now - p.born) / 1000
        const life = 0.9
        if (age > life) {
          pulses.splice(i, 1)
          continue
        }
        const a = nodeById.get(p.from)
        const b = nodeById.get(p.to)
        if (!a || !b) continue
        const t = age / life
        const wx = a.x + (b.x - a.x) * t
        const wy = a.y + (b.y - a.y) * t
        const s = worldToScreen(wx, wy, camRef.current, w, h)
        const col = C[p.tone]
        ctx.fillStyle = rgba(col, 1 - t * 0.5)
        ctx.beginPath()
        ctx.arc(s.x, s.y, (isDense ? 2.5 : 3.5) * cam.zoom * (1 - t * 0.3), 0, Math.PI * 2)
        ctx.fill()
        // faint trailing glow
        ctx.fillStyle = rgba(col, (1 - t) * 0.18)
        ctx.beginPath()
        ctx.arc(s.x, s.y, 9 * cam.zoom * (1 - t * 0.3), 0, Math.PI * 2)
        ctx.fill()
      }

      // ---- nodes ----
      for (let i = 0; i < Math.min(reveal, graph.nodes.length); i++) {
        const node = graph.nodes[i]
        const s = worldToScreen(node.x, node.y, camRef.current, w, h)
        const z = cam.zoom
        const a = node.capId ? act[node.capId] ?? 0 : 0
        const nodeState: NodeState = node.capId ? states[node.capId] ?? "idle" : "idle"
        const focusDim = focus && node.capId && node.capId !== focus
        const pathDim = offPath(node.capId) || nodeState === "disabled"
        const dimmed = focusDim || pathDim

        if (node.kind === "core") {
          const R = node.radius * z
          const breathe = 1 + Math.sin(now / 1400) * 0.05
          // core halo
          const halo = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, R * 2.4)
          halo.addColorStop(0, rgba(C.core, 0.4))
          halo.addColorStop(1, rgba(C.core, 0))
          ctx.fillStyle = halo
          ctx.beginPath()
          ctx.arc(s.x, s.y, R * 2.4, 0, Math.PI * 2)
          ctx.fill()
          // breathing pixel-blob cells
          for (const cell of coreCells) {
            const cs = R * cell.s * breathe
            const shimmer = 0.6 + 0.4 * Math.sin(now / 800 + cell.ph)
            const col = cell.green > 0.62 ? C.grow : C.alive
            ctx.fillStyle = rgba(col, 0.5 + shimmer * 0.4)
            roundRect(
              ctx,
              s.x + cell.x * R * 0.82 - cs / 2,
              s.y + cell.y * R * 0.82 - cs / 2,
              cs,
              cs,
              cs * 0.32,
            )
            ctx.fill()
          }
          continue
        }

        if (node.kind === "orb") {
          const r = node.radius * z
          const orbWarn = node.capId ? warnRef.current.includes(node.capId) : false
          ctx.fillStyle = rgba(orbWarn ? C.warn : C.grow, (dimmed ? 0.2 : 0.55) + a * 0.4)
          ctx.beginPath()
          ctx.arc(s.x, s.y, r, 0, Math.PI * 2)
          ctx.fill()
          continue
        }

        // capability node — ring + core orb + halo when active
        const R = node.radius * z
        const warn = node.capId ? warnRef.current.includes(node.capId) : false
        const col =
          nodeState === "error"
            ? C.fail
            : nodeState === "success"
              ? C.grow
              : warn
                ? C.warn
                : nodeState === "active" || a > 0.05
                  ? C.alive
                  : C.dim
        // errors always break through the dimming so failure is legible
        const baseAlpha = nodeState === "error" ? 1 : dimmed ? 0.24 : 1

        // activation halo
        if (a > 0.02 && !dimmed) {
          const halo = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, R * 3)
          halo.addColorStop(0, rgba(col, 0.35 * a))
          halo.addColorStop(1, rgba(col, 0))
          ctx.fillStyle = halo
          ctx.beginPath()
          ctx.arc(s.x, s.y, R * 3, 0, Math.PI * 2)
          ctx.fill()
        }
        // outer ring
        ctx.strokeStyle = rgba(col, (0.35 + a * 0.5) * baseAlpha)
        ctx.lineWidth = 1 + a * 1.6
        ctx.beginPath()
        ctx.arc(s.x, s.y, R * (1.35 + a * 0.15), 0, Math.PI * 2)
        ctx.stroke()
        // inner orb
        const orbGrad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, R)
        orbGrad.addColorStop(0, rgba(col, 0.9 * baseAlpha))
        orbGrad.addColorStop(1, rgba(col, 0.3 * baseAlpha))
        ctx.fillStyle = orbGrad
        ctx.beginPath()
        ctx.arc(s.x, s.y, R, 0, Math.PI * 2)
        ctx.fill()

        // label
        if (z > 0.55 || focus === node.capId) {
          ctx.font = `${isDense ? "600 10px" : "600 11px"} var(--font-geist-mono, monospace)`
          ctx.fillStyle = rgba([210, 216, 240], (dimmed ? 0.3 : 0.9))
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          const ly = s.y + R + (isDense ? 12 : 15)
          ctx.fillText(node.label.toUpperCase(), s.x, ly)
        }
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [graph, coreCells])

  // ---- pointer interaction (pan / zoom / select) ----
  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true
    movedRef.current = false
    dragLast.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    const dx = e.clientX - dragLast.current.x
    const dy = e.clientY - dragLast.current.y
    if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true
    dragLast.current = { x: e.clientX, y: e.clientY }
    const cam = camRef.current
    camRef.current = { ...cam, x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom }
    lerpingRef.current = false
    onUserCamera()
  }
  const onPointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false
    if (movedRef.current) return
    // click = hit-test capability nodes
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const world = screenToWorld(sx, sy, rect.width, rect.height)
    let hit: CapabilityId | null = null
    for (let i = 0; i < Math.min(revealRef.current, graph.nodes.length); i++) {
      const n = graph.nodes[i]
      if (n.kind !== "capability" || !n.capId) continue
      if (Math.hypot(n.x - world.x, n.y - world.y) < n.radius + 10) {
        hit = n.capId
        break
      }
    }
    onSelectCapability(hit)
  }
  const onWheel = (e: React.WheelEvent) => {
    const cam = camRef.current
    const factor = e.deltaY < 0 ? 1.12 : 0.89
    const next = Math.max(0.35, Math.min(3, cam.zoom * factor))
    camRef.current = { ...cam, zoom: next }
    lerpingRef.current = false
    onUserCamera()
  }

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      aria-label="Worker fabric — a living force-directed map of the worker's capabilities and live execution"
      role="img"
    />
  )
}
