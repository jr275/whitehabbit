import "server-only"

/* ================================================================== *
 * FINANCIAL DATA TOOL — genuinely a DEMO capability, never a real bank
 * or ERP feed. isConnected() is honestly true (the demo ledger really
 * does work, every time, for every org) — that is a different fact
 * from "this is real financial data", which it is not. The `provider`
 * name says so explicitly, and every action result is marked so
 * callers can set SkillExecutionResult.dataProvenance = "demo" rather
 * than letting it default to "real".
 *
 * This is intentionally ONE tool with several read-only actions, not a
 * general Connector abstraction — see docs/financial-domain.md and the
 * blueprint's Phase Q for why introducing that abstraction now, before
 * a second real data source exists to justify it, would be overbuilding.
 * ================================================================== */

import {
  DEMO_BANK_ACCOUNTS,
  DEMO_CASH_FLOW_HISTORY,
  DEMO_COMPANY_NAME,
  DEMO_LEDGER_AS_OF,
  DEMO_PAYABLES,
  DEMO_RECEIVABLES,
  receivablesConcentration,
  totalCashPosition,
  totalPayables,
  totalReceivables,
} from "@/lib/agent/data/demo-financial-ledger"
import type { ToolActionResult, ToolDefinition } from "@/lib/agent/types"
import { USA_ANNUAL_COGS, USA_ANNUAL_REVENUE, USA_CUSTOMERS, USA_FUNDING_FACILITIES, USA_INVENTORY_VALUE, USA_SUPPLIERS } from "@/lib/finance/demo-data"

const PROVIDER_NAME = "Demo Financial Ledger (fictional data)"

interface DemoResult {
  provider: typeof PROVIDER_NAME
  asOfDate: string
  company: string
}

function demoEnvelope(): DemoResult {
  return { provider: PROVIDER_NAME, asOfDate: DEMO_LEDGER_AS_OF, company: DEMO_COMPANY_NAME }
}

async function getCashPosition(): Promise<ToolActionResult> {
  const started = Date.now()
  const idleAccounts = DEMO_BANK_ACCOUNTS.filter((a) => a.accountType === "reserve" && a.yieldPct < 0.5)
  return {
    ok: true,
    data: { ...demoEnvelope(), accounts: DEMO_BANK_ACCOUNTS, totalCash: totalCashPosition(), idleAccounts },
    durationMs: Date.now() - started,
  }
}

async function getReceivables(): Promise<ToolActionResult> {
  const started = Date.now()
  return {
    ok: true,
    data: {
      ...demoEnvelope(),
      receivables: DEMO_RECEIVABLES,
      totalReceivables: totalReceivables(),
      overdue: DEMO_RECEIVABLES.filter((r) => r.status === "overdue"),
      concentration: receivablesConcentration(),
    },
    durationMs: Date.now() - started,
  }
}

async function getPayables(): Promise<ToolActionResult> {
  const started = Date.now()
  return {
    ok: true,
    data: {
      ...demoEnvelope(),
      payables: DEMO_PAYABLES,
      totalPayables: totalPayables(),
      earlyPayOpportunities: DEMO_PAYABLES.filter((p) => p.earlyPayDiscountPct > 0),
    },
    durationMs: Date.now() - started,
  }
}

async function getCashFlowHistory(): Promise<ToolActionResult> {
  const started = Date.now()
  return {
    ok: true,
    data: { ...demoEnvelope(), weeks: DEMO_CASH_FLOW_HISTORY },
    durationMs: Date.now() - started,
  }
}

/* ---- Phase 3 additions: the facts the Financial Intelligence Engine
 * needs beyond the original four read actions above (suppliers,
 * customers, funding facilities, and the annual revenue/COGS/inventory
 * figures DSO/DPO/DIO/CCC require) — same tool, same demo provenance,
 * no new Tool abstraction (§5, §23). */
async function getSuppliers(): Promise<ToolActionResult> {
  const started = Date.now()
  return { ok: true, data: { ...demoEnvelope(), suppliers: USA_SUPPLIERS }, durationMs: Date.now() - started }
}

async function getCustomers(): Promise<ToolActionResult> {
  const started = Date.now()
  return { ok: true, data: { ...demoEnvelope(), customers: USA_CUSTOMERS }, durationMs: Date.now() - started }
}

async function getFundingFacilities(): Promise<ToolActionResult> {
  const started = Date.now()
  return { ok: true, data: { ...demoEnvelope(), facilities: USA_FUNDING_FACILITIES }, durationMs: Date.now() - started }
}

async function getAnnualFigures(): Promise<ToolActionResult> {
  const started = Date.now()
  return {
    ok: true,
    data: { ...demoEnvelope(), annualCreditSales: USA_ANNUAL_REVENUE, annualCOGS: USA_ANNUAL_COGS, inventoryValue: USA_INVENTORY_VALUE },
    durationMs: Date.now() - started,
  }
}

export const financialDataTool: ToolDefinition = {
  id: "tool_financial_data",
  name: "Financial Data",
  provider: PROVIDER_NAME,
  description: "Provides a demo, clearly fictional financial dataset for one illustrative company (cash, receivables, payables, suppliers, customers, funding facilities, 13-week cash flow history) — never real bank or ERP data.",
  isConnected: () => true, // the demo capability itself genuinely always works
  actions: [
    { id: "getCashPosition", label: "Get cash position", permission: "read", riskLevel: "low", run: getCashPosition },
    { id: "getReceivables", label: "Get receivables", permission: "read", riskLevel: "low", run: getReceivables },
    { id: "getPayables", label: "Get payables", permission: "read", riskLevel: "low", run: getPayables },
    { id: "getCashFlowHistory", label: "Get cash flow history", permission: "read", riskLevel: "low", run: getCashFlowHistory },
    { id: "getSuppliers", label: "Get suppliers", permission: "read", riskLevel: "low", run: getSuppliers },
    { id: "getCustomers", label: "Get customers", permission: "read", riskLevel: "low", run: getCustomers },
    { id: "getFundingFacilities", label: "Get funding facilities", permission: "read", riskLevel: "low", run: getFundingFacilities },
    { id: "getAnnualFigures", label: "Get annual revenue/COGS/inventory", permission: "read", riskLevel: "low", run: getAnnualFigures },
  ],
}
