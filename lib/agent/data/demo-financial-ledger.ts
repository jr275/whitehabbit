/* ================================================================== *
 * DEMO FINANCIAL LEDGER — one coherent, clearly fictional company.
 *
 * Every number below is invented, by design — there is no real bank,
 * ERP, or accounting system behind this file. It exists so the four
 * financial Skills (lib/agent/skills/finance-*) have real, internally
 * consistent numbers to reason over instead of either (a) fabricating
 * a result with nothing behind it, or (b) being unable to run at all
 * before a real Connector exists (Phase Q, not this phase).
 *
 * "Coherent" is the operative word: the receivables, payables, cash
 * balances and 13-week history below are hand-built to agree with each
 * other (the ending cash balance in week 13 of the flow history equals
 * the sum of the bank accounts; the receivables/payables totals are
 * the ones the cash-flow projections are built from) — never a set of
 * independently-random numbers a skill could contradict itself with.
 *
 * Every consumer of this file MUST tag its result's dataProvenance as
 * "demo" (see lib/agent/tools/financial-data.ts) — never "real".
 *
 * PHASE 3 NOTE: this file's data is now understood to be the Northstar
 * USA entity specifically — Northstar Holdings' Brazil and Europe
 * entities (and the rest of the multi-entity fixture: suppliers,
 * customers, transactions, funding facilities) live in
 * lib/finance/demo-data.ts, which imports this file rather than
 * duplicating it. Renaming the company here (Lumen -> Northstar
 * Holdings) is the ONLY change in this file — every number, every
 * export, and the four financial Skills that depend on them are
 * unchanged.
 * ================================================================== */

export const DEMO_COMPANY_NAME = "Northstar Holdings"
export const DEMO_LEDGER_AS_OF = "2026-08-24"
export const NORTHSTAR_USA_ENTITY_ID = "ent_usa"

export interface DemoBankAccount {
  id: string
  bank: string
  accountType: "operating" | "reserve" | "payroll"
  currency: "USD"
  balance: number
  yieldPct: number
}

export const DEMO_BANK_ACCOUNTS: DemoBankAccount[] = [
  { id: "acct_operating", bank: "Meridian Commercial Bank", accountType: "operating", currency: "USD", balance: 842_300, yieldPct: 0.4 },
  { id: "acct_reserve", bank: "Meridian Commercial Bank", accountType: "reserve", currency: "USD", balance: 1_250_000, yieldPct: 0.1 },
  { id: "acct_payroll", bank: "Northgate Business Bank", accountType: "payroll", currency: "USD", balance: 95_000, yieldPct: 0.0 },
]

export interface DemoReceivable {
  id: string
  customer: string
  amount: number
  issuedDate: string
  dueDate: string
  daysOverdue: number
  status: "current" | "overdue"
}

// Total open receivables: 1,340,000. Top 2 customers (Meridian Retail
// Group + Northbridge Foods) = 670,000 = 50% concentration — the
// finding Receivables Risk Detection is built to surface.
export const DEMO_RECEIVABLES: DemoReceivable[] = [
  { id: "inv_1001", customer: "Meridian Retail Group", amount: 410_000, issuedDate: "2026-07-10", dueDate: "2026-08-09", daysOverdue: 15, status: "overdue" },
  { id: "inv_1002", customer: "Northbridge Foods", amount: 260_000, issuedDate: "2026-07-18", dueDate: "2026-08-17", daysOverdue: 7, status: "overdue" },
  { id: "inv_1003", customer: "Cascade Hardware", amount: 185_000, issuedDate: "2026-08-01", dueDate: "2026-08-31", daysOverdue: 0, status: "current" },
  { id: "inv_1004", customer: "Solstice Wholesale", amount: 160_000, issuedDate: "2026-08-05", dueDate: "2026-09-04", daysOverdue: 0, status: "current" },
  { id: "inv_1005", customer: "Briarwood Supply", amount: 125_000, issuedDate: "2026-08-08", dueDate: "2026-09-07", daysOverdue: 0, status: "current" },
  { id: "inv_1006", customer: "Cascade Hardware", amount: 95_000, issuedDate: "2026-08-12", dueDate: "2026-09-11", daysOverdue: 0, status: "current" },
  { id: "inv_1007", customer: "Fairwind Logistics", amount: 65_000, issuedDate: "2026-08-14", dueDate: "2026-09-13", daysOverdue: 0, status: "current" },
  { id: "inv_1008", customer: "Meridian Retail Group", amount: 40_000, issuedDate: "2026-08-16", dueDate: "2026-09-15", daysOverdue: 0, status: "current" },
]

export interface DemoPayable {
  id: string
  supplier: string
  amount: number
  dueDate: string
  paymentTermsDays: number
  earlyPayDiscountPct: number
  earlyPayWindowDays: number
}

// Total open payables: 560,000. Two suppliers offer an early-pay
// discount that isn't being captured today — the finding Working
// Capital Opportunity Detection is built to surface.
export const DEMO_PAYABLES: DemoPayable[] = [
  { id: "bill_2001", supplier: "Ridgeline Packaging", amount: 145_000, dueDate: "2026-09-10", paymentTermsDays: 30, earlyPayDiscountPct: 2, earlyPayWindowDays: 10 },
  { id: "bill_2002", supplier: "Vantage Freight Partners", amount: 120_000, dueDate: "2026-09-05", paymentTermsDays: 30, earlyPayDiscountPct: 0, earlyPayWindowDays: 0 },
  { id: "bill_2003", supplier: "Ironwood Components", amount: 110_000, dueDate: "2026-09-12", paymentTermsDays: 30, earlyPayDiscountPct: 1.5, earlyPayWindowDays: 10 },
  { id: "bill_2004", supplier: "Clearwater Utilities", amount: 65_000, dueDate: "2026-09-01", paymentTermsDays: 15, earlyPayDiscountPct: 0, earlyPayWindowDays: 0 },
  { id: "bill_2005", supplier: "Anchor Insurance Group", amount: 70_000, dueDate: "2026-09-20", paymentTermsDays: 45, earlyPayDiscountPct: 0, earlyPayWindowDays: 0 },
  { id: "bill_2006", supplier: "Vantage Freight Partners", amount: 50_000, dueDate: "2026-09-25", paymentTermsDays: 30, earlyPayDiscountPct: 0, earlyPayWindowDays: 0 },
]

export interface DemoCashWeek {
  weekStart: string
  inflow: number
  outflow: number
  netChange: number
  endingBalance: number
}

// 13 weeks, ending exactly at the sum of DEMO_BANK_ACCOUNTS above
// (842,300 + 1,250,000 + 95,000 = 2,187,300) — one seasonal dip at
// week 7 (a real-looking low point Cash Forecast is built to project
// forward from), net upward trend otherwise.
export const DEMO_CASH_FLOW_HISTORY: DemoCashWeek[] = build13WeekHistory()

function build13WeekHistory(): DemoCashWeek[] {
  const weeklyNet = [38_000, 42_000, 25_000, 30_000, 18_000, -12_000, -45_000, 15_000, 52_000, 48_000, 35_000, 40_000, 44_300]
  const totalNet = weeklyNet.reduce((a, b) => a + b, 0)
  const finalBalance = 2_187_300
  let balance = finalBalance - totalNet
  const weeks: DemoCashWeek[] = []
  const start = new Date("2026-05-25T00:00:00Z")
  for (let i = 0; i < weeklyNet.length; i++) {
    const net = weeklyNet[i]
    balance += net
    const weekStart = new Date(start.getTime() + i * 7 * 86_400_000).toISOString().slice(0, 10)
    weeks.push({
      weekStart,
      inflow: Math.round(Math.max(net, 0) + 180_000 + i * 1_500),
      outflow: Math.round(Math.max(-net, 0) + 180_000 + i * 1_500 - net),
      netChange: net,
      endingBalance: Math.round(balance),
    })
  }
  return weeks
}

export function totalCashPosition(): number {
  return DEMO_BANK_ACCOUNTS.reduce((sum, a) => sum + a.balance, 0)
}

export function totalReceivables(): number {
  return DEMO_RECEIVABLES.reduce((sum, r) => sum + r.amount, 0)
}

export function totalPayables(): number {
  return DEMO_PAYABLES.reduce((sum, p) => sum + p.amount, 0)
}

export function receivablesConcentration(): { customer: string; amount: number; pct: number }[] {
  const total = totalReceivables()
  const byCustomer = new Map<string, number>()
  for (const r of DEMO_RECEIVABLES) byCustomer.set(r.customer, (byCustomer.get(r.customer) ?? 0) + r.amount)
  return Array.from(byCustomer.entries())
    .map(([customer, amount]) => ({ customer, amount, pct: Math.round((amount / total) * 1000) / 10 }))
    .sort((a, b) => b.amount - a.amount)
}
