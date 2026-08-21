/* ------------------------------------------------------------------ *
 * Prefab workers — professionally designed, ready-to-configure builds.
 *
 * Every prefab is a COMPLETE WorkerSpec: identity, competency
 * architecture, specializations, tools, KPIs, outcomes, simulation
 * scenarios and policy all ship pre-built. The user configures only
 * the final 10-20% (industry, KPIs, autonomy, approvals).
 * ------------------------------------------------------------------ */

import { countSkills, type WorkerSpec } from "./spec-model"

/** Fill derived fields so each prefab stays internally consistent. */
function seal(spec: Omit<WorkerSpec, "skillCount">): WorkerSpec {
  return { ...spec, skillCount: countSkills(spec.skillClusters) }
}

/* ------------------------------- MAKY ----------------------------- */
const MAKY = seal({
  id: "maky",
  codename: "MAKY",
  role: "Marketing & Growth Strategist",
  mission:
    "Turn market intelligence, customer behavior, campaign performance and content signals into measurable growth decisions and executed marketing actions.",
  category: "marketing",
  archetypeId: "strategist",
  accent: "oklch(0.62 0.19 25)",
  industry: null,
  businessModel: null,
  targetAudience: null,
  brandVoice: null,
  communicationStyle: "Executive, evidence-led, decisive",
  skillClusters: [
    {
      name: "Market Intelligence",
      category: "research",
      skills: [
        "Competitor analysis",
        "Market trend detection",
        "Category intelligence",
        "Pricing intelligence",
        "Share-of-voice analysis",
        "Demand signals",
        "Emerging opportunity detection",
      ],
    },
    {
      name: "Customer Intelligence",
      category: "research",
      skills: [
        "Segmentation",
        "Cohort analysis",
        "Customer journey analysis",
        "Behavioral analysis",
        "Churn signals",
        "LTV analysis",
        "LTV prediction",
        "Value segmentation",
      ],
    },
    {
      name: "Campaign Intelligence",
      category: "reasoning",
      skills: [
        "CAC",
        "ROAS / ROI",
        "Incremental ROI",
        "Attribution analysis",
        "Campaign profitability",
        "Channel efficiency",
        "Creative performance",
        "Budget allocation",
        "Campaign forecasting",
      ],
    },
    {
      name: "Content Intelligence",
      category: "research",
      skills: [
        "SEO / AEO / GEO",
        "Topic discovery",
        "Content gap analysis",
        "Competitor content analysis",
        "Search intent",
        "Content clustering",
        "Readability",
        "Audience comprehension",
      ],
    },
    {
      name: "Growth Strategy",
      category: "reasoning",
      skills: [
        "Experiment design",
        "Growth forecasting",
        "Scenario modeling",
        "Budget optimization",
        "Channel allocation",
        "Hypothesis generation",
        "Experiment prioritization",
      ],
    },
    {
      name: "Execution",
      category: "execution",
      skills: [
        "Campaign creation",
        "Content creation",
        "Social publishing",
        "Campaign optimization",
        "Comment management",
      ],
    },
  ],
  specializations: [
    { id: "b2b-saas", label: "B2B SaaS Growth", description: "Pipeline-led, LTV/CAC-optimized demand generation" },
    { id: "ecommerce", label: "E-commerce Performance", description: "ROAS, contribution margin & retention economics" },
    { id: "consumer", label: "Consumer Brand", description: "Share-of-voice, brand lift & category expansion" },
    { id: "marketplace", label: "Marketplace Growth", description: "Two-sided acquisition & liquidity balancing" },
  ],
  activeSpecializationId: "b2b-saas",
  knowledgeSources: [
    "Ad platform exports (Meta, Google, LinkedIn)",
    "Web & product analytics",
    "CRM pipeline data",
    "Competitor & category corpus",
  ],
  tools: [
    { id: "ga4", label: "Analytics warehouse", requiresApproval: false, connected: true },
    { id: "ads", label: "Ad platforms", requiresApproval: true, connected: false },
    { id: "cms", label: "CMS / publishing", requiresApproval: true, connected: false },
    { id: "crm", label: "CRM", requiresApproval: false, connected: true },
  ],
  kpis: [
    { id: "ltv-cac", label: "LTV / CAC", weight: "primary" },
    { id: "cm", label: "Contribution margin", weight: "primary" },
    { id: "pipeline", label: "Pipeline generated", weight: "secondary" },
    { id: "roas", label: "Blended ROAS", weight: "secondary" },
  ],
  outcomes: [
    { id: "reallocation", label: "Budget reallocation", impact: "+11-16% contribution margin" },
    { id: "churn", label: "Churn-risk cohort defense", impact: "-8-12% logo churn" },
    { id: "content", label: "Search intent capture", impact: "+20-35% qualified organic" },
  ],
  simulationScenarios: [
    { id: "budget", title: "Reallocate a wasteful campaign", prompt: "Campaign B has 38% lower 180-day LTV — decide the reallocation." },
    { id: "trend", title: "React to an emerging trend", prompt: "A competitor just cut prices 15% in your core category." },
    { id: "content", title: "Close a content gap", prompt: "You rank page-2 for a high-intent commercial query." },
  ],
  autonomy: "medium",
  approvalPolicy: [
    { id: "budget", label: "Campaign budget changes" },
    { id: "publish", label: "Publishing external content" },
  ],
  riskPolicy: "Never change spend or publish externally without approval.",
  strength: 82,
})

/* ------------------------------- OPY ------------------------------ */
const OPY = seal({
  id: "opy",
  codename: "OPY",
  role: "Operations Intelligence Worker",
  mission:
    "Detect process friction, predict operational risk and orchestrate efficiency improvements across the supply and delivery chain.",
  category: "operations",
  archetypeId: "operator",
  accent: "oklch(0.6 0.13 220)",
  industry: null,
  businessModel: null,
  targetAudience: null,
  brandVoice: null,
  communicationStyle: "Precise, systems-oriented, calm",
  skillClusters: [
    { name: "Process Intelligence", category: "research", skills: ["Bottleneck detection", "Cycle-time analysis", "Throughput modeling", "SLA monitoring", "Variance analysis"] },
    { name: "Supply Intelligence", category: "research", skills: ["Demand forecasting", "Inventory optimization", "Supplier risk", "Lead-time analysis", "Stockout prediction"] },
    { name: "Efficiency Reasoning", category: "reasoning", skills: ["Root-cause analysis", "Capacity planning", "Scenario modeling", "Cost-to-serve", "Prioritization"] },
    { name: "Orchestration", category: "execution", skills: ["Workflow automation", "Alert routing", "Task dispatch", "Exception handling"] },
  ],
  specializations: [
    { id: "supply", label: "Supply Chain", description: "Inventory, suppliers & logistics reliability" },
    { id: "service-ops", label: "Service Operations", description: "SLA, queue & workforce optimization" },
    { id: "manufacturing", label: "Manufacturing", description: "Throughput, yield & downtime reduction" },
  ],
  activeSpecializationId: "supply",
  knowledgeSources: ["ERP data", "WMS / inventory feeds", "Ticketing & SLA logs", "Supplier scorecards"],
  tools: [
    { id: "erp", label: "ERP", requiresApproval: false, connected: true },
    { id: "wms", label: "Warehouse system", requiresApproval: true, connected: false },
    { id: "alerting", label: "Alerting", requiresApproval: false, connected: true },
  ],
  kpis: [
    { id: "otif", label: "On-time-in-full", weight: "primary" },
    { id: "cost-serve", label: "Cost to serve", weight: "primary" },
    { id: "cycle", label: "Cycle time", weight: "secondary" },
  ],
  outcomes: [
    { id: "stockout", label: "Stockout prevention", impact: "-30-45% stockout events" },
    { id: "cycle", label: "Cycle-time reduction", impact: "-12-18% median cycle time" },
  ],
  simulationScenarios: [
    { id: "supplier", title: "Supplier at risk", prompt: "A key supplier's lead time just doubled — decide the response." },
    { id: "spike", title: "Demand spike", prompt: "Orders for SKU-204 jumped 3x overnight." },
  ],
  autonomy: "medium",
  approvalPolicy: [{ id: "po", label: "Purchase orders" }, { id: "reroute", label: "Logistics rerouting" }],
  riskPolicy: "No purchase orders or supplier changes without approval.",
  strength: 74,
})

/* ------------------------------- WAZ ------------------------------ */
const WAZ = seal({
  id: "waz",
  codename: "WAZ",
  role: "Sales & Revenue Worker",
  mission:
    "Surface the highest-probability revenue, diagnose pipeline health and execute the outreach that moves deals forward.",
  category: "sales",
  archetypeId: "closer",
  accent: "oklch(0.6 0.15 150)",
  industry: null,
  businessModel: null,
  targetAudience: null,
  brandVoice: null,
  communicationStyle: "Warm, consultative, momentum-driven",
  skillClusters: [
    { name: "Pipeline Intelligence", category: "research", skills: ["Deal scoring", "Pipeline health", "Slippage detection", "Win/loss analysis", "Forecast accuracy"] },
    { name: "Account Intelligence", category: "research", skills: ["ICP fit", "Buying-committee mapping", "Intent signals", "Whitespace analysis", "Expansion signals"] },
    { name: "Revenue Reasoning", category: "reasoning", skills: ["Next-best-action", "Discount modeling", "Territory planning", "Quota modeling"] },
    { name: "Outreach Execution", category: "execution", skills: ["Sequenced outreach", "Meeting booking", "Follow-up drafting", "CRM hygiene"] },
  ],
  specializations: [
    { id: "enterprise", label: "Enterprise Sales", description: "Multi-threaded, committee-driven deals" },
    { id: "velocity", label: "Velocity Sales", description: "High-volume, fast-cycle pipeline" },
    { id: "expansion", label: "Expansion & NRR", description: "Land-and-expand revenue growth" },
  ],
  activeSpecializationId: "enterprise",
  knowledgeSources: ["CRM", "Product usage data", "Intent providers", "Call transcripts"],
  tools: [
    { id: "crm", label: "CRM", requiresApproval: false, connected: true },
    { id: "email", label: "Email / sequencer", requiresApproval: true, connected: false },
    { id: "calendar", label: "Calendar", requiresApproval: false, connected: true },
  ],
  kpis: [
    { id: "pipeline", label: "Qualified pipeline", weight: "primary" },
    { id: "winrate", label: "Win rate", weight: "primary" },
    { id: "cycle", label: "Sales cycle", weight: "secondary" },
  ],
  outcomes: [
    { id: "slippage", label: "Slippage recovery", impact: "+9-14% forecast attainment" },
    { id: "expansion", label: "Expansion capture", impact: "+6-10% net revenue retention" },
  ],
  simulationScenarios: [
    { id: "stalled", title: "Stalled enterprise deal", prompt: "A $96K deal has gone quiet for 14 days — decide the play." },
    { id: "expansion", title: "Expansion signal", prompt: "An account just crossed 90% seat utilization." },
  ],
  autonomy: "medium",
  approvalPolicy: [{ id: "send", label: "Outbound email sends" }, { id: "discount", label: "Discount offers" }],
  riskPolicy: "No external sends or pricing offers without approval.",
  strength: 78,
})

/* ------------------------------- JURI ----------------------------- */
const JURI = seal({
  id: "juri",
  codename: "JURI",
  role: "Legal Operations Worker",
  mission:
    "Review contracts, surface risk and keep the business compliant — turning legal complexity into clear, defensible decisions.",
  category: "legal",
  archetypeId: "guardian",
  accent: "oklch(0.58 0.11 300)",
  industry: null,
  businessModel: null,
  targetAudience: null,
  brandVoice: null,
  communicationStyle: "Careful, precise, plain-language",
  skillClusters: [
    { name: "Contract Intelligence", category: "research", skills: ["Clause extraction", "Obligation tracking", "Deviation detection", "Renewal monitoring", "Precedent search"] },
    { name: "Risk Reasoning", category: "reasoning", skills: ["Risk scoring", "Liability analysis", "Redline recommendation", "Escalation logic"] },
    { name: "Compliance", category: "research", skills: ["Policy mapping", "Regulatory monitoring", "Audit trail", "Data-privacy checks"] },
    { name: "Drafting", category: "execution", skills: ["Clause drafting", "Redline generation", "Summary memos"] },
  ],
  specializations: [
    { id: "commercial", label: "Commercial Contracts", description: "MSAs, NDAs, SOWs & vendor terms" },
    { id: "privacy", label: "Privacy & Compliance", description: "GDPR/CCPA, DPAs & data governance" },
    { id: "employment", label: "Employment", description: "Offer, policy & labor compliance" },
  ],
  activeSpecializationId: "commercial",
  knowledgeSources: ["Contract repository", "Clause library / playbook", "Regulatory corpus"],
  tools: [
    { id: "clm", label: "Contract repository", requiresApproval: false, connected: true },
    { id: "esign", label: "E-signature", requiresApproval: true, connected: false },
  ],
  kpis: [
    { id: "cycle", label: "Review turnaround", weight: "primary" },
    { id: "risk", label: "Risk exposure caught", weight: "primary" },
  ],
  outcomes: [
    { id: "turnaround", label: "Faster review", impact: "-40-60% review turnaround" },
    { id: "risk", label: "Risk interception", impact: "Higher share of risky clauses caught pre-signature" },
  ],
  simulationScenarios: [
    { id: "redline", title: "Risky vendor MSA", prompt: "A vendor MSA caps their liability at $0 — decide the redline." },
    { id: "renewal", title: "Auto-renewal trap", prompt: "A contract auto-renews in 12 days with a 20% uplift." },
  ],
  autonomy: "low",
  approvalPolicy: [{ id: "sign", label: "Signing / execution" }, { id: "commit", label: "Legal commitments" }],
  riskPolicy: "Never sign or commit. All output is advisory until a human approves.",
  strength: 71,
})

/* ------------------------------- FIN ------------------------------ */
const FIN = seal({
  id: "fin",
  codename: "FIN",
  role: "Finance Intelligence Worker",
  mission:
    "Monitor cash, find anomalies, protect margin and surface financial opportunities — without ever moving money on its own.",
  category: "finance",
  archetypeId: "analyst",
  accent: "oklch(0.6 0.14 190)",
  industry: null,
  businessModel: null,
  targetAudience: null,
  brandVoice: null,
  communicationStyle: "Rigorous, conservative, numerate",
  skillClusters: [
    { name: "Cash Flow Intelligence", category: "research", skills: ["Cash-flow monitoring", "Runway modeling", "Liquidity forecasting", "Scenario stress-testing"] },
    { name: "AP / AR Intelligence", category: "research", skills: ["AP anomaly detection", "Duplicate-invoice detection", "AR aging", "Collections prioritization"] },
    { name: "Cost & Margin Reasoning", category: "reasoning", skills: ["Margin analysis", "Cost-driver analysis", "Supplier discount modeling", "Budget variance"] },
    { name: "Reporting", category: "execution", skills: ["Report generation", "Variance narratives", "Alerting"] },
  ],
  specializations: [
    { id: "fpa", label: "FP&A", description: "Forecasting, budgeting & variance analysis" },
    { id: "controllership", label: "Controllership", description: "Close, controls & anomaly detection" },
    { id: "treasury", label: "Treasury", description: "Cash, liquidity & working capital" },
  ],
  activeSpecializationId: "controllership",
  knowledgeSources: ["General ledger", "AP / AR systems", "Bank feeds", "Budget model"],
  tools: [
    { id: "erp", label: "ERP / GL", requiresApproval: false, connected: true },
    { id: "bank", label: "Banking", requiresApproval: true, connected: false },
    { id: "ap", label: "AP system", requiresApproval: true, connected: false },
  ],
  kpis: [
    { id: "dso", label: "Days sales outstanding", weight: "primary" },
    { id: "margin", label: "Gross margin", weight: "primary" },
    { id: "leakage", label: "Cost leakage caught", weight: "secondary" },
  ],
  outcomes: [
    { id: "duplicates", label: "Duplicate-payment prevention", impact: "Recovered spend from intercepted duplicates" },
    { id: "discounts", label: "Supplier discount capture", impact: "+early-payment discount capture" },
  ],
  simulationScenarios: [
    { id: "anomaly", title: "AP anomaly", prompt: "An invoice for a new supplier is 4x the category median." },
    { id: "cash", title: "Cash squeeze", prompt: "Projected runway just dropped below 6 months." },
  ],
  autonomy: "low",
  approvalPolicy: [{ id: "payment", label: "Payments" }, { id: "supplier", label: "Supplier changes" }, { id: "commit", label: "Financial commitments" }],
  riskPolicy: "NO PAYMENT EXECUTION. Payments, supplier changes and commitments always require approval.",
  strength: 76,
})

/* ------------------------------- PIPO ----------------------------- */
const PIPO = seal({
  id: "pipo",
  codename: "PIPO",
  role: "People Intelligence Worker",
  mission:
    "Read the signals of talent, culture and retention to help leaders keep the right people engaged and growing.",
  category: "people",
  archetypeId: "steward",
  accent: "oklch(0.62 0.13 60)",
  industry: null,
  businessModel: null,
  targetAudience: null,
  brandVoice: null,
  communicationStyle: "Empathetic, discreet, human",
  skillClusters: [
    { name: "Talent Intelligence", category: "research", skills: ["Attrition-risk detection", "Engagement analysis", "Skills-gap analysis", "Hiring-funnel analysis"] },
    { name: "Culture Reasoning", category: "reasoning", skills: ["Sentiment analysis", "Team-health scoring", "Intervention design", "Equity analysis"] },
    { name: "Workforce Planning", category: "reasoning", skills: ["Headcount modeling", "Succession planning", "Comp benchmarking"] },
    { name: "Enablement", category: "execution", skills: ["Manager nudges", "Survey orchestration", "Report generation"] },
  ],
  specializations: [
    { id: "retention", label: "Retention & Engagement", description: "Attrition risk & culture health" },
    { id: "talent", label: "Talent Acquisition", description: "Funnel, quality-of-hire & velocity" },
    { id: "planning", label: "Workforce Planning", description: "Headcount, succession & comp" },
  ],
  activeSpecializationId: "retention",
  knowledgeSources: ["HRIS", "Engagement surveys", "ATS data", "Comp benchmarks"],
  tools: [
    { id: "hris", label: "HRIS", requiresApproval: false, connected: true },
    { id: "survey", label: "Survey platform", requiresApproval: false, connected: true },
    { id: "comms", label: "Manager comms", requiresApproval: true, connected: false },
  ],
  kpis: [
    { id: "attrition", label: "Regretted attrition", weight: "primary" },
    { id: "engagement", label: "Engagement", weight: "primary" },
    { id: "tth", label: "Time to hire", weight: "secondary" },
  ],
  outcomes: [
    { id: "retention", label: "Retention lift", impact: "-10-18% regretted attrition" },
    { id: "hiring", label: "Faster quality hiring", impact: "-15-25% time to hire" },
  ],
  simulationScenarios: [
    { id: "flight", title: "Flight risk", prompt: "A top performer's engagement signals dropped sharply this quarter." },
    { id: "team", title: "Team health dip", prompt: "One team's sentiment fell two standard deviations below baseline." },
  ],
  autonomy: "low",
  approvalPolicy: [{ id: "comms", label: "Employee communications" }, { id: "action", label: "People actions" }],
  riskPolicy: "People data is sensitive. No employee-facing action or comms without approval.",
  strength: 70,
})

/* ------------------- CONTENT INTELLIGENCE WORKER ------------------ */
const CONTENT = seal({
  id: "content",
  codename: "LEXI",
  role: "Content Intelligence Worker",
  mission:
    "Analyze, optimize and elevate content — balancing readability, search intelligence and audience comprehension against real editorial context.",
  category: "content",
  archetypeId: "editor",
  accent: "oklch(0.6 0.16 330)",
  industry: null,
  businessModel: null,
  targetAudience: null,
  brandVoice: null,
  communicationStyle: "Editorial, exacting, constructive",
  skillClusters: [
    { name: "Readability Intelligence", category: "research", skills: ["Readability scoring", "Sentence-complexity analysis", "Passive-voice detection", "Comprehension modeling", "Reading-level targeting"] },
    { name: "Search Intelligence", category: "research", skills: ["SEO / AEO / GEO", "Search intent", "Topic clustering", "Content gap analysis", "Competitor content analysis"] },
    { name: "Editorial Reasoning", category: "reasoning", skills: ["Structure critique", "Argument-flow analysis", "Tone alignment", "Contextual explanation"] },
    { name: "Optimization", category: "execution", skills: ["Rewrite generation", "Diff proposal", "Headline optimization", "Meta generation"] },
  ],
  specializations: [
    { id: "editorial", label: "Editorial & Blog", description: "Long-form clarity, flow & readability" },
    { id: "seo", label: "SEO Content", description: "Intent capture, clustering & gaps" },
    { id: "product", label: "Product & UX Copy", description: "Concise, comprehension-first microcopy" },
  ],
  activeSpecializationId: "editorial",
  knowledgeSources: ["Content library", "Search console data", "Style guide", "Competitor corpus"],
  tools: [
    { id: "cms", label: "CMS", requiresApproval: true, connected: false },
    { id: "search", label: "Search console", requiresApproval: false, connected: true },
  ],
  kpis: [
    { id: "readability", label: "Readability score", weight: "primary" },
    { id: "organic", label: "Qualified organic", weight: "primary" },
    { id: "engagement", label: "Content engagement", weight: "secondary" },
  ],
  outcomes: [
    { id: "clarity", label: "Comprehension lift", impact: "+readability at target reading level" },
    { id: "organic", label: "Intent capture", impact: "+20-35% qualified organic" },
  ],
  simulationScenarios: [
    { id: "rewrite", title: "Optimize a dense article", prompt: "A 1,400-word post reads at grade 15 — bring it to the target level." },
    { id: "gap", title: "Close a content gap", prompt: "Competitors own a high-intent cluster you don't cover." },
  ],
  autonomy: "medium",
  approvalPolicy: [{ id: "publish", label: "Publishing to CMS" }],
  riskPolicy: "Drafts and diffs are free; publishing to live content requires approval.",
  strength: 73,
})

export const PREFABS: WorkerSpec[] = [MAKY, OPY, WAZ, JURI, FIN, PIPO, CONTENT]

export function getPrefab(id: string): WorkerSpec | undefined {
  return PREFABS.find((p) => p.id === id)
}

/** The flagship the Library leads with. */
export const FLAGSHIP_ID = "maky"
