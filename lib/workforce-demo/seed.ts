/* ================================================================== *
 * DEMO WORKFORCE — the Marketing Intelligence division.
 *
 * Seven workers with a real reporting line, each owning Skills-as-IP
 * (execution recipes + learned heuristics) and a track record of
 * business outcomes. All values are illustrative demo data.
 * ------------------------------------------------------------------ */

import type { DemoWorker, Division, Heuristic, RecipeStep, Skill, WorkOutcome } from "./model"

export const DIVISION: Division = {
  id: "div-mktg",
  name: "Marketing Intelligence",
  mandate: "Grow qualified pipeline while holding blended CAC flat",
  primaryKpi: "Pipeline / CAC",
  createdAt: "2025-09-01",
}

/* --------------------------- helpers ------------------------------ */

function step(id: string, action: string, inputs: string[], output: string, seconds: number, tool?: string): RecipeStep {
  return { id, action, inputs, output, seconds, tool }
}

function heuristic(id: string, when: string, then: string, confidence: number, evidenceRuns: number, learnedFrom: string): Heuristic {
  return { id, when, then, confidence, evidenceRuns, learnedFrom }
}

/* ------------------------------ skills ---------------------------- *
 * Skills are owned by workers (see skillIds on each worker). The
 * recipe is the proprietary "how"; heuristics are the earned judgment. */

export const SKILLS: Skill[] = [
  /* ---- Vera — Market Intelligence ---- */
  {
    id: "sk-signal-scan",
    name: "Demand Signal Scan",
    category: "research",
    ip: "Fuses search, social and competitor motion into a single weekly demand index per segment.",
    maturity: "mastered",
    proficiency: 94,
    runs: 218,
    recipe: [
      step("s1", "Pull 90-day search & social volume by segment", ["segment list"], "raw demand series", 8, "Trends API"),
      step("s2", "Normalize against competitor share-of-voice", ["raw demand series", "SOV feed"], "relative demand", 6, "SOV feed"),
      step("s3", "Detect inflections & rank emerging segments", ["relative demand"], "ranked segments", 5),
      step("s4", "Draft the weekly demand index brief", ["ranked segments"], "demand brief", 7),
    ],
    heuristics: [
      heuristic("h1", "A segment's demand index rises 2 weeks running", "flag it to Paz for budget before competitors bid it up", 0.91, 41, "Q4 fitness-wearables surge"),
      heuristic("h2", "Search rises but social is flat", "treat as intent, not awareness — route to SEO, not paid social", 0.84, 27, "B2B tooling seasonality"),
    ],
  },
  {
    id: "sk-icp-mapping",
    name: "ICP & TAM Mapping",
    category: "research",
    ip: "Derives a living ICP from closed-won patterns instead of a static persona doc.",
    maturity: "expert",
    proficiency: 78,
    runs: 96,
    recipe: [
      step("s1", "Cluster closed-won accounts by firmographics", ["CRM export"], "won clusters", 9, "CRM"),
      step("s2", "Score open pipeline against clusters", ["won clusters", "open pipeline"], "fit scores", 6, "CRM"),
      step("s3", "Publish the refreshed ICP definition", ["fit scores"], "ICP v-next", 5),
    ],
    heuristics: [
      heuristic("h3", "A firmographic cluster's win-rate beats blended by 1.5x", "promote it to primary ICP and tell Iris to re-angle messaging", 0.79, 18, "mid-market ops teams"),
    ],
  },

  /* ---- Iris — Content Strategy ---- */
  {
    id: "sk-narrative",
    name: "Narrative Architecture",
    category: "content",
    ip: "Builds message hierarchies that survive from ad to landing page to sales call.",
    maturity: "expert",
    proficiency: 82,
    runs: 141,
    recipe: [
      step("s1", "Extract objections & language from win/loss calls", ["call transcripts"], "voice-of-customer", 8, "Transcripts"),
      step("s2", "Map objections to proof points", ["voice-of-customer", "proof library"], "message map", 6),
      step("s3", "Draft channel-adapted variants", ["message map"], "content variants", 9),
    ],
    heuristics: [
      heuristic("h4", "A proof point wins on calls but is absent from ads", "elevate it to the ad hook — largest untapped lift", 0.86, 22, "ROI-guarantee angle"),
      heuristic("h5", "Landing bounce >65% on a paid campaign", "message mismatch — realign LP headline to the ad promise first", 0.9, 34, "spring launch LP"),
    ],
  },

  /* ---- Paz — Paid Media ---- */
  {
    id: "sk-budget-alloc",
    name: "Budget Reallocation",
    category: "sales",
    ip: "Continuously reweights spend toward marginal-ROAS winners within CAC guardrails.",
    maturity: "mastered",
    proficiency: 91,
    runs: 302,
    recipe: [
      step("s1", "Pull spend, CAC & ROAS by channel (7/28d)", ["ad accounts"], "channel economics", 7, "Ads API"),
      step("s2", "Compute marginal ROAS & headroom", ["channel economics"], "reallocation plan", 5),
      step("s3", "Stage budget moves within guardrails", ["reallocation plan", "CAC guardrail"], "staged changes", 4),
      step("s4", "Request approval for moves over threshold", ["staged changes"], "approval request", 3, "Ads API"),
    ],
    heuristics: [
      heuristic("h6", "A channel's CAC rises >15% week-over-week", "shift 20% of its budget to the next-best ROAS channel", 0.93, 58, "Q3 iOS signal loss"),
      heuristic("h7", "ROAS climbs 3 days straight with headroom", "scale that channel 15% — but never >30% of blended budget", 0.88, 44, "holiday scale-up"),
    ],
  },

  /* ---- Ovi — Lifecycle & Email ---- */
  {
    id: "sk-lifecycle",
    name: "Lifecycle Orchestration",
    category: "communication",
    ip: "Sequences the next-best message per lead based on fit and intent decay.",
    maturity: "practiced",
    proficiency: 64,
    runs: 73,
    recipe: [
      step("s1", "Segment leads by fit score & intent recency", ["lead table"], "lifecycle segments", 6, "CRM"),
      step("s2", "Select next-best touch per segment", ["lifecycle segments", "template library"], "send plan", 5),
      step("s3", "Draft & queue sends for approval", ["send plan"], "queued sends", 6, "ESP"),
    ],
    heuristics: [
      heuristic("h8", "A high-fit lead goes quiet for 7 days", "trigger a proof-led re-engage, not a discount", 0.81, 19, "enterprise nurture"),
    ],
  },

  /* ---- Sol — Social & Community ---- */
  {
    id: "sk-social-pulse",
    name: "Social Pulse & Response",
    category: "communication",
    ip: "Turns community sentiment into next-week content and early risk warnings.",
    maturity: "practiced",
    proficiency: 58,
    runs: 61,
    recipe: [
      step("s1", "Aggregate mentions & sentiment by theme", ["social feeds"], "sentiment themes", 7, "Social API"),
      step("s2", "Flag rising negative themes", ["sentiment themes"], "risk flags", 4),
      step("s3", "Propose response content", ["sentiment themes"], "content ideas", 5),
    ],
    heuristics: [
      heuristic("h9", "A negative theme doubles in 48h", "escalate to lead before it hits reviews", 0.77, 12, "pricing-change backlash"),
    ],
  },

  /* ---- Rex — SEO & Web ---- */
  {
    id: "sk-seo-capture",
    name: "Intent Capture (SEO)",
    category: "research",
    ip: "Targets rising commercial-intent queries before competitors rank for them.",
    maturity: "expert",
    proficiency: 74,
    runs: 108,
    recipe: [
      step("s1", "Mine rising queries with commercial intent", ["search console", "demand brief"], "intent queries", 8, "Search Console"),
      step("s2", "Gap-analyze against current rankings", ["intent queries", "rank data"], "content gaps", 6),
      step("s3", "Brief the pages to build", ["content gaps"], "page briefs", 5),
    ],
    heuristics: [
      heuristic("h10", "A query shows rising intent and we rank 5-15", "prioritize it — fastest path to page 1", 0.85, 23, "comparison-page push"),
    ],
  },

  /* ---- Maky — Growth Lead (coordination skill) ---- */
  {
    id: "sk-orchestrate",
    name: "Growth Orchestration",
    category: "sales",
    ip: "Allocates the division's attention to the outcome with the highest marginal impact.",
    maturity: "mastered",
    proficiency: 89,
    runs: 176,
    recipe: [
      step("s1", "Read every worker's live outcomes & blockers", ["division state"], "division picture", 5),
      step("s2", "Rank interventions by marginal pipeline impact", ["division picture"], "priority queue", 6),
      step("s3", "Dispatch tasks & resolve cross-worker conflicts", ["priority queue"], "dispatched work", 5),
    ],
    heuristics: [
      heuristic("h11", "Two workers contend for the same budget", "fund the one with higher recent marginal ROAS, defer the other", 0.87, 29, "paid vs lifecycle contention"),
      heuristic("h12", "Pipeline is on-pace but CAC is drifting up", "protect CAC first — pipeline is a lagging trap", 0.9, 33, "growth-at-all-costs correction"),
    ],
  },
]

/* ------------------------------ workers --------------------------- */

export const WORKERS: DemoWorker[] = [
  {
    id: "w-maky",
    name: "Maky",
    initials: "MK",
    title: "Head of Growth",
    accent: "#5a6ef0",
    role: "lead",
    mandate: "Own the division's outcome: qualified pipeline at a flat blended CAC.",
    autonomy: "high",
    state: "working",
    skillIds: ["sk-orchestrate"],
    primaryKpi: "Pipeline / CAC",
    hiredAt: "2025-09-01",
  },
  {
    id: "w-vera",
    name: "Vera",
    initials: "VE",
    title: "Market Intelligence Analyst",
    accent: "#22b8cf",
    role: "specialist",
    managerId: "w-maky",
    mandate: "Find demand before the market prices it in.",
    autonomy: "high",
    state: "working",
    skillIds: ["sk-signal-scan", "sk-icp-mapping"],
    primaryKpi: "Demand lead time",
    hiredAt: "2025-09-03",
  },
  {
    id: "w-iris",
    name: "Iris",
    initials: "IR",
    title: "Content Strategist",
    accent: "#e64980",
    role: "specialist",
    managerId: "w-maky",
    mandate: "Make one true message win from ad to close.",
    autonomy: "medium",
    state: "learning",
    skillIds: ["sk-narrative"],
    primaryKpi: "Message → conversion",
    hiredAt: "2025-09-05",
  },
  {
    id: "w-paz",
    name: "Paz",
    initials: "PZ",
    title: "Paid Media Optimizer",
    accent: "#f59f00",
    role: "specialist",
    managerId: "w-maky",
    mandate: "Move every dollar to its highest marginal return within CAC guardrails.",
    autonomy: "medium",
    state: "blocked",
    skillIds: ["sk-budget-alloc"],
    primaryKpi: "Blended ROAS",
    hiredAt: "2025-09-04",
  },
  {
    id: "w-ovi",
    name: "Ovi",
    initials: "OV",
    title: "Lifecycle & Email",
    accent: "#7048e8",
    role: "specialist",
    managerId: "w-maky",
    mandate: "Send the next-best message to the right lead at the right moment.",
    autonomy: "medium",
    state: "idle",
    skillIds: ["sk-lifecycle"],
    primaryKpi: "Lead → SQL rate",
    hiredAt: "2025-09-08",
  },
  {
    id: "w-sol",
    name: "Sol",
    initials: "SO",
    title: "Social & Community",
    accent: "#12b886",
    role: "specialist",
    managerId: "w-maky",
    mandate: "Turn what people say into what we make next — and catch risk early.",
    autonomy: "low",
    state: "idle",
    skillIds: ["sk-social-pulse"],
    primaryKpi: "Sentiment & reach",
    hiredAt: "2025-09-10",
  },
  {
    id: "w-rex",
    name: "Rex",
    initials: "RX",
    title: "SEO & Web",
    accent: "#4c6ef5",
    role: "specialist",
    managerId: "w-maky",
    mandate: "Capture rising intent before competitors rank for it.",
    autonomy: "medium",
    state: "working",
    skillIds: ["sk-seo-capture"],
    primaryKpi: "Organic pipeline",
    hiredAt: "2025-09-06",
  },
]

/* ---------------------------- outcomes ---------------------------- */

export const OUTCOMES: WorkOutcome[] = [
  { id: "o1", workerId: "w-paz", skillId: "sk-budget-alloc", metric: "Blended CAC", delta: "−18%", tone: "down", summary: "Shifted $42k from a decaying channel to two marginal-ROAS winners over 3 weeks.", valueUsd: 61000, at: "2026-08-19" },
  { id: "o2", workerId: "w-vera", skillId: "sk-signal-scan", metric: "Demand lead time", delta: "+11 days", tone: "up", summary: "Flagged the wearables-recovery segment before competitors bid it up.", at: "2026-08-17" },
  { id: "o3", workerId: "w-iris", skillId: "sk-narrative", metric: "LP conversion", delta: "+2.4pts", tone: "up", summary: "Realigned the launch landing page to the winning ROI-guarantee proof point.", valueUsd: 38000, at: "2026-08-15" },
  { id: "o4", workerId: "w-rex", skillId: "sk-seo-capture", metric: "Organic pipeline", delta: "+$120k", tone: "up", summary: "Won page-1 for six rising comparison queries we already ranked 5–12 for.", valueUsd: 120000, at: "2026-08-12" },
  { id: "o5", workerId: "w-vera", skillId: "sk-icp-mapping", metric: "Win rate", delta: "+1.6x", tone: "up", summary: "Promoted mid-market ops teams to primary ICP after win-rate divergence.", at: "2026-08-09" },
  { id: "o6", workerId: "w-ovi", skillId: "sk-lifecycle", metric: "Lead → SQL", delta: "+6.2%", tone: "up", summary: "Replaced the discount re-engage with a proof-led sequence for high-fit leads.", valueUsd: 24000, at: "2026-08-06" },
]

/** Skill lineage — proof that IP transfers between workers. */
export const SKILL_LINEAGE: { skillId: string; fromWorkerId: string; toWorkerId: string; at: string; note: string }[] = [
  { skillId: "sk-signal-scan", fromWorkerId: "w-vera", toWorkerId: "w-rex", at: "2026-07-28", note: "Rex inherited demand-scan judgment to seed intent capture." },
]
