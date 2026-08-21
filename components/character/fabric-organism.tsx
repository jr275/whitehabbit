"use client"

import { useEffect, useMemo, useRef } from "react"
import { SKILL_CATEGORIES, type FabricState, type SkillCategory } from "@/lib/character/character-model"

/* ------------------------------------------------------------------ *
 * FABRIC ORGANISM — the persistent visual manifestation of the Worker.
 *
 * Not an orb, avatar or robot: an abstract intelligence LATTICE. Five
 * category meridians radiate from an identity core. Each meridian's
 * reach, node count and brightness are driven by that skill's
 * influence; concentric structural rings appear as the worker's
 * evolution tier rises; filament density and glow track energy. The
 * structure is seeded from the FabricState, so it is identical on every
 * surface and visibly EVOLVES whenever skills level up.
 * ------------------------------------------------------------------ */

/* fixed meridian order so continuity holds across surfaces */
const ARM_ANGLE: Record<SkillCategory, number> = {
  research: -Math.PI / 2, // top
  reasoning: -Math.PI / 2 + (Math.PI * 2) / 5,
  communication: -Math.PI / 2 + (Math.PI * 4) / 5,
  execution: -Math.PI / 2 + (Math.PI * 6) / 5,
  reliability: -Math.PI / 2 + (Math.PI * 8) / 5,
}

/* subtle cool-palette hue per meridian (kept unified & premium) */
const ARM_HUE: Record<SkillCategory, number> = {
  research: 226,
  reasoning: 250,
  communication: 202,
  execution: 266,
  reliability: 190,
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface ArmNode {
  t: number // position along arm, 0..1
  size: number
}
interface Branch {
  t: number
  angleOff: number
  len: number
}
interface Arm {
  cat: SkillCategory
  angle: number
  reach: number // 0..1 of maxRadius
  brightness: number // 0..1
  nodes: ArmNode[]
  branches: Branch[]
}
interface Structure {
  arms: Arm[]
  rings: number[] // radii 0..1
  coreSize: number
  filaments: number
}

function buildStructure(fabric: FabricState): Structure {
  // structural seed — stable unless the worker meaningfully changes
  let seedNum = Math.floor(fabric.evolutionLevel * 1000)
  for (const cat of SKILL_CATEGORIES) {
    seedNum += Math.round((fabric.skillInfluences[cat] ?? 0) * 100) * 7
  }
  const rand = mulberry32(seedNum)

  const arms: Arm[] = SKILL_CATEGORIES.map((cat) => {
    const inf = Math.max(0, Math.min(1, fabric.skillInfluences[cat] ?? 0))
    const reach = 0.32 + inf * 0.6
    const nodeCount = 1 + Math.round(inf * (2 + fabric.complexity * 3))
    const nodes: ArmNode[] = []
    for (let i = 0; i < nodeCount; i++) {
      const t = (i + 1) / (nodeCount + 0.5)
      nodes.push({ t, size: 2 + inf * 5 * (1 - t * 0.4) })
    }
    // branches grow with complexity + influence
    const branchCount = Math.round(inf * fabric.complexity * 4)
    const branches: Branch[] = []
    for (let i = 0; i < branchCount; i++) {
      branches.push({
        t: 0.35 + rand() * 0.55,
        angleOff: (rand() - 0.5) * 0.9,
        len: 0.08 + rand() * 0.16 * (0.5 + inf),
      })
    }
    return { cat, angle: ARM_ANGLE[cat], reach, brightness: 0.25 + inf * 0.75, nodes, branches }
  })

  const rings: number[] = []
  const ringCount = Math.max(1, fabric.evolutionLevel)
  for (let i = 1; i <= ringCount; i++) {
    rings.push(0.24 + (i / (ringCount + 1)) * 0.7)
  }

  return {
    arms,
    rings,
    coreSize: 16 + fabric.density * 14,
    filaments: Math.round(6 + fabric.density * 26),
  }
}

export function FabricOrganism({
  fabric,
  name,
  highlightCategory = null,
  ambient = false,
  showLabel = true,
  className = "",
}: {
  fabric: FabricState
  name?: string
  highlightCategory?: SkillCategory | null
  ambient?: boolean
  showLabel?: boolean
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)

  const structure = useMemo(() => buildStructure(fabric), [fabric])

  // live refs for the RAF loop
  const structRef = useRef(structure)
  const fabricRef = useRef(fabric)
  const highlightRef = useRef<{ cat: SkillCategory | null; energy: number }>({ cat: null, energy: 0 })
  structRef.current = structure
  fabricRef.current = fabric

  // pulse a meridian when highlightCategory changes (upgrade / hover)
  useEffect(() => {
    if (highlightCategory) highlightRef.current = { cat: highlightCategory, energy: 1 }
  }, [highlightCategory])

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
      canvas.width = Math.max(1, width * dpr)
      canvas.height = Math.max(1, height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const draw = () => {
      const speed = ambient ? 0.006 : 0.01
      tRef.current += speed * (0.6 + fabricRef.current.energy)
      const t = tRef.current
      const s = structRef.current
      const fab = fabricRef.current
      const cx = width / 2
      const cy = height / 2
      const maxR = (Math.min(width, height) / 2) * 0.84
      const rot = t * 0.05 // very slow global drift
      const energy = fab.energy

      // decay meridian highlight
      if (highlightRef.current.energy > 0) {
        highlightRef.current.energy = Math.max(0, highlightRef.current.energy - 0.012)
      }

      ctx.clearRect(0, 0, width, height)

      // ---- structural rings (evolution tiers) ----
      for (let ri = 0; ri < s.rings.length; ri++) {
        const rr = s.rings[ri] * maxR
        const wobble = 1 + Math.sin(t * 0.6 + ri) * 0.012
        ctx.beginPath()
        const verts = 5
        for (let v = 0; v <= verts; v++) {
          const a = rot + (v / verts) * Math.PI * 2
          const px = cx + Math.cos(a) * rr * wobble
          const py = cy + Math.sin(a) * rr * wobble
          if (v === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.strokeStyle = `hsla(235, 60%, 70%, ${0.05 + energy * 0.06})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // ---- meridians ----
      for (const arm of s.arms) {
        const hue = ARM_HUE[arm.cat]
        const a = arm.angle + rot
        const reachR = arm.reach * maxR
        const tipX = cx + Math.cos(a) * reachR
        const tipY = cy + Math.sin(a) * reachR
        const hl =
          highlightRef.current.cat === arm.cat ? highlightRef.current.energy : 0
        const bright = Math.min(1, arm.brightness + hl * 0.6)
        const flow = (Math.sin(t * 1.2 + arm.angle * 2) + 1) / 2

        // main filament
        const grad = ctx.createLinearGradient(cx, cy, tipX, tipY)
        grad.addColorStop(0, `hsla(${hue}, 80%, 70%, ${0.1 + bright * 0.28})`)
        grad.addColorStop(1, `hsla(${hue}, 85%, 72%, ${0.04 + bright * 0.14})`)
        ctx.strokeStyle = grad
        ctx.lineWidth = 1 + bright * 1.6 + hl * 1.5
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(tipX, tipY)
        ctx.stroke()

        // branches
        for (const br of arm.branches) {
          const bx = cx + Math.cos(a) * reachR * br.t
          const by = cy + Math.sin(a) * reachR * br.t
          const ba = a + br.angleOff
          const ex = bx + Math.cos(ba) * br.len * maxR
          const ey = by + Math.sin(ba) * br.len * maxR
          ctx.strokeStyle = `hsla(${hue}, 80%, 72%, ${0.05 + bright * 0.16})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(bx, by)
          ctx.lineTo(ex, ey)
          ctx.stroke()
          // branch tip node
          ctx.fillStyle = `hsla(${hue}, 85%, 75%, ${0.12 + bright * 0.3})`
          ctx.beginPath()
          ctx.arc(ex, ey, 1.4 + bright * 1.6, 0, Math.PI * 2)
          ctx.fill()
        }

        // nodes along the meridian
        for (const node of arm.nodes) {
          const nx = cx + Math.cos(a) * reachR * node.t
          const ny = cy + Math.sin(a) * reachR * node.t
          const breathe = 1 + Math.sin(t * 1.6 + node.t * 6) * 0.12
          const r = node.size * breathe * (0.7 + bright * 0.5)
          // glow
          const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, r * 3.2)
          glow.addColorStop(0, `hsla(${hue}, 90%, 72%, ${(0.18 + bright * 0.4) * (0.5 + energy * 0.5)})`)
          glow.addColorStop(1, `hsla(${hue}, 90%, 72%, 0)`)
          ctx.fillStyle = glow
          ctx.beginPath()
          ctx.arc(nx, ny, r * 3.2, 0, Math.PI * 2)
          ctx.fill()
          // body
          ctx.fillStyle = `hsla(${hue}, 88%, ${68 + bright * 12}%, ${0.5 + bright * 0.5})`
          ctx.beginPath()
          ctx.arc(nx, ny, r, 0, Math.PI * 2)
          ctx.fill()
        }

        // traveling energy pulse (density × energy)
        if (!ambient && energy > 0.05) {
          const pulses = Math.max(1, Math.round(fab.density * 2))
          for (let p = 0; p < pulses; p++) {
            const phase = (flow + p / pulses) % 1
            const px = cx + Math.cos(a) * reachR * phase
            const py = cy + Math.sin(a) * reachR * phase
            ctx.fillStyle = `hsla(${hue}, 95%, 80%, ${(0.5 + hl) * (1 - phase) * (0.4 + energy * 0.6)})`
            ctx.beginPath()
            ctx.arc(px, py, 1.6 + hl * 1.5, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }

      // ---- ambient filaments (density) ----
      const fseed = mulberry32(1234 + Math.round(fab.density * 50))
      for (let i = 0; i < s.filaments; i++) {
        const fa = fseed() * Math.PI * 2 + rot * 0.5
        const fr = (0.3 + fseed() * 0.65) * maxR
        const twinkle = (Math.sin(t * 1.5 + i) + 1) / 2
        const px = cx + Math.cos(fa) * fr
        const py = cy + Math.sin(fa) * fr
        ctx.fillStyle = `hsla(230, 70%, 80%, ${(0.04 + twinkle * 0.1) * (0.4 + energy * 0.6)})`
        ctx.beginPath()
        ctx.arc(px, py, 0.8 + twinkle * 0.8, 0, Math.PI * 2)
        ctx.fill()
      }

      // ---- identity core ----
      const coreBreathe = 1 + Math.sin(t * 1.4) * 0.05
      const coreR = s.coreSize * coreBreathe
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3)
      coreGlow.addColorStop(0, `hsla(235, 85%, 70%, ${0.28 + energy * 0.4})`)
      coreGlow.addColorStop(1, "hsla(235, 85%, 70%, 0)")
      ctx.fillStyle = coreGlow
      ctx.beginPath()
      ctx.arc(cx, cy, coreR * 3, 0, Math.PI * 2)
      ctx.fill()

      // inner core disc
      const disc = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR)
      disc.addColorStop(0, "hsla(230, 90%, 78%, 0.95)")
      disc.addColorStop(0.6, "hsla(240, 80%, 60%, 0.9)")
      disc.addColorStop(1, "hsla(245, 75%, 45%, 0.85)")
      ctx.fillStyle = disc
      ctx.beginPath()
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
      ctx.fill()

      // core rings
      ctx.strokeStyle = `hsla(230, 90%, 85%, ${0.5 + energy * 0.4})`
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.arc(cx, cy, coreR + 4, 0, Math.PI * 2)
      ctx.stroke()

      if (showLabel && name) {
        ctx.fillStyle = "hsla(235, 60%, 96%, 0.96)"
        ctx.font = "700 11px ui-sans-serif, system-ui"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(name.slice(0, 12).toUpperCase(), cx, cy)
      }

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [ambient, name, showLabel])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-hidden="true"
    />
  )
}
