/* ------------------------------------------------------------------ *
 * WhiteHabbit — SHARED OPERATIONAL DATASET
 *
 * One deterministic source of truth behind the operational surfaces
 * (/studio, /outputs, and later Overview/Activity). It builds on the
 * pure worker model in lib/worker.ts — never duplicating it — and adds
 * the build-time configuration and the concrete artifacts the worker
 * has produced. No React, no rendering, no randomness.
 * ------------------------------------------------------------------ */

import {
  CAPABILITY_DETAIL,
  CAPABILITY_META,
  type CapabilityId,
  IDENTITY,
  KNOWLEDGE_GROUPS,
  MEMORY_SIGNALS,
  PERMISSIONS,
  POLICIES,
} from "./worker"

/* re-export the primitives the surfaces lean on, so pages import from
 * a single operational entrypoint */
export {
  CAPABILITY_DETAIL,
  CAPABILITY_META,
  IDENTITY,
  KNOWLEDGE_GROUPS,
  MEMORY_SIGNALS,
  PERMISSIONS,
  POLICIES,
}
export type { CapabilityId }

/* ============================ STUDIO ============================== *
 * Build-time configuration — how the worker is shaped. These are the
 * knobs a builder turns; the Fabric is the running consequence.
 * ================================================================== */

/* Tools / integrations a worker can be wired into. */
export type ConnectionState = "connected" | "available" | "action_required"

export interface Integration {
  id: string
  name: string
  category: string
  state: ConnectionState
  /** which capability this tool attaches to */
  capability: CapabilityId
  detail: string
}

export const INTEGRATIONS: Integration[] = [
  { id: "salesforce", name: "Salesforce", category: "CRM", state: "connected", capability: "execution", detail: "Read + write · 5,210 records" },
  { id: "gmail", name: "Gmail", category: "Email", state: "connected", capability: "communication", detail: "Send on behalf · 2,980 sent" },
  { id: "slack", name: "Slack", category: "Messaging", state: "connected", capability: "communication", detail: "3 channels" },
  { id: "calendar", name: "Google Calendar", category: "Scheduling", state: "connected", capability: "execution", detail: "184 meetings booked" },
  { id: "apollo", name: "Apollo", category: "Data", state: "connected", capability: "research", detail: "Enrichment · 1,284 lookups" },
  { id: "linkedin", name: "LinkedIn", category: "Data", state: "action_required", capability: "research", detail: "Re-auth required" },
  { id: "docusign", name: "DocuSign", category: "Contracts", state: "available", capability: "execution", detail: "Not connected" },
  { id: "hubspot", name: "HubSpot", category: "CRM", state: "available", capability: "execution", detail: "Not connected" },
]

/* A guardrail the builder sets — mirrors a policy but is configurable. */
export interface Guardrail {
  id: string
  label: string
  value: string
  kind: "limit" | "gate" | "window"
}

export const GUARDRAILS: Guardrail[] = [
  { id: "conf", label: "Minimum decision confidence", value: "80%", kind: "limit" },
  { id: "approve", label: "Human approval before", value: "Sending contracts", kind: "gate" },
  { id: "quiet", label: "Outreach window", value: "8:00 – 20:00 local", kind: "window" },
  { id: "volume", label: "Max daily outreach", value: "60 messages", kind: "limit" },
]

/* Autonomy is a spectrum, surfaced as a single dial in Studio. */
export const AUTONOMY_LEVELS: { level: number; label: string; blurb: string }[] = [
  { level: 0, label: "Suggest", blurb: "Drafts everything, sends nothing" },
  { level: 1, label: "Assist", blurb: "Acts on low-risk steps, asks on the rest" },
  { level: 2, label: "Operate", blurb: "Acts autonomously, pauses at guardrails" },
  { level: 3, label: "Own", blurb: "Full ownership within policy" },
]
/** Atlas currently sits at Operate. */
export const CURRENT_AUTONOMY = 2

/* Deployment / schedule config. */
export const DEPLOYMENT = {
  status: "Live",
  environment: "Production",
  trigger: "Continuous — pulls from qualification queue",
  region: "us-east",
  since: "9 days ago",
}

/* Capability config rows for the Studio capability editor. Derived from
 * the pure model, enriched with an enabled flag + a build role. */
export interface CapabilityConfig {
  id: CapabilityId
  name: string
  role: string
  enabled: boolean
  weak?: boolean
}

export const CAPABILITY_CONFIG: CapabilityConfig[] = [
  { id: "research", name: "Research", role: "Finds and verifies signal", enabled: true },
  { id: "reasoning", name: "Reasoning", role: "Scores intent and decides", enabled: true },
  { id: "communication", name: "Communication", role: "Drafts and speaks", enabled: true, weak: true },
  { id: "execution", name: "Execution", role: "Acts on systems of record", enabled: true },
  { id: "reliability", name: "Reliability", role: "Guards every cycle", enabled: true },
  { id: "memory", name: "Memory", role: "Accumulates context over time", enabled: true },
]

/* ============================ OUTPUTS ============================= *
 * The concrete things the worker has actually produced — the reason it
 * exists. Each artifact carries its content preview and its provenance
 * (the capability chain that made it), so an output is never a mystery.
 * ================================================================== */

export type OutputType = "lead" | "message" | "meeting" | "crm" | "contract" | "report"

export type OutputStatus =
  | "delivered"
  | "draft"
  | "awaiting_approval"
  | "sent"
  | "rejected"
  | "scheduled"

export interface OutputArtifact {
  id: string
  type: OutputType
  title: string
  company: string
  contact?: string
  status: OutputStatus
  confidence: number
  when: string
  ts: number
  summary: string
  /** the actual artifact content — an email body, a memo, terms, etc. */
  body?: string
  /** provenance: the capability chain that produced this */
  chain: CapabilityId[]
  metrics?: { label: string; value: string }[]
}

export const OUTPUT_TYPE_META: Record<
  OutputType,
  { label: string; plural: string }
> = {
  lead: { label: "Qualified lead", plural: "Qualified leads" },
  message: { label: "Message", plural: "Messages" },
  meeting: { label: "Meeting", plural: "Meetings" },
  crm: { label: "CRM update", plural: "CRM updates" },
  contract: { label: "Contract", plural: "Contracts" },
  report: { label: "Report", plural: "Reports" },
}

export const OUTPUTS: OutputArtifact[] = [
  {
    id: "o-1042",
    type: "message",
    title: "Outreach to Dana Whitfield",
    company: "Acme Corporation",
    contact: "Dana Whitfield · VP Sales",
    status: "sent",
    confidence: 94,
    when: "2m ago",
    ts: 1000,
    summary: "Personalized first-touch referencing their RevOps expansion.",
    body:
      "Hi Dana,\n\nSaw Acme just brought on three RevOps hires this quarter — usually the signal that pipeline visibility has outgrown the current stack.\n\nWe help enterprise sales teams like yours turn scattered signal into qualified pipeline automatically. Worth 15 minutes next week?\n\n— Atlas, on behalf of the team",
    chain: ["research", "reasoning", "communication", "execution"],
    metrics: [
      { label: "ICP fit", value: "92%" },
      { label: "Evidence", value: "9 items" },
      { label: "Send window", value: "On policy" },
    ],
  },
  {
    id: "o-1041",
    type: "lead",
    title: "Acme Corporation qualified",
    company: "Acme Corporation",
    contact: "Dana Whitfield · VP Sales",
    status: "delivered",
    confidence: 92,
    when: "4m ago",
    ts: 990,
    summary: "Enterprise fit confirmed. Budget authority and active RevOps buildout.",
    body:
      "QUALIFICATION MEMO — Acme Corporation\n\n• Segment: Enterprise (1,200 employees)\n• Buyer: Dana Whitfield, VP Sales — verified economic buyer\n• Signals: 3 RevOps hires in 90 days, Series-C, expanding GTM\n• Budget: Procurement activity detected\n• ICP confidence: 92% (above 80% bar)\n\nRecommendation: advance to outreach.",
    chain: ["research", "reasoning"],
    metrics: [
      { label: "Sources", value: "14" },
      { label: "Evidence", value: "9 items" },
      { label: "Confidence", value: "92%" },
    ],
  },
  {
    id: "o-1040",
    type: "meeting",
    title: "Discovery call — Globex",
    company: "Globex",
    contact: "Marcus Lin · Director RevOps",
    status: "scheduled",
    confidence: 88,
    when: "18m ago",
    ts: 900,
    summary: "30-minute discovery booked for Thursday 11:00.",
    body:
      "MEETING CONFIRMED — Globex\n\n• With: Marcus Lin, Director of RevOps\n• When: Thursday, 11:00–11:30 (local)\n• Type: Discovery\n• Prep: Qualification memo + 2 relevant case studies attached\n• Calendar: Google Calendar invite sent + accepted",
    chain: ["reasoning", "communication", "execution"],
    metrics: [
      { label: "Reply time", value: "3h" },
      { label: "Confidence", value: "88%" },
    ],
  },
  {
    id: "o-1039",
    type: "contract",
    title: "Contract — Northwind",
    company: "Northwind",
    contact: "Priya Nair · CRO",
    status: "awaiting_approval",
    confidence: 94,
    when: "24m ago",
    ts: 850,
    summary: "Prepared, held at the approval gate. Value $96,500 ACV.",
    body:
      "CONTRACT DRAFT — Northwind\n\n• ACV: $96,500\n• Term: 12 months\n• Seats: 45\n• Prepared by: Execution capability\n• Status: HELD — policy requires human approval before sending\n\nThe worker will not send this until a human approves.",
    chain: ["research", "reasoning", "communication", "reliability"],
    metrics: [
      { label: "ACV", value: "$96,500" },
      { label: "Confidence", value: "94%" },
      { label: "Gate", value: "Human approval" },
    ],
  },
  {
    id: "o-1038",
    type: "crm",
    title: "CRM updated — Initech",
    company: "Initech",
    contact: "Sofia Ramos · Head of Growth",
    status: "delivered",
    confidence: 97,
    when: "41m ago",
    ts: 800,
    summary: "Opportunity stage advanced to Discovery with enriched contact data.",
    body:
      "CRM WRITE — Initech (Salesforce)\n\n• Opportunity: Initech — Enterprise\n• Stage: Prospecting → Discovery\n• Contact enriched: Sofia Ramos (title, seniority, email verified)\n• Next step logged: Discovery call\n• Confidence: 97%",
    chain: ["reasoning", "execution", "memory"],
    metrics: [
      { label: "Fields written", value: "6" },
      { label: "Confidence", value: "97%" },
    ],
  },
  {
    id: "o-1037",
    type: "message",
    title: "Follow-up to Marcus Lin",
    company: "Globex",
    contact: "Marcus Lin · Director RevOps",
    status: "draft",
    confidence: 79,
    when: "1h ago",
    ts: 700,
    summary: "Second-touch draft held — communication confidence below threshold.",
    body:
      "Hi Marcus,\n\nFollowing up on the pipeline visibility piece — I pulled a short teardown of how a similar Series-B RevOps team cut manual qualification by 60%.\n\nHappy to walk through it on our call Thursday, or send ahead if useful.\n\n— Atlas",
    chain: ["reasoning", "communication"],
    metrics: [
      { label: "Confidence", value: "79%" },
      { label: "Held", value: "Below 80% bar" },
    ],
  },
  {
    id: "o-1036",
    type: "lead",
    title: "Northwind qualified",
    company: "Northwind",
    contact: "Priya Nair · CRO",
    status: "delivered",
    confidence: 90,
    when: "1h ago",
    ts: 690,
    summary: "Strong enterprise fit. CRO identified as economic buyer.",
    body:
      "QUALIFICATION MEMO — Northwind\n\n• Segment: Enterprise (900 employees)\n• Buyer: Priya Nair, CRO — verified economic buyer\n• Signals: New GTM leadership, budget cycle open\n• ICP confidence: 90%\n\nRecommendation: advance to contract preparation.",
    chain: ["research", "reasoning"],
    metrics: [
      { label: "Sources", value: "11" },
      { label: "Confidence", value: "90%" },
    ],
  },
  {
    id: "o-1035",
    type: "report",
    title: "Weekly pipeline digest",
    company: "All accounts",
    status: "delivered",
    confidence: 100,
    when: "2h ago",
    ts: 600,
    summary: "Rolling summary of qualified pipeline, meetings, and at-risk accounts.",
    body:
      "WEEKLY DIGEST\n\n• Pipeline generated: $412K\n• Meetings booked: 184\n• Qualified leads: 1,284\n• Win-rate signal: +6% vs prior week\n• At risk: 2 accounts stalled > 14 days\n\nTop mover: Acme Corporation (advanced to outreach).",
    chain: ["memory", "reasoning", "communication"],
    metrics: [
      { label: "Pipeline", value: "$412K" },
      { label: "Meetings", value: "184" },
    ],
  },
  {
    id: "o-1034",
    type: "message",
    title: "Rejected — Umbrella Co",
    company: "Umbrella Co",
    contact: "—",
    status: "rejected",
    confidence: 61,
    when: "3h ago",
    ts: 500,
    summary: "Not qualified. Weak budget signal, no verified buyer.",
    body:
      "REJECTION RATIONALE — Umbrella Co\n\n• Budget signal: weak (no procurement activity)\n• ICP confidence: 61% (below 80% bar)\n• Economic buyer: not identified\n\nThe worker chose not to spend outreach here.",
    chain: ["research", "reasoning"],
    metrics: [
      { label: "Confidence", value: "61%" },
      { label: "Decision", value: "Do not pursue" },
    ],
  },
  {
    id: "o-1033",
    type: "meeting",
    title: "Discovery call — Initech",
    company: "Initech",
    contact: "Sofia Ramos · Head of Growth",
    status: "scheduled",
    confidence: 85,
    when: "4h ago",
    ts: 400,
    summary: "Discovery booked for Monday 15:30.",
    body:
      "MEETING CONFIRMED — Initech\n\n• With: Sofia Ramos, Head of Growth\n• When: Monday, 15:30–16:00 (local)\n• Type: Discovery\n• Calendar invite sent",
    chain: ["communication", "execution"],
    metrics: [{ label: "Confidence", value: "85%" }],
  },
  {
    id: "o-1032",
    type: "crm",
    title: "CRM updated — Globex",
    company: "Globex",
    contact: "Marcus Lin · Director RevOps",
    status: "delivered",
    confidence: 96,
    when: "5h ago",
    ts: 300,
    summary: "Logged discovery call and enriched account firmographics.",
    body:
      "CRM WRITE — Globex (Salesforce)\n\n• Account firmographics enriched\n• Activity logged: discovery scheduled\n• Contact role confirmed: Director, RevOps\n• Confidence: 96%",
    chain: ["execution", "memory"],
    metrics: [{ label: "Fields written", value: "4" }],
  },
  {
    id: "o-1031",
    type: "message",
    title: "Outreach to Sofia Ramos",
    company: "Initech",
    contact: "Sofia Ramos · Head of Growth",
    status: "sent",
    confidence: 91,
    when: "6h ago",
    ts: 200,
    summary: "First-touch referencing their recent product launch.",
    body:
      "Hi Sofia,\n\nCongrats on the launch last week — momentum like that usually means the growth team is about to feel every gap in the qualification process.\n\nWe help teams keep pipeline quality high while volume scales. Open to a quick call?\n\n— Atlas",
    chain: ["research", "reasoning", "communication", "execution"],
    metrics: [
      { label: "ICP fit", value: "89%" },
      { label: "Confidence", value: "91%" },
    ],
  },
]

/* Output status presentation — tone drives the light-surface color. */
export const OUTPUT_STATUS_META: Record<
  OutputStatus,
  { label: string; tone: "good" | "info" | "warn" | "bad" | "muted" }
> = {
  delivered: { label: "Delivered", tone: "good" },
  sent: { label: "Sent", tone: "good" },
  scheduled: { label: "Scheduled", tone: "info" },
  draft: { label: "Draft", tone: "muted" },
  awaiting_approval: { label: "Awaiting approval", tone: "warn" },
  rejected: { label: "Rejected", tone: "bad" },
}

/* Top-line output tallies for the Outputs header + Overview. */
export const OUTPUT_TOTALS: { type: OutputType; value: string }[] = [
  { type: "lead", value: "1,284" },
  { type: "message", value: "2,980" },
  { type: "meeting", value: "184" },
  { type: "crm", value: "5,210" },
  { type: "contract", value: "23" },
  { type: "report", value: "48" },
]

/* Small helper: derive counts for the current OUTPUTS sample by type. */
export function outputCountsByType(): Record<OutputType, number> {
  const base = { lead: 0, message: 0, meeting: 0, crm: 0, contract: 0, report: 0 }
  for (const o of OUTPUTS) base[o.type] += 1
  return base
}
