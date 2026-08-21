/* ------------------------------------------------------------------ *
 * WhiteHabbit — WORKER STATE (pure model, no React, no rendering)
 *
 * The factual definition of a worker: its identity, its capabilities,
 * the relationships between them, and the outcomes it has produced.
 * The simulation engine (lib/simulation.ts) emits events against this.
 * The fabric renderer (components/fabric-canvas.tsx) draws it.
 * Nothing here knows about pixels.
 * ------------------------------------------------------------------ */

export type CapabilityId =
  | "research"
  | "reasoning"
  | "communication"
  | "execution"
  | "reliability"

export type EventKind =
  | "task_started"
  | "capability_activated"
  | "tool_called"
  | "decision_created"
  | "action_executed"
  | "task_completed"

export interface WorkerEvent {
  id: number
  t: number
  taskId: number
  kind: EventKind
  /** where the pulse originates ("core" or a capability) */
  from: CapabilityId | "core"
  /** the capability this event lands on */
  to: CapabilityId
  label: string
  detail?: string
}

export interface Capability {
  id: CapabilityId
  name: string
  /** health / mastery, 0-100 */
  score: number
  /** the worker's weakest link surfaces this */
  warning?: boolean
  /** skill/tool orbs that hang off this capability — grows on evolve */
  orbs: number
}

export interface Worker {
  name: string
  role: string
  level: number
  capabilities: Capability[]
}

export interface OutcomeMetric {
  value: string
  label: string
}

/* --------------------------- demo worker --------------------------- */

export const CAPABILITY_ORDER: CapabilityId[] = [
  "research",
  "reasoning",
  "communication",
  "execution",
  "reliability",
]

export const CAPABILITY_META: Record<
  CapabilityId,
  { name: string; blurb: string }
> = {
  research: { name: "Research", blurb: "Finds and verifies signal" },
  reasoning: { name: "Reasoning", blurb: "Scores intent and decides" },
  communication: { name: "Communication", blurb: "Drafts and speaks" },
  execution: { name: "Execution", blurb: "Acts on systems of record" },
  reliability: { name: "Reliability", blurb: "Guards every cycle" },
}

export const ATLAS: Worker = {
  name: "Atlas",
  role: "Sales Worker",
  level: 12,
  capabilities: [
    { id: "research", name: "Research", score: 94, orbs: 3 },
    { id: "reasoning", name: "Reasoning", score: 87, orbs: 2 },
    { id: "communication", name: "Communication", score: 73, warning: true, orbs: 1 },
    { id: "execution", name: "Execution", score: 96, orbs: 3 },
    { id: "reliability", name: "Reliability", score: 98, orbs: 2 },
  ],
}

/* The causal flow through the worker — research feeds reasoning, which
 * feeds communication, which drives execution. Reliability oversees. */
export const FLOW: CapabilityId[] = [
  "research",
  "reasoning",
  "communication",
  "execution",
]

/* Directed relationships used both for physics edges and pulse routing. */
export const RELATIONS: [CapabilityId | "core", CapabilityId][] = [
  ["core", "research"],
  ["core", "reasoning"],
  ["core", "communication"],
  ["core", "execution"],
  ["core", "reliability"],
  ["research", "reasoning"],
  ["reasoning", "communication"],
  ["communication", "execution"],
  ["execution", "reliability"],
]

export const OUTCOMES: OutcomeMetric[] = [
  { value: "$412K", label: "Pipeline generated" },
  { value: "184", label: "Meetings booked" },
  { value: "1,284", label: "Qualified leads" },
  { value: "4,812", label: "Research tasks" },
]

/* The eight-beat loop — the worker is never "done". */
export const LOOP = [
  { id: "create", label: "Create" },
  { id: "grow", label: "Grow" },
  { id: "teach", label: "Teach" },
  { id: "test", label: "Test" },
  { id: "release", label: "Release" },
  { id: "watch", label: "Watch" },
  { id: "trace", label: "Trace" },
  { id: "evolve", label: "Evolve" },
] as const

export type LoopId = (typeof LOOP)[number]["id"]

/* Zoom levels / cinematic modes — the deeper you go, the more technical. */
export type FabricMode = "outcome" | "fabric" | "watch" | "trace"

/* Contextual interactions that overlay the fabric. */
export type Interaction = "none" | "grow" | "teach" | "evolve"

export const KIND_META: Record<
  EventKind,
  { label: string; tone: "alive" | "grow" | "warn" | "muted" }
> = {
  task_started: { label: "task", tone: "muted" },
  capability_activated: { label: "activate", tone: "alive" },
  tool_called: { label: "tool", tone: "alive" },
  decision_created: { label: "decision", tone: "grow" },
  action_executed: { label: "action", tone: "grow" },
  task_completed: { label: "done", tone: "grow" },
}
