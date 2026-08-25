export type IntelligenceStatus = "detected" | "investigating" | "validated" | "executing"

export interface MarketingSignal {
  id: string
  source: string
  title: string
  summary: string
  observed: string
  confidence: number
  freshness: string
  status: IntelligenceStatus
  evidence: string[]
}

export interface MarketingOpportunity {
  id: string
  title: string
  insight: string
  signal: string
  reasoning: string
  action: string
  expected: string
  reach: string
  confidence: number
  status: IntelligenceStatus
  impact: "High" | "Medium"
}

export interface MarketingCreative {
  id: string
  channel: string
  format: string
  title: string
  message: string
  cta: string
  status: "Draft" | "Review" | "Ready"
  opportunityId: string
  palette: string
}

export const marketingSignals: MarketingSignal[] = [
  { id: "signal-1", source: "CRM", title: "Trial activation is stalling after team invites", summary: "Invited teams that skip a first collaborative workflow convert 31% less often.", observed: "1,284 product-qualified accounts", confidence: 94, freshness: "8 min ago", status: "validated", evidence: ["CRM stage history", "Product event: team_invited", "Trial conversion cohort"] },
  { id: "signal-2", source: "Web analytics", title: "Pricing comparison traffic is accelerating", summary: "High-intent sessions from comparison queries rose 28% week over week, led by operations leaders.", observed: "18,420 sessions", confidence: 89, freshness: "21 min ago", status: "investigating", evidence: ["Organic landing sessions", "Role enrichment", "Query intent clusters"] },
  { id: "signal-3", source: "Campaigns", title: "Workflow proof outperforms category education", summary: "Creative showing a real task handoff is producing materially stronger qualified engagement.", observed: "42 active ad variants", confidence: 91, freshness: "34 min ago", status: "validated", evidence: ["Paid social variants", "Qualified click rate", "Landing-page depth"] },
  { id: "signal-4", source: "Market", title: "Competitor migration language is emerging", summary: "Buyer conversations increasingly mention governance and fragmented agent tooling as switching triggers.", observed: "386 public conversations", confidence: 82, freshness: "1 hr ago", status: "detected", evidence: ["Review corpus", "Community discussions", "Sales-call themes"] },
]

export const marketingOpportunities: MarketingOpportunity[] = [
  { id: "opp-1", title: "Convert stalled trials with a first-workflow activation sprint", insight: "The strongest conversion separator is not invite volume; it is whether the team completes one governed workflow together.", signal: "Trial activation is stalling after team invites", reasoning: "The cohort is large, recent, and connected to an observable product behavior. A triggered education sequence can address the gap without changing product state.", action: "Launch a 3-touch lifecycle sequence with role-specific workflow examples and a guided Studio deep link.", expected: "+12–18% trial-to-qualified conversion", reach: "1,284 accounts", confidence: 94, status: "executing", impact: "High" },
  { id: "opp-2", title: "Own the governed AI workforce comparison category", insight: "High-intent buyers are actively comparing orchestration platforms, but current pages explain capabilities rather than operational proof.", signal: "Pricing comparison traffic is accelerating", reasoning: "Search demand and role enrichment agree on a narrow executive audience. Existing execution-ledger evidence can become differentiated proof.", action: "Publish a comparison narrative and retarget visitors with an evidence-to-outcome creative system.", expected: "+420 qualified visits / month", reach: "18.4K sessions", confidence: 89, status: "validated", impact: "High" },
  { id: "opp-3", title: "Scale the task-handoff creative motif", insight: "Showing the actual chain from signal to decision to governed action is outperforming abstract AI messaging.", signal: "Workflow proof outperforms category education", reasoning: "The pattern holds across three channels and remains after controlling for audience and offer.", action: "Adapt the winning narrative into paid social, executive email, and an interactive landing-page module.", expected: "+24% qualified engagement", reach: "3 channels", confidence: 91, status: "investigating", impact: "Medium" },
]

export const marketingCreatives: MarketingCreative[] = [
  { id: "creative-1", channel: "LinkedIn", format: "Executive carousel", title: "Your AI workforce should show its work", message: "From market signal to governed action, every decision stays attributable.", cta: "Inspect the decision trace", status: "Ready", opportunityId: "opp-2", palette: "blue" },
  { id: "creative-2", channel: "Lifecycle", format: "Activation email", title: "Your first governed workflow is ready", message: "Invite the team, assign one outcome, and watch Agent Smith build the execution path.", cta: "Open the guided workflow", status: "Review", opportunityId: "opp-1", palette: "cyan" },
  { id: "creative-3", channel: "Paid social", format: "Short motion concept", title: "Signals become work", message: "A market shift enters the Fabric. A worker investigates. The team approves. The campaign moves.", cta: "See Agent Smith operate", status: "Draft", opportunityId: "opp-3", palette: "coral" },
  { id: "creative-4", channel: "Web", format: "Proof module", title: "One objective. Five workers. One ledger.", message: "See the entire marketing department reason, create, and learn against business outcomes.", cta: "Explore the live system", status: "Ready", opportunityId: "opp-2", palette: "blue" },
]

export const executiveInsights = [
  { label: "What changed", value: "Comparison intent rose 28% while activation quality split sharply after the first team invite." },
  { label: "Why it matters", value: "Demand is strengthening, but the current journey loses buyers before they experience a governed workflow." },
  { label: "What Agent Smith is doing", value: "Prioritizing activation and proof-led creative while holding publishing actions behind approval." },
]

export const impactRows = [
  { label: "Attributed pipeline", value: "$184K", change: "+18%", provenance: "CRM connected", tone: "positive" },
  { label: "Qualified engagement", value: "4,920", change: "+24%", provenance: "Campaign data", tone: "positive" },
  { label: "Activation conversion", value: "16.8%", change: "+2.9 pts", provenance: "Product + CRM", tone: "positive" },
  { label: "Content efficiency", value: "3.4×", change: "Modeled", provenance: "Not connected", tone: "neutral" },
]
