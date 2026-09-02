/* ================================================================== *
 * MARKETING SKILL METADATA — the rich, structured description every
 * Marketing Workforce skill carries, ABOVE AND SEPARATE FROM
 * SkillDefinition (lib/agent/types.ts).
 *
 * SkillDefinition is the EXECUTABLE contract every skill in this
 * codebase already implements (id/inputs/execute/evaluate/metrics) —
 * unchanged here, never forked. This file adds the descriptive
 * planning/governance metadata the Marketing Workforce brief asked
 * for (worker/trigger/preconditions/knowledge_requirements/procedure/
 * heuristics/approval_policy/evaluation_metrics) that SkillDefinition
 * has no room for and that every OTHER skill in this codebase doesn't
 * need — it is additive, not a duplicate model.
 *
 * `status: "live"` means a real SkillDefinition with a working
 * execute() exists in lib/agent/skills/ and is registered in
 * SKILL_REGISTRY — it can actually run. `status: "planned"` means
 * this metadata is real, deliberately specified architecture for a
 * capability that does NOT have an execute() yet — the same honest
 * "coming_soon" discipline lib/products/catalog.ts and
 * lib/connectors/registry.ts already use for a Product/Connector that
 * isn't real yet: named and specified so the intended shape is
 * visible, never wired to a fake "Run" button. Do not add a "planned"
 * skill to SKILL_REGISTRY.
 * ================================================================== */

export type MarketingSpecialty = "seo" | "paid_media" | "analytics"

export interface HeuristicRef {
  id: string
  name: string
}

export interface MarketingSkillMetadata {
  id: string
  name: string
  version: string
  category: MarketingSpecialty
  description: string
  /** Which named Worker role (product/products/catalog.ts's
   * workerRoleLabel, or a future one) this skill belongs to. */
  worker: string
  /** What starts an execution of this skill — a user objective, a
   * schedule, or a detected condition. Real today for "live" skills
   * (a Studio "Run" click); documented intent for "planned" ones. */
  trigger: string
  inputs: string[]
  /** What must be true before this skill can run at all — checked by
   * the skill's own execute() (SkillBlockedError) for "live" skills,
   * specified here for "planned" ones. */
  preconditions: string[]
  knowledgeRequirements: string[]
  requiredTools: string[]
  /** The real, ordered steps execute() actually performs (for "live")
   * or is specified to perform (for "planned") — never an internal
   * chain-of-thought transcript, always the auditable step names
   * already visible as real runtime events (task_started,
   * tool_called, reasoning_started, ...). */
  procedure: string[]
  heuristics: HeuristicRef[]
  risk: "low" | "medium" | "high"
  approvalPolicy: string
  expectedOutputs: string[]
  evaluationMetrics: string[]
  status: "live" | "planned"
}

export const MARKETING_SKILL_CATALOG: MarketingSkillMetadata[] = [
  // ---- Paid Media -----------------------------------------------
  {
    id: "skill_search_waste_detection",
    name: "Search Waste Detection",
    version: "1.0",
    category: "paid_media",
    description: "Classifies real search-term-level paid-search performance to find spend that is producing no real return, and generates negative-keyword/targeting/budget recommendations.",
    worker: "Paid Media Specialist",
    trigger: "Operator-initiated Studio run, or a future scheduled diagnostic run.",
    inputs: ["lookbackWindow (optional, defaults to 30 days)", "targetCpa (optional)"],
    preconditions: ["A paid-search dataset is resolvable (real connector, or honestly-labeled demo data)."],
    knowledgeRequirements: ["Worker Domain Profile (brand terms, for branded-query exclusion)"],
    requiredTools: ["tool_marketing_actions", "tool_llm"],
    procedure: [
      "Resolve the paid-search dataset (real connector if connected, else labeled DEMO data)",
      "Classify every search term's intent (deterministic, keyword-rule based)",
      "Evaluate the Search Waste Detection heuristic's trigger conditions (spend↑, CPA↑, conversion-rate↓)",
      "Classify waste and estimate impact (deterministic arithmetic)",
      "Generate negative-keyword / targeting / budget recommendation candidates",
      "Use the LLM only to write the natural-language rationale for the top recommendations",
      "Structure the Search Waste Optimization Report",
    ],
    heuristics: [{ id: "heur_search_waste_detection", name: "Search Waste Detection" }],
    risk: "medium",
    approvalPolicy: "The analysis itself is read-only and runs automatically. Applying any individual recommendation (skill_apply_marketing_recommendation) is a separate, high-risk write action that always requires human approval.",
    expectedOutputs: ["Search Waste Optimization Report (WorkerOutput, type search_waste_report)"],
    evaluationMetrics: ["data_completeness", "analysis_quality", "recommendation_relevance", "policy_compliance"],
    status: "live",
  },
  {
    id: "skill_campaign_performance_diagnosis",
    name: "Campaign Performance Diagnosis",
    version: "0.1",
    category: "paid_media",
    description: "Diagnoses why a campaign's performance changed — spend, CPA, ROAS, and conversion-rate trend analysis with a real, ranked list of contributing factors.",
    worker: "Paid Media Specialist",
    trigger: "Operator-initiated Studio run.",
    inputs: ["campaignId or campaign name", "comparisonWindow"],
    preconditions: ["A paid-search or paid-social dataset is resolvable."],
    knowledgeRequirements: ["Worker Domain Profile"],
    requiredTools: ["tool_llm"],
    procedure: ["Resolve dataset", "Compute period-over-period deltas", "Rank contributing factors", "Synthesize a diagnosis narrative"],
    heuristics: [],
    risk: "low",
    approvalPolicy: "Read-only analytical output — runs automatically.",
    expectedOutputs: ["Campaign diagnosis report"],
    evaluationMetrics: ["data_completeness", "analysis_quality"],
    status: "planned",
  },
  {
    id: "skill_budget_allocation_recommendation",
    name: "Budget Allocation Recommendation",
    version: "0.1",
    category: "paid_media",
    description: "Recommends how to reallocate budget across campaigns/ad groups toward the ones with the best real marginal return.",
    worker: "Paid Media Specialist",
    trigger: "Operator-initiated, or following a Search Waste Detection run.",
    inputs: ["totalBudget (optional)", "constraint list (optional)"],
    preconditions: ["A paid-search dataset with at least 2 campaigns is resolvable."],
    knowledgeRequirements: ["Worker Domain Profile"],
    requiredTools: ["tool_marketing_actions", "tool_llm"],
    procedure: ["Resolve dataset", "Rank campaigns by real marginal CPA/ROAS", "Generate reallocation candidates", "Estimate impact"],
    heuristics: [{ id: "heur_marginal_efficiency_reallocation", name: "Marginal Efficiency Reallocation" }],
    risk: "high",
    approvalPolicy: "Applying a budget change always requires human approval (financial permission).",
    expectedOutputs: ["Budget reallocation recommendations"],
    evaluationMetrics: ["analysis_quality", "recommendation_relevance", "policy_compliance"],
    status: "planned",
  },
  {
    id: "skill_creative_fatigue_detection",
    name: "Creative Fatigue Detection",
    version: "0.1",
    category: "paid_media",
    description: "Detects when an ad creative's real performance (CTR, frequency, conversion rate) is declining in a pattern consistent with audience fatigue.",
    worker: "Paid Media Specialist",
    trigger: "Operator-initiated, or a future scheduled run.",
    inputs: ["campaignId (optional)"],
    preconditions: ["A creative-level performance dataset is resolvable."],
    knowledgeRequirements: [],
    requiredTools: ["tool_llm"],
    procedure: ["Resolve creative-level dataset", "Compute CTR/frequency trend per creative", "Flag statistically declining creatives", "Recommend refresh candidates"],
    heuristics: [{ id: "heur_creative_fatigue", name: "Creative Fatigue Pattern" }],
    risk: "low",
    approvalPolicy: "Read-only analytical output — runs automatically.",
    expectedOutputs: ["Creative fatigue report"],
    evaluationMetrics: ["data_completeness", "analysis_quality"],
    status: "planned",
  },
  // ---- SEO ---------------------------------------------------------
  {
    id: "skill_technical_seo_diagnosis",
    name: "Technical SEO Diagnosis",
    version: "0.1",
    category: "seo",
    description: "Crawls a real site (via the Browser tool) and diagnoses genuine technical SEO issues — broken links, missing metadata, indexability problems.",
    worker: "SEO Specialist",
    trigger: "Operator-initiated Studio run.",
    inputs: ["siteUrl"],
    preconditions: ["The target site is reachable (SSRF-guarded fetch)."],
    knowledgeRequirements: ["Worker Domain Profile"],
    requiredTools: ["tool_browser", "tool_llm"],
    procedure: ["Fetch real pages", "Run deterministic technical checks (status codes, metadata presence)", "Rank issues by severity", "Synthesize findings"],
    heuristics: [],
    risk: "low",
    approvalPolicy: "Read-only analytical output — runs automatically.",
    expectedOutputs: ["Technical SEO diagnosis report"],
    evaluationMetrics: ["data_completeness", "analysis_quality"],
    status: "planned",
  },
  {
    id: "skill_search_opportunity_detection",
    name: "Search Opportunity Detection",
    version: "0.1",
    category: "seo",
    description: "Real, source-grounded organic search opportunity discovery — the SEO-specialist-facing sibling of the existing SEO Opportunity Planning skill.",
    worker: "SEO Specialist",
    trigger: "Operator-initiated Studio run.",
    inputs: ["topic area"],
    preconditions: ["Web search is available."],
    knowledgeRequirements: ["Worker Domain Profile"],
    requiredTools: ["tool_web_search", "tool_llm"],
    procedure: ["Search real sources", "Identify genuine opportunities", "Rank by relevance"],
    heuristics: [],
    risk: "low",
    approvalPolicy: "Read-only analytical output — runs automatically.",
    expectedOutputs: ["Search opportunity list"],
    evaluationMetrics: ["analysis_quality", "recommendation_relevance"],
    status: "planned",
  },
  {
    id: "skill_content_gap_analysis",
    name: "Content Gap Analysis",
    version: "0.1",
    category: "seo",
    description: "Compares a site's real existing pages against real competitor/topic coverage to find genuine content gaps.",
    worker: "SEO Specialist",
    trigger: "Operator-initiated Studio run.",
    inputs: ["siteUrl", "topic area"],
    preconditions: ["Web search and the target site are both reachable."],
    knowledgeRequirements: ["Worker Domain Profile"],
    requiredTools: ["tool_web_search", "tool_browser", "tool_llm"],
    procedure: ["Enumerate existing real pages", "Search real topic coverage", "Diff and rank gaps"],
    heuristics: [],
    risk: "low",
    approvalPolicy: "Read-only analytical output — runs automatically.",
    expectedOutputs: ["Content gap report"],
    evaluationMetrics: ["analysis_quality", "recommendation_relevance"],
    status: "planned",
  },
  {
    id: "skill_internal_linking_opportunity_detection",
    name: "Internal Linking Opportunity Detection",
    version: "0.1",
    category: "seo",
    description: "Analyzes a real site's crawled link graph to find genuine internal-linking opportunities (orphaned pages, missed contextual links).",
    worker: "SEO Specialist",
    trigger: "Operator-initiated Studio run.",
    inputs: ["siteUrl"],
    preconditions: ["The target site is reachable."],
    knowledgeRequirements: [],
    requiredTools: ["tool_browser", "tool_llm"],
    procedure: ["Crawl real pages and links", "Build the real link graph", "Detect orphans / missed contextual links"],
    heuristics: [],
    risk: "low",
    approvalPolicy: "Read-only analytical output — runs automatically.",
    expectedOutputs: ["Internal linking recommendations"],
    evaluationMetrics: ["data_completeness", "recommendation_relevance"],
    status: "planned",
  },
  // ---- Analytics -----------------------------------------------
  {
    id: "skill_marketing_anomaly_detection",
    name: "Marketing Anomaly Detection",
    version: "0.1",
    category: "analytics",
    description: "Deterministically detects statistically significant anomalies across real marketing metric time series (spend, conversions, CPA) and explains the most likely cause.",
    worker: "Marketing Analyst",
    trigger: "Scheduled, or operator-initiated.",
    inputs: ["metric selection (optional)", "window (optional)"],
    preconditions: ["At least one real (or demo) marketing dataset is resolvable."],
    knowledgeRequirements: [],
    requiredTools: ["tool_llm"],
    procedure: ["Resolve time series", "Run a deterministic anomaly test (e.g. z-score against trailing baseline)", "Rank anomalies", "Synthesize likely-cause narrative"],
    heuristics: [],
    risk: "low",
    approvalPolicy: "Read-only analytical output — runs automatically.",
    expectedOutputs: ["Anomaly report"],
    evaluationMetrics: ["data_completeness", "analysis_quality"],
    status: "planned",
  },
  {
    id: "skill_growth_opportunity_detection",
    name: "Growth Opportunity Detection",
    version: "0.1",
    category: "analytics",
    description: "Cross-channel synthesis: ranks the real, currently highest-leverage growth opportunities across every connected marketing dataset.",
    worker: "Marketing Analyst",
    trigger: "Operator-initiated Studio run.",
    inputs: [],
    preconditions: ["At least one real (or demo) marketing dataset is resolvable."],
    knowledgeRequirements: ["Worker Domain Profile"],
    requiredTools: ["tool_llm"],
    procedure: ["Aggregate real cross-channel metrics", "Score opportunities by estimated leverage", "Rank and explain"],
    heuristics: [],
    risk: "low",
    approvalPolicy: "Read-only analytical output — runs automatically.",
    expectedOutputs: ["Growth opportunity ranking"],
    evaluationMetrics: ["analysis_quality", "recommendation_relevance"],
    status: "planned",
  },
]

export function getMarketingSkillMetadata(id: string): MarketingSkillMetadata | undefined {
  return MARKETING_SKILL_CATALOG.find((s) => s.id === id)
}
