import type { MetricRecord, Worker, WorkerExecution, WorkerOutput } from "@/lib/workforce/model"

export type ResultProvenance = "real" | "connected" | "demo" | "simulated" | "not_connected"

export interface BusinessMetricDefinition {
  key: string
  label: string
  unit: string
  source: string
  activation: string
}

export interface SuperAgentProfile {
  id: string
  label: string
  objective: string
  capabilities: string[]
  image: string
  metrics: BusinessMetricDefinition[]
}

export interface BusinessResultCard extends BusinessMetricDefinition {
  workerId?: string
  workerName?: string
  value: number | null
  provenance: ResultProvenance
  recordedAt?: number
  executionId?: string
}

export const SUPER_AGENT_PROFILES: SuperAgentProfile[] = [
  profile("sales", "Sales", "Grow qualified pipeline and close the right opportunities.", ["Qualify leads", "Prioritize accounts", "Prepare follow-up"], "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/blue_sales_agent-RbNFAinWnnzgKgQEDeMUYJ8QL61cqS.webp", [["pipeline_generated", "Pipeline generated", "$", "CRM", "Connect CRM to activate"], ["qualified_opportunities", "Qualified opportunities", "", "CRM", "Connect CRM to activate"]]),
  profile("marketing", "Marketing", "Create measurable demand with evidence-backed campaigns.", ["Research markets", "Build briefs", "Analyze engagement"], "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/green_marketing_agent-A2Jn9F0tIw00afsud0p6ZYvMLe7tDi.webp", [["qualified_leads", "Qualified leads", "", "CRM", "Connect CRM to activate"], ["campaign_reach", "Campaign reach", "", "Analytics", "Connect analytics to activate"]]),
  profile("customer-success", "Customer Success", "Improve retention by identifying and resolving customer risk.", ["Monitor health", "Prepare check-ins", "Recommend next actions"], "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/customer_success_agent_thumbs_up-mv8PtZpjOHi87VoDk0k0GyTCeBYAYu.webp", [["retention_rate", "Retention rate", "%", "Customer platform", "Connect customer data to activate"], ["health_score", "Customer health", "%", "Customer platform", "Connect customer data to activate"]]),
  profile("support", "Support", "Resolve customer issues quickly with reliable answers.", ["Triage tickets", "Draft responses", "Identify escalations"], "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/support_agent_console-dfjeF9Z8k3xXsTHHEDCyZwIALBHrFl.webp", [["resolution_rate", "Resolution rate", "%", "Help desk", "Connect help desk to activate"], ["csat", "Customer satisfaction", "%", "Help desk", "Connect help desk to activate"]]),
  profile("finance", "Finance", "Protect margin with accurate analysis and controlled actions.", ["Review variance", "Analyze spend", "Prepare forecasts"], "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/finance_agent_console-buTl9SCNSMMGTAkEU2p0sAkJl9QZKQ.webp", [["savings", "Verified savings", "$", "Finance system", "Connect finance system to activate"], ["forecast_accuracy", "Forecast accuracy", "%", "Finance system", "Connect finance system to activate"]]),
  profile("operations", "Operations", "Keep critical workflows reliable and remove bottlenecks.", ["Monitor workflows", "Investigate blockers", "Coordinate handoffs"], "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/red_ops_agent_control_room-rz1DNcMXzUkJRjUWiDsBiZGlqiKNou.webp", [["cycle_time", "Cycle time", "h", "Operations system", "Connect operations data to activate"], ["sla_attainment", "SLA attainment", "%", "Operations system", "Connect operations data to activate"]]),
  profile("hr", "HR", "Support a healthy workforce with consistent employee operations.", ["Prepare onboarding", "Coordinate check-ins", "Summarize feedback"], "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/hr_agent_console-DAgJlixGXFXWev9qcY1OeVFSdhfsT0.webp", [["employee_happiness", "Employee happiness", "%", "HRIS", "Connect HRIS to activate"], ["onboarding_completion", "Onboarding completion", "%", "HRIS", "Connect HRIS to activate"]]),
  profile("ecommerce", "E-commerce", "Improve fulfillment and conversion across commerce operations.", ["Monitor orders", "Find inventory risk", "Analyze conversion"], "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ecommerce_agent_console-xdfo6T8F0QKoT9J0GQYExa0FhtOVai.webp", [["conversion_rate", "Conversion rate", "%", "Commerce platform", "Connect commerce data to activate"], ["fulfillment_rate", "Fulfillment rate", "%", "Commerce platform", "Connect commerce data to activate"]]),
  profile("revenue", "Revenue & Growth", "Find and execute the highest-leverage growth opportunities.", ["Analyze growth", "Prioritize experiments", "Track revenue motion"], "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/revenue_growth_agent-uzj0Dhov6r8EUBIPYpDMgsP3zTV7yd.webp", [["revenue_growth", "Revenue growth", "%", "Revenue system", "Connect revenue data to activate"], ["cac", "Customer acquisition cost", "$", "Revenue system", "Connect revenue data to activate"]]),
]

function profile(id: string, label: string, objective: string, capabilities: string[], image: string, metrics: [string, string, string, string, string][]): SuperAgentProfile {
  return { id, label, objective, capabilities, image, metrics: metrics.map(([key, metricLabel, unit, source, activation]) => ({ key, label: metricLabel, unit, source, activation })) }
}

export function profileForWorker(worker?: Worker): SuperAgentProfile {
  if (!worker) return SUPER_AGENT_PROFILES[8]
  const haystack = `${worker.productId ?? ""} ${worker.identity.role} ${worker.identity.name} ${worker.mission}`.toLowerCase()
  return SUPER_AGENT_PROFILES.find((item) => haystack.includes(item.id) || haystack.includes(item.label.toLowerCase())) ?? SUPER_AGENT_PROFILES[8]
}

export function provenanceForExecution(execution?: WorkerExecution): ResultProvenance {
  return execution?.executionMode === "development" ? "simulated" : execution ? "real" : "not_connected"
}

export function businessResults(workers: Worker[], metrics: MetricRecord[], executions: WorkerExecution[], outputs: WorkerOutput[]): BusinessResultCard[] {
  const cards: BusinessResultCard[] = []
  for (const worker of workers) {
    const profile = profileForWorker(worker)
    for (const definition of profile.metrics) {
      const record = metrics.filter((metric) => metric.workerId === worker.id && metric.kind === "business" && metric.key === definition.key).sort((a, b) => b.recordedAt - a.recordedAt)[0]
      const execution = record?.executionId ? executions.find((item) => item.id === record.executionId) : undefined
      cards.push({ ...definition, workerId: worker.id, workerName: worker.identity.name, value: record?.value ?? null, recordedAt: record?.recordedAt, executionId: record?.executionId, provenance: record ? provenanceForExecution(execution) : "not_connected" })
    }
  }
  return cards
}

export function metricsForOutput(output: WorkerOutput, metrics: MetricRecord[]) {
  return metrics.filter((metric) => metric.executionId === output.executionId)
}

export function formatBusinessValue(value: number | null, unit: string) {
  if (value == null) return "—"
  if (unit === "$") return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
  return `${new Intl.NumberFormat().format(value)}${unit}`
}
