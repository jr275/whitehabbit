/* ------------------------------------------------------------------ *
 * WhiteHabbit — FABRIC GRAPH (pure physics, no React, no canvas)
 * An organic force-directed layout. Nodes have position, velocity and
 * mass; edges are springs; every node repels every other. The system
 * settles naturally — no grid, no perfect symmetry. When a capability
 * is added or evolved, the structure physically makes room for it.
 * ------------------------------------------------------------------ */

import { type Capability, type CapabilityId, RELATIONS } from "./worker"

export type NodeKind = "core" | "capability" | "orb"

export interface PNode {
  id: string
  kind: NodeKind
  capId?: CapabilityId
  label: string
  x: number
  y: number
  vx: number
  vy: number
  mass: number
  /** base render radius in world units */
  radius: number
  pinned?: boolean
  /** birth ordering for staggered assembly (0 = core) */
  bornStep: number
}

export interface PEdge {
  a: string
  b: string
  rest: number
  strength: number
  /** capability -> capability flow edge (pulses travel these) */
  flow?: boolean
  capA?: CapabilityId | "core"
  capB?: CapabilityId
}

export interface Graph {
  nodes: PNode[]
  edges: PEdge[]
}

/* deterministic tiny PRNG so the layout is stable between reloads */
function makeRng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

export function buildGraph(caps: Capability[]): Graph {
  const rng = makeRng(42)
  const nodes: PNode[] = []
  const edges: PEdge[] = []

  nodes.push({
    id: "core",
    kind: "core",
    label: "core",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    mass: 8,
    radius: 34,
    pinned: true,
    bornStep: 0,
  })

  const n = caps.length
  const angleOf = (i: number) => (i / n) * Math.PI * 2 + rng() * 0.5

  // pass 1 — capability nodes appear first (clean birth order: core -> caps)
  const capAngles: number[] = []
  const capDists: number[] = []
  caps.forEach((cap, i) => {
    const ang = angleOf(i)
    const dist = 150 + rng() * 40
    capAngles[i] = ang
    capDists[i] = dist
    nodes.push({
      id: `cap:${cap.id}`,
      kind: "capability",
      capId: cap.id,
      label: cap.name,
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist,
      vx: 0,
      vy: 0,
      mass: 3,
      radius: 15 + (cap.score / 100) * 9,
      bornStep: 1 + i,
    })
  })

  // pass 2 — skill orbs hang off each capability (physical mass of maturity)
  caps.forEach((cap, i) => {
    const ang = capAngles[i]
    const dist = capDists[i]
    for (let o = 0; o < cap.orbs; o++) {
      const oa = ang + (rng() - 0.5) * 1.4
      const od = dist + 58 + rng() * 26
      nodes.push({
        id: `orb:${cap.id}:${o}`,
        kind: "orb",
        capId: cap.id,
        label: "",
        x: Math.cos(oa) * od,
        y: Math.sin(oa) * od,
        vx: 0,
        vy: 0,
        mass: 0.6,
        radius: 4 + rng() * 2.5,
        bornStep: 6 + i,
      })
      edges.push({
        a: `cap:${cap.id}`,
        b: `orb:${cap.id}:${o}`,
        rest: 52,
        strength: 0.02,
      })
    }
  })

  // relationship edges (core<->cap and cap flow)
  for (const [from, to] of RELATIONS) {
    const aId = from === "core" ? "core" : `cap:${from}`
    const bId = `cap:${to}`
    const isFlow = from !== "core"
    edges.push({
      a: aId,
      b: bId,
      rest: isFlow ? 150 : 155,
      strength: isFlow ? 0.012 : 0.02,
      flow: isFlow,
      capA: from,
      capB: to,
    })
  }

  return { nodes, edges }
}

/** Append a skill orb to a capability — the worker physically grows.
 *  Positions it near its capability node so the system settles smoothly. */
export function addOrb(graph: Graph, capId: CapabilityId): string {
  const cap = graph.nodes.find((n) => n.id === `cap:${capId}`)
  const existing = graph.nodes.filter((n) => n.kind === "orb" && n.capId === capId).length
  const id = `orb:${capId}:${existing}:${Date.now()}`
  const ang = cap ? Math.atan2(cap.y, cap.x) + (Math.random() - 0.5) * 1.2 : Math.random() * 6.28
  const baseX = cap ? cap.x : 0
  const baseY = cap ? cap.y : 0
  graph.nodes.push({
    id,
    kind: "orb",
    capId,
    label: "",
    x: baseX + Math.cos(ang) * 20,
    y: baseY + Math.sin(ang) * 20,
    vx: 0,
    vy: 0,
    mass: 0.6,
    radius: 4 + Math.random() * 2.5,
    bornStep: 999,
  })
  graph.edges.push({ a: `cap:${capId}`, b: id, rest: 52, strength: 0.02 })
  return id
}

/** Update a capability node's render radius to reflect a new score. */
export function setCapabilityScore(graph: Graph, capId: CapabilityId, score: number) {
  const cap = graph.nodes.find((n) => n.id === `cap:${capId}`)
  if (cap) cap.radius = 15 + (score / 100) * 9
}

const REPULSION = 26000
const DAMPING = 0.86
const CENTERING = 0.0016

/** One integration step of the force simulation (mutates nodes in place). */
export function stepPhysics(graph: Graph, visibleCount: number) {
  const { nodes, edges } = graph
  const active = nodes.slice(0, visibleCount)

  // pairwise repulsion
  for (let i = 0; i < active.length; i++) {
    const a = active[i]
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j]
      let dx = a.x - b.x
      let dy = a.y - b.y
      let d2 = dx * dx + dy * dy
      if (d2 < 1) d2 = 1
      const d = Math.sqrt(d2)
      const f = REPULSION / d2
      const fx = (dx / d) * f
      const fy = (dy / d) * f
      a.vx += (fx / a.mass) * 0.016
      a.vy += (fy / a.mass) * 0.016
      b.vx -= (fx / b.mass) * 0.016
      b.vy -= (fy / b.mass) * 0.016
    }
  }

  // springs
  const idx = new Map(active.map((nn) => [nn.id, nn]))
  for (const e of edges) {
    const a = idx.get(e.a)
    const b = idx.get(e.b)
    if (!a || !b) continue
    let dx = b.x - a.x
    let dy = b.y - a.y
    const d = Math.hypot(dx, dy) || 1
    const stretch = d - e.rest
    const f = stretch * e.strength
    const fx = (dx / d) * f
    const fy = (dy / d) * f
    a.vx += (fx / a.mass) * 0.9
    a.vy += (fy / a.mass) * 0.9
    b.vx -= (fx / b.mass) * 0.9
    b.vy -= (fy / b.mass) * 0.9
  }

  // integrate + gentle centering + damping
  for (const nOde of active) {
    if (nOde.pinned) {
      nOde.vx = 0
      nOde.vy = 0
      continue
    }
    nOde.vx += -nOde.x * CENTERING
    nOde.vy += -nOde.y * CENTERING
    nOde.vx *= DAMPING
    nOde.vy *= DAMPING
    nOde.x += nOde.vx
    nOde.y += nOde.vy
  }
}

/* ----------------------------- camera ----------------------------- */

export interface Camera {
  x: number // world point centered
  y: number
  zoom: number
}

export function worldToScreen(
  wx: number,
  wy: number,
  cam: Camera,
  vw: number,
  vh: number,
) {
  return {
    x: (wx - cam.x) * cam.zoom + vw / 2,
    y: (wy - cam.y) * cam.zoom + vh / 2,
  }
}

export function lerpCamera(cam: Camera, target: Camera, k: number): Camera {
  return {
    x: cam.x + (target.x - cam.x) * k,
    y: cam.y + (target.y - cam.y) * k,
    zoom: cam.zoom + (target.zoom - cam.zoom) * k,
  }
}
