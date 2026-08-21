/* ------------------------------------------------------------------ *
 * WorkerSpec — the shared specification model.
 *
 * One schema underlies every creation path: prefab selection, the
 * last-mile config steps, the natural-language text brief, and the
 * voice brief. Prefabs ship a complete WorkerSpec; the user only
 * supplies the final 10-20% (company context, KPIs, autonomy, etc.).
 * ------------------------------------------------------------------ */

import type { Autonomy, SkillCategory } from "@/lib/character/character-model"

export type { Autonomy, SkillCategory }

/** Broad business function a worker belongs to — drives Library grouping. */
export type WorkerCategory =
  | "marketing"
  | "operations"
  | "sales"
  | "legal"
  | "finance"
  | "people"
  | "content"

export const CATEGORY_META: Record<
  WorkerCategory,
  { label: string; blurb: string }
> = {
  marketing: { label: "Marketing", blurb: "Growth, demand & brand intelligence" },
  operations: { label: "Operations", blurb: "Process, supply & efficiency intelligence" },
  sales: { label: "Sales & Revenue", blurb: "Pipeline, deals & revenue intelligence" },
  legal: { label: "Legal", blurb: "Contract, risk & compliance intelligence" },
  finance: { label: "Finance", blurb: "Cash, cost & profitability intelligence" },
  people: { label: "People", blurb: "Talent, culture & retention intelligence" },
  content: { label: "Content", blurb: "Editorial, readability & search intelligence" },
}

/** A named competency cluster with its constituent skills. */
export interface SkillCluster {
  name: string
  category: SkillCategory
  skills: string[]
}

/** A domain specialization the worker can be pointed at. */
export interface SpecOption {
  id: string
  label: string
  description: string
}

/** A measurable business objective the worker optimizes toward. */
export interface Kpi {
  id: string
  label: string
  /** e.g. "primary" | "secondary" — used to rank in the UI. */
  weight: "primary" | "secondary"
}

/** A business outcome the worker is expected to produce. */
export interface OutcomeModel {
  id: string
  label: string
  /** How the impact is expressed, e.g. "+11-16% contribution margin". */
  impact: string
}

/** A tool / integration the worker can act through. */
export interface ToolBinding {
  id: string
  label: string
  /** Whether acting through this tool requires human approval. */
  requiresApproval: boolean
  connected: boolean
}

/** A rule requiring human sign-off before a class of action. */
export interface ApprovalRule {
  id: string
  label: string
}

/** A pre-authored scenario for pre-ship simulation. */
export interface SimScenario {
  id: string
  title: string
  prompt: string
}

/** The complete, shared worker specification. */
export interface WorkerSpec {
  /* identity ------------------------------------------------------- */
  id: string
  codename: string
  role: string
  mission: string
  category: WorkerCategory
  archetypeId: string
  accent: string

  /* business framing (the last-mile surface) ---------------------- */
  industry: string | null
  businessModel: string | null
  targetAudience: string | null
  brandVoice: string | null
  communicationStyle: string | null

  /* competency architecture (pre-built) --------------------------- */
  skillClusters: SkillCluster[]
  specializations: SpecOption[]
  activeSpecializationId: string
  knowledgeSources: string[]

  /* execution surface ---------------------------------------------- */
  tools: ToolBinding[]
  kpis: Kpi[]
  outcomes: OutcomeModel[]
  simulationScenarios: SimScenario[]

  /* policy --------------------------------------------------------- */
  autonomy: Autonomy
  approvalPolicy: ApprovalRule[]
  riskPolicy: string

  /* derived metadata ----------------------------------------------- */
  strength: number
  skillCount: number
}

/** Total skills across every cluster. */
export function countSkills(clusters: SkillCluster[]): number {
  return clusters.reduce((n, c) => n + c.skills.length, 0)
}

/** Human labels for customizable dot-paths (WORKER READY summary). */
export const FIELD_LABELS: Record<string, string> = {
  codename: "Worker name",
  role: "Role",
  mission: "Mission",
  industry: "Industry focus",
  businessModel: "Business model",
  targetAudience: "Target audience",
  brandVoice: "Brand voice",
  communicationStyle: "Communication style",
  activeSpecializationId: "Specialization",
  specializations: "Focus skills",
  knowledgeSources: "Knowledge sources",
  tools: "Tool permissions",
  kpis: "Success metrics",
  autonomy: "Autonomy level",
  approvalPolicy: "Approval policy",
  riskPolicy: "Risk policy",
}

export const AUTONOMY_COPY: Record<Autonomy, { label: string; blurb: string }> = {
  low: { label: "Recommend only", blurb: "Proposes; a human executes everything" },
  medium: { label: "Act with approval", blurb: "Acts on low-risk work, asks before consequential moves" },
  high: { label: "Autonomous", blurb: "Executes independently within its guardrails" },
}
