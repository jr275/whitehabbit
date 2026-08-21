/* ------------------------------------------------------------------ *
 * Intent extraction — turns a natural-language brief (typed or spoken)
 * into a structured set of proposed spec changes.
 *
 * Fully deterministic keyword matching: the same brief always yields
 * the same specification, and every change is shown to the user before
 * anything is applied. The Worker is NEVER modified silently.
 * ------------------------------------------------------------------ */

import type { Autonomy, WorkerCategory, WorkerSpec } from "./spec-model"

/** A single proposed change, grouped by transformation stage. */
export interface SpecChange {
  id: string
  stage: IntentStage
  label: string
  value: string
}

export type IntentStage =
  | "intent"
  | "skills"
  | "specialization"
  | "tools"
  | "autonomy"
  | "kpis"
  | "approval"

export const STAGE_ORDER: IntentStage[] = [
  "intent",
  "skills",
  "specialization",
  "tools",
  "autonomy",
  "kpis",
  "approval",
]

export const STAGE_LABEL: Record<IntentStage, string> = {
  intent: "Intent",
  skills: "Skills",
  specialization: "Specialization",
  tools: "Tools",
  autonomy: "Autonomy",
  kpis: "KPIs",
  approval: "Approval policies",
}

export interface Extraction {
  transcript: string
  /** Best-guess worker category for from-scratch creation. */
  category: WorkerCategory | null
  role: string | null
  industry: string | null
  market: string | null
  autonomy: Autonomy | null
  primaryKpi: string | null
  secondaryKpi: string | null
  focusSkills: string[]
  approvals: string[]
  changes: SpecChange[]
}

/* --------------------------- dictionaries ------------------------- */

const INDUSTRY_MAP: [RegExp, string][] = [
  [/\btravel\b/i, "Travel"],
  [/\bb2b saas\b|\bsaas\b/i, "B2B SaaS"],
  [/\be-?commerce\b|\bonline store\b|\bretail\b/i, "E-commerce"],
  [/\bmarketplace\b/i, "Marketplace"],
  [/\bfintech\b|\bfinancial services\b/i, "Fintech"],
  [/\bhealthcare\b|\bhealth\b/i, "Healthcare"],
  [/\bconsumer\b|\bbrand\b|\bcpg\b/i, "Consumer"],
  [/\bmanufactur/i, "Manufacturing"],
  [/\blogistics\b|\bsupply chain\b/i, "Logistics"],
]

const MARKET_MAP: [RegExp, string][] = [
  [/\bbrazil\b|\bbrasil\b/i, "Brazil"],
  [/\bunited states\b|\bu\.?s\.?\b|\bnorth america\b/i, "United States"],
  [/\beurope\b|\beu\b|\bemea\b/i, "Europe"],
  [/\blatam\b|\blatin america\b/i, "LATAM"],
  [/\basia\b|\bapac\b/i, "APAC"],
]

const CATEGORY_MAP: [RegExp, WorkerCategory, string][] = [
  [/\bmarketing\b|\bgrowth\b|\bcampaign\b|\bacquisition\b|\bpaid media\b/i, "marketing", "Marketing Intelligence"],
  [/\bfinance\b|\bcash flow\b|\baccounts payable\b|\binvoice\b|\bsupplier\b/i, "finance", "Finance Intelligence"],
  [/\bsales\b|\brevenue\b|\bpipeline\b|\bdeals?\b/i, "sales", "Sales & Revenue"],
  [/\blegal\b|\bcontract\b|\bcompliance\b/i, "legal", "Legal Operations"],
  [/\boperations?\b|\bsupply\b|\binventory\b|\blogistics\b/i, "operations", "Operations Intelligence"],
  [/\bpeople\b|\bhr\b|\btalent\b|\battrition\b|\bretention\b/i, "people", "People Intelligence"],
  [/\bcontent\b|\breadability\b|\beditorial\b|\bseo\b/i, "content", "Content Intelligence"],
]

const KPI_MAP: [RegExp, string][] = [
  [/\bcontribution margin\b/i, "Contribution margin"],
  [/\bltv\s*\/\s*cac\b|\bltv to cac\b/i, "LTV / CAC"],
  [/\bltv\b/i, "LTV"],
  [/\bcac\b/i, "CAC"],
  [/\broas\b/i, "ROAS"],
  [/\bpipeline\b/i, "Pipeline generated"],
  [/\brevenue\b/i, "Revenue"],
  [/\bcash flow\b/i, "Cash flow"],
  [/\bmargin\b/i, "Gross margin"],
  [/\bchurn\b|\bretention\b/i, "Retention"],
  [/\bwin rate\b/i, "Win rate"],
]

const SKILL_MAP: [RegExp, string][] = [
  [/\bcompetitor|\bcompetition\b/i, "Competitor Intelligence"],
  [/\bpaid media\b|\bpaid acquisition\b|\bads?\b/i, "Paid Media Intelligence"],
  [/\bltv\b/i, "LTV Intelligence"],
  [/\bcampaign\b/i, "Campaign Intelligence"],
  [/\btrend/i, "Trend Detection"],
  [/\bacquisition\b/i, "Acquisition Efficiency"],
  [/\bcash flow\b/i, "Cash Flow Intelligence"],
  [/\banomal/i, "AP Anomaly Detection"],
  [/\bsupplier\b|\bnegotiat/i, "Supplier Negotiation Intelligence"],
  [/\bdiscount/i, "Discount Optimization"],
  [/\bpipeline\b/i, "Pipeline Intelligence"],
  [/\bcontent\b|\bseo\b/i, "Content Intelligence"],
  [/\breadability\b/i, "Readability Intelligence"],
]

/* --------------------------- extraction --------------------------- */

function firstMatch<T>(text: string, table: [RegExp, T][]): T | null {
  for (const [re, val] of table) if (re.test(text)) return val
  return null
}

function firstMatch3(text: string): [WorkerCategory, string] | null {
  for (const [re, cat, role] of CATEGORY_MAP) if (re.test(text)) return [cat, role]
  return null
}

function detectAutonomy(text: string): Autonomy | null {
  const t = text.toLowerCase()
  const needsApproval =
    /\bask (me )?before\b|\bwithout (my )?approval\b|\brequire[sd]? approval\b|\bmust ask\b|\bnever (make|change|execute)\b|\bapproval required\b/.test(
      t,
    )
  const recommendOnly = /\brecommend only\b|\brecommendations? only\b|\bsuggest only\b|\bdon'?t (execute|act)\b/.test(t)
  const autonomous = /\bautomatically\b|\bautonomous(ly)?\b|\bon its own\b|\bwithout asking\b/.test(t)

  if (recommendOnly) return "low"
  if (autonomous && !needsApproval) return "high"
  if (autonomous && needsApproval) return "medium"
  if (needsApproval) return "medium"
  return null
}

function detectApprovals(text: string): string[] {
  const t = text.toLowerCase()
  const out: string[] = []
  if (/\bbudget/.test(t)) out.push("Budget changes")
  if (/\bpayment/.test(t)) out.push("Payments")
  if (/\bsupplier/.test(t)) out.push("Supplier changes")
  if (/\bpublish|\bposting\b|\bsocial\b/.test(t)) out.push("Publishing content")
  if (/\bsend|\boutreach|\bemail/.test(t)) out.push("Outbound sends")
  if (/\bsign|\bexecute\b|\bcommit/.test(t)) out.push("Execution / signing")
  return Array.from(new Set(out))
}

/**
 * Parse a brief into a structured extraction plus an ordered list of
 * proposed changes for the VOICE -> ... -> WORKER transformation.
 */
export function extractIntent(brief: string, base?: WorkerSpec): Extraction {
  const text = brief.trim()
  const category3 = firstMatch3(text)
  const category = category3?.[0] ?? base?.category ?? null
  const role = category3?.[1] ?? base?.role ?? null
  const industry = firstMatch(text, INDUSTRY_MAP)
  const market = firstMatch(text, MARKET_MAP)
  const autonomy = detectAutonomy(text)
  const approvals = detectApprovals(text)

  const kpis: string[] = []
  for (const [re, label] of KPI_MAP) {
    if (re.test(text) && !kpis.includes(label)) kpis.push(label)
  }
  const primaryKpi = kpis[0] ?? null
  const secondaryKpi = kpis[1] ?? null

  const focusSkills: string[] = []
  for (const [re, label] of SKILL_MAP) {
    if (re.test(text) && !focusSkills.includes(label)) focusSkills.push(label)
  }

  /* build the ordered change list ---------------------------------- */
  const changes: SpecChange[] = []
  const push = (stage: IntentStage, label: string, value: string) =>
    changes.push({ id: `${stage}-${changes.length}`, stage, label, value })

  if (role) push("intent", "Role", role)
  if (industry) push("intent", "Industry", industry)
  if (market) push("intent", "Market", market)

  focusSkills.slice(0, 5).forEach((s) => push("skills", "Focus skill", s))

  if (base) push("specialization", "Specialization", specializationFor(base, industry, market))

  if (approvals.length) push("tools", "Gated tools", `${approvals.length} action${approvals.length > 1 ? "s" : ""} require approval`)

  if (autonomy) push("autonomy", "Autonomy", autonomyLabel(autonomy))

  if (primaryKpi) push("kpis", "Primary KPI", primaryKpi)
  if (secondaryKpi) push("kpis", "Secondary KPI", secondaryKpi)

  approvals.forEach((a) => push("approval", "Requires approval", a))

  return {
    transcript: text,
    category,
    role,
    industry,
    market,
    autonomy,
    primaryKpi,
    secondaryKpi,
    focusSkills,
    approvals,
    changes,
  }
}

function autonomyLabel(a: Autonomy): string {
  return a === "low" ? "Recommend only" : a === "high" ? "Autonomous" : "Act with approval"
}

function specializationFor(base: WorkerSpec, industry: string | null, market: string | null): string {
  if (industry === "B2B SaaS") return "B2B SaaS Growth"
  if (industry === "E-commerce") return "E-commerce Performance"
  if (industry === "Consumer") return "Consumer Brand"
  if (market) return `${base.role.split(" ")[0]} · ${market}`
  const active = base.specializations.find((s) => s.id === base.activeSpecializationId)
  return active?.label ?? base.specializations[0]?.label ?? "General"
}

/** Confidence heuristic (0-100) for how much the brief pinned down. */
export function extractionConfidence(e: Extraction): number {
  let score = 40
  if (e.role) score += 12
  if (e.industry) score += 10
  if (e.market) score += 6
  if (e.autonomy) score += 10
  if (e.primaryKpi) score += 10
  if (e.focusSkills.length) score += Math.min(12, e.focusSkills.length * 3)
  return Math.min(98, score)
}
