/* ================================================================== *
 * FINANCIAL INTELLIGENCE ENGINE — domain types.
 *
 * Layering (never blurred — see docs on DataProvenance/EconomicState
 * in lib/workforce/model.ts for the same discipline applied here):
 *
 *   RAW FINANCIAL DATA (Entity/BankAccount/Receivable/Payable/...)
 *     -> FINANCIAL FACTS (the same shapes, tagged with provenance)
 *     -> DERIVED METRICS (lib/finance/metrics.ts — pure calculations)
 *     -> INTELLIGENCE (Signal / Opportunity / Decision)
 *     -> BUSINESS OUTPUTS (lib/finance/business-output.ts)
 *
 * A Recommendation/Opportunity/Decision NEVER embeds raw transactions
 * inline — it references the facts and metrics that produced it
 * (evidence/assumptions), so the chain stays auditable (§37).
 * ================================================================== */

/** Phase 4: Opportunity/Decision reuse the product's ONE canonical
 * two-axis trust model (lib/workforce/model.ts) — never a second,
 * finance-specific trust vocabulary. `DataProvenance` answers "where
 * did this come from" (always "demo" today); `EconomicState` answers
 * "how far has this dollar figure traveled toward being real cash"
 * (always "estimated" today — nothing here has been approved,
 * executed, realized, or verified). These stay orthogonal, exactly
 * like everywhere else in the product. */
import type { DataProvenance, EconomicState } from "@/lib/workforce/model"
export type { DataProvenance, EconomicState }

/** Where a financial fact actually came from. For THIS phase every
 * fact in the system is "demo" — a shared, clearly fictional fixture,
 * not per-tenant data. The other values exist so the shape never has
 * to change when a real connector lands (§6). */
export type FinancialDataSource = "demo" | "user_provided" | "bank" | "erp" | "accounting" | "payments" | "external_benchmark" | "model_derived"

export type Currency = "USD" | "BRL" | "EUR"

/** Common envelope every financial fact carries (§5). `tenantId` is
 * optional: the demo dataset is one shared fictional company used by
 * every organization in this phase (mirrors tool_financial_data's
 * existing "isConnected() is honestly true for everyone" design) —
 * a real connector will fill this in per-tenant later without any
 * shape change. */
export interface FinancialFactBase {
  id: string
  tenantId?: string
  entityId: string
  source: FinancialDataSource
  sourceType: string
  asOf: string
  currency: Currency
  dataProvenance: "demo"
  createdAt?: number
  updatedAt?: number
}

export interface Entity extends FinancialFactBase {
  name: string
  country: string
}

export interface BankAccountFact extends FinancialFactBase {
  bank: string
  accountType: "operating" | "reserve" | "payroll"
  balance: number
  yieldPct: number
}

export interface ReceivableFact extends FinancialFactBase {
  customerId: string
  customer: string
  invoiceId: string
  amount: number
  issuedDate: string
  dueDate: string
  status: "current" | "overdue" | "paid"
  paymentDate?: string
}

export interface PayableFact extends FinancialFactBase {
  supplierId: string
  supplier: string
  invoiceId: string
  amount: number
  issuedDate: string
  dueDate: string
  paymentTermsDays: number
  earlyPayDiscountPct: number
  earlyPayWindowDays: number
}

export interface SupplierFact extends FinancialFactBase {
  name: string
  category: string
  annualSpend: number
  paymentTermsDays: number
  risk: "low" | "medium" | "high"
  relationshipYears: number
}

export interface CustomerFact extends FinancialFactBase {
  name: string
  annualRevenue: number
  paymentTermsDays: number
  historicalPaymentBehavior: "reliable" | "stable" | "erratic"
}

export interface TransactionFact extends FinancialFactBase {
  date: string
  type: "inflow" | "outflow"
  amount: number
  category: string
  bankAccountId: string
}

export interface FundingFacilityFact extends FinancialFactBase {
  facility: string
  limit: number
  drawn: number
  ratePct: number
  maturity: string
}

export interface CashWeekFact {
  weekStart: string
  inflow: number
  outflow: number
  netChange: number
  endingBalance: number
}

/* ================================================================== *
 * DERIVED METRICS
 * ================================================================== */

/** A calculation result that distinguishes "computed a real number"
 * from "could not be computed" (missing/zero denominator) — never a
 * fabricated 0 standing in for "unknown" (§32 boundary-case tests). */
export interface MetricResult {
  value: number | null
  /** Why `value` is null, when it is. */
  reason?: string
}

export interface WorkingCapitalResult {
  currentAssets: number
  currentLiabilities: number
  workingCapital: number
}

export interface LiquidityCoverageResult {
  availableCash: number
  minimumRequirement: number
  coverageRatio: number | null
  buffer: number
}

export interface FundingRequirementResult {
  projectedMinimumCash: number
  minimumRequirement: number
  fundingRequired: number
}

export interface IdleCashAccount {
  accountId: string
  bank: string
  balance: number
  yieldPct: number
}

export interface IdleCashResult {
  idleAccounts: IdleCashAccount[]
  totalIdle: number
}

export interface CashConcentrationEntry {
  key: string
  amount: number
  pct: number
}

export interface CashConcentrationResult {
  total: number
  byAccount: CashConcentrationEntry[]
  /** The single largest concentration percentage — what a risk signal keys off. */
  maxConcentrationPct: number
}

/* ================================================================== *
 * 13-WEEK CASH PROJECTION — BASELINE FORECAST (§8)
 * ================================================================== */

export interface WeeklyCashProjection {
  weekNumber: number
  weekStart: string
  opening: number
  inflows: number
  outflows: number
  closing: number
  committed: number
  availableCash: number
  minimumLiquidityRequirement: number
  liquidityBuffer: number
  potentialShortfall: number
}

export interface CashProjectionResult {
  label: "BASELINE FORECAST"
  horizonWeeks: number
  weeks: WeeklyCashProjection[]
  openingCash: number
  minimumMinCash: number
  worstWeek: WeeklyCashProjection | null
}

/* ================================================================== *
 * SIGNALS — structured, never overconfident (§9)
 * ================================================================== */

export type SignalSeverity = "low" | "medium" | "high" | "critical"

export interface LiquiditySignal {
  id: string
  type: "liquidity_shortfall" | "concentration_risk" | "funding_dependency" | "receivables_concentration"
  severity: SignalSeverity
  projectedMinimumCash?: number
  requiredMinimum?: number
  potentialShortfall?: number
  expectedDate?: string
  confidence: number
  evidence: string[]
}

/* ================================================================== *
 * ASSUMPTION MODEL (§15) — every number below FACT is explicitly typed
 * so a recommendation can never blur what's known vs assumed.
 * ================================================================== */

export interface Assumption {
  label: string
  value: string
  /** "DEMO ASSUMPTION" whenever the target/benchmark is internally
   * authored rather than sourced externally — never presented as if
   * it came from a real external benchmark (§10, §15). */
  kind: "demo_assumption" | "operator_defined"
}

export interface EvidenceItem {
  label: string
  value: string
}

/* ================================================================== *
 * OPPORTUNITY ENGINE (§11–14)
 * ================================================================== */

export type OpportunityCategory =
  | "supplier_payment_terms"
  | "idle_cash"
  | "receivables_acceleration"
  | "funding_optimization"
  | "early_payment_discount"

export type OpportunityStatus = "DETECTED" | "ANALYZING" | "READY" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "EXECUTED" | "VERIFIED"

export interface OpportunityEconomics {
  grossImpact: number
  probability: number
  expectedValue: number
  riskAdjustment: number
  effortAdjustment: number
  priorityValue: number
}

export interface Opportunity {
  id: string
  tenantId?: string
  /** Which Northstar Holdings entity this was detected against — real
   * for every opportunity this engine produces (never blank/"all"). */
  entityId: string
  /** Which Skill produced this — traceability back to SKILL_REGISTRY,
   * mirroring executionId's role for the Worker execution itself. */
  skillId: string
  category: OpportunityCategory
  title: string
  description: string
  estimatedValue: number
  currency: Currency
  probability: number
  expectedValue: number
  urgency: "low" | "medium" | "high"
  effort: "low" | "medium" | "high"
  risk: "low" | "medium" | "high" | "critical"
  reversibility: "reversible" | "hard_to_reverse" | "irreversible"
  confidence: number
  evidence: EvidenceItem[]
  assumptions: Assumption[]
  recommendedAction: string
  economics: OpportunityEconomics
  /** Deterministic, dimensionless rank (§8) — Economic Impact ×
   * Probability × Urgency × Feasibility(1/Effort) × Reversibility,
   * dampened by Risk. Used ONLY for sort order; `economics.priorityValue`
   * remains the real dollar figure shown to the user. See
   * calculateOpportunityPriorityScore() in economics.ts. */
  priorityScore: number
  status: OpportunityStatus
  createdAt: number
  updatedAt?: number
  dataProvenance: DataProvenance
  economicState: EconomicState
  /** Traceability (§37) — the execution/worker this was generated by. */
  workerId: string
  executionId?: string
}

/* ================================================================== *
 * SIMULATION ENGINE (§16)
 * ================================================================== */

export interface ScenarioChange {
  dsoTargetDays?: number
  dpoTargetDays?: number
  fundingRatePctDelta?: number
  cashAllocationChange?: number
}

export interface ScenarioResult {
  label: string
  baseline: Record<string, number>
  scenario: Record<string, number>
  receivablesRelease: number
  payablesRelease: number
  cashImpact: number
  liquidityImpact: number
  economicImpact: number
  kind: "SIMULATION"
}

/* ================================================================== *
 * ACTION MODEL (§20)
 * ================================================================== */

export type ActionType = "NEGOTIATE_PAYMENT_TERMS" | "REALLOCATE_IDLE_CASH" | "ACCELERATE_COLLECTION" | "CAPTURE_EARLY_PAY_DISCOUNT" | "ADJUST_FUNDING_DRAW"

export interface ProposedAction {
  id: string
  type: ActionType
  target: string
  current: string
  proposed: string
  economicImpact: string
  risk: "low" | "medium" | "high" | "critical"
  amount: number
  currency: Currency
  isNewCounterparty: boolean
  status: "PREPARED" | "READY" | "NOT_CONFIGURED"
  approval: "NOT_REQUIRED" | "REQUIRED"
  /** §12/§20: never a fake success. "REQUIRES_CONNECTOR" is the
   * honest, permanent state for every action type this engine
   * produces today — no real banking/ERP/payment connector exists
   * anywhere in this codebase to actually carry one out. "NOT_EXECUTED"
   * is kept distinct for a future action a real connector COULD run
   * but simply hasn't yet — that state does not occur today. */
  execution: "NOT_EXECUTED" | "REQUIRES_CONNECTOR"
}

/* ================================================================== *
 * POLICY ENGINE (§18)
 * ================================================================== */

export interface Policy {
  id: string
  description: string
  /** Pure predicate — never inferred from frontend state (§18). */
  matches: (action: ProposedAction) => boolean
  outcome: "APPROVAL_REQUIRED" | "BLOCKED"
  requiredApprover?: string
  reason: string
}

/** ALLOWED/APPROVAL_REQUIRED/BLOCKED are this engine's existing,
 * already-tested vocabulary (equivalent in meaning to PASS/
 * REQUIRES_APPROVAL/BLOCKED) — kept as-is rather than renamed to avoid
 * pure-cosmetic churn across the engine's 91 existing tests.
 * INSUFFICIENT_DATA is new: a decision is never generated from an
 * opportunity whose confidence or evidence doesn't clear a stated
 * threshold (§9, §11) — this is that honest "not enough to decide
 * yet" outcome, distinct from a real BLOCKED policy verdict. */
export type PolicyDecisionStatus = "ALLOWED" | "APPROVAL_REQUIRED" | "BLOCKED" | "INSUFFICIENT_DATA"

export interface PolicyEvaluationResult {
  status: PolicyDecisionStatus
  matchedPolicies: string[]
  requiredApprover?: string
  reasons: string[]
}

/* ================================================================== *
 * DECISION GENERATION (§17)
 * ================================================================== */

export interface Decision {
  id: string
  tenantId?: string
  entityId: string
  skillId: string
  title: string
  problem: string
  evidence: EvidenceItem[]
  assumptions: Assumption[]
  alternatives: string[]
  scenario: ScenarioResult
  economicImpact: { cashRelease: number; annualBenefit: number; currency: Currency }
  /** The honest "what could go wrong" — plain language, always present
   * (never blank), even for a low-risk decision (§9's "Potential
   * downside"). */
  downside: string
  risk: "low" | "medium" | "high" | "critical"
  recommendation: string
  confidence: number
  policyStatus: PolicyDecisionStatus
  approvalStatus: "NOT_REQUIRED" | "REQUIRED" | "BLOCKED"
  /** Denormalized copy of action.execution — a real, independently
   * queryable top-level column (see migrations/0004), not nested-only. */
  executionStatus: ProposedAction["execution"]
  action: ProposedAction
  /** This engine's decisionStatus — named `status` to match the
   * existing repo/DB convention every other entity in this codebase
   * uses (workers.status, executions.status, tasks.status) rather
   * than introducing a differently-named field for the same concept. */
  status: "DETECTED" | "READY" | "PREPARED"
  createdAt: number
  updatedAt?: number
  dataProvenance: DataProvenance
  economicState: EconomicState
  workerId: string
  executionId?: string
  opportunityId: string
}

/* ================================================================== *
 * BUSINESS OUTPUT (§21)
 * ================================================================== */

export interface BusinessOutput {
  cashReleasedPotential: number
  economicBenefitPotential: number
  currency: Currency
  liquidityRiskBefore: SignalSeverity | "none"
  liquidityRiskAfter: SignalSeverity | "none"
  opportunitiesCount: number
  recommendationsCount: number
  actionsPreparedCount: number
  label: "ESTIMATED" | "SIMULATED" | "DEMO"
  provenance: "demo"
}
