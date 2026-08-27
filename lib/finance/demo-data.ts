/* ================================================================== *
 * NORTHSTAR HOLDINGS — multi-entity DEMO financial dataset.
 *
 * Northstar Holdings is the shared fictional company used across the
 * product (see the approved Cursor reference: "Northstar Holdings",
 * subsidiaries Brazil / USA / Europe). This file does NOT duplicate
 * lib/agent/data/demo-financial-ledger.ts — the Northstar USA entity
 * below IS that file's existing, already-coherent dataset, wrapped
 * into the FinancialFactBase shape and tagged with an entityId. Brazil
 * and Europe are new, hand-built to be internally coherent the same
 * way (see that file's own header comment for the methodology this
 * follows), each in its own real currency (BRL / EUR) — never summed
 * across currencies without an explicit, labeled DEMO ASSUMPTION (§36).
 *
 * DEMO DATA. Never real bank, ERP, or accounting data. Every fact
 * below carries dataProvenance: "demo".
 * ================================================================== */

import {
  DEMO_BANK_ACCOUNTS,
  DEMO_CASH_FLOW_HISTORY,
  DEMO_LEDGER_AS_OF,
  DEMO_PAYABLES,
  DEMO_RECEIVABLES,
  NORTHSTAR_USA_ENTITY_ID,
} from "@/lib/agent/data/demo-financial-ledger"
import type {
  BankAccountFact,
  CashWeekFact,
  CustomerFact,
  Entity,
  FundingFacilityFact,
  PayableFact,
  ReceivableFact,
  SupplierFact,
  TransactionFact,
} from "./types"

export const AS_OF = DEMO_LEDGER_AS_OF

export const ENTITY_USA = NORTHSTAR_USA_ENTITY_ID
export const ENTITY_BRAZIL = "ent_brazil"
export const ENTITY_EUROPE = "ent_europe"

export const DEMO_ENTITIES: Entity[] = [
  { id: ENTITY_USA, entityId: ENTITY_USA, name: "Northstar USA", country: "United States", currency: "USD", source: "demo", sourceType: "entity", asOf: AS_OF, dataProvenance: "demo" },
  { id: ENTITY_BRAZIL, entityId: ENTITY_BRAZIL, name: "Northstar Brazil", country: "Brazil", currency: "BRL", source: "demo", sourceType: "entity", asOf: AS_OF, dataProvenance: "demo" },
  { id: ENTITY_EUROPE, entityId: ENTITY_EUROPE, name: "Northstar Europe", country: "Germany", currency: "EUR", source: "demo", sourceType: "entity", asOf: AS_OF, dataProvenance: "demo" },
]

/* ---- USA (wraps the existing, already-tested demo-financial-ledger.ts data — no new numbers) ---- */
export const USA_BANK_ACCOUNTS: BankAccountFact[] = DEMO_BANK_ACCOUNTS.map((a) => ({
  id: a.id,
  entityId: ENTITY_USA,
  bank: a.bank,
  accountType: a.accountType,
  balance: a.balance,
  yieldPct: a.yieldPct,
  currency: "USD",
  source: "demo",
  sourceType: "bank_account",
  asOf: AS_OF,
  dataProvenance: "demo",
}))

export const USA_RECEIVABLES: ReceivableFact[] = DEMO_RECEIVABLES.map((r) => ({
  id: r.id,
  entityId: ENTITY_USA,
  customerId: `cust_${r.customer.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
  customer: r.customer,
  invoiceId: r.id,
  amount: r.amount,
  issuedDate: r.issuedDate,
  dueDate: r.dueDate,
  status: r.status,
  currency: "USD",
  source: "demo",
  sourceType: "receivable",
  asOf: AS_OF,
  dataProvenance: "demo",
}))

export const USA_PAYABLES: PayableFact[] = DEMO_PAYABLES.map((p) => ({
  id: p.id,
  entityId: ENTITY_USA,
  supplierId: `sup_${p.supplier.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
  supplier: p.supplier,
  invoiceId: p.id,
  amount: p.amount,
  issuedDate: AS_OF,
  dueDate: p.dueDate,
  paymentTermsDays: p.paymentTermsDays,
  earlyPayDiscountPct: p.earlyPayDiscountPct,
  earlyPayWindowDays: p.earlyPayWindowDays,
  currency: "USD",
  source: "demo",
  sourceType: "payable",
  asOf: AS_OF,
  dataProvenance: "demo",
}))

export const USA_CASH_FLOW_HISTORY: CashWeekFact[] = DEMO_CASH_FLOW_HISTORY

/** New annual figures authored for the deterministic engine (DSO/DPO/
 * DIO/CCC need a period flow, which the original ledger — built only
 * for LLM-prose reasoning over balances — never needed). Chosen so the
 * resulting ratios land close to the illustrative figures used in this
 * phase's own brief (~47 DSO, ~31 DPO) — a coincidence of round-number
 * authorship, not a hidden dependency: change these three constants
 * and every DSO/DPO/DIO/CCC number below recalculates from them. */
export const USA_ANNUAL_REVENUE = 10_400_000
export const USA_ANNUAL_COGS = 6_600_000
export const USA_INVENTORY_VALUE = 450_000

export const USA_SUPPLIERS: SupplierFact[] = DEMO_PAYABLES.map((p) => ({
  id: `sup_${p.supplier.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
  entityId: ENTITY_USA,
  name: p.supplier,
  category: p.earlyPayDiscountPct > 0 ? "Packaging & Components" : "Services & Logistics",
  annualSpend: Math.round(p.amount * 4.2), // one open invoice's rough share of annual spend
  paymentTermsDays: p.paymentTermsDays,
  risk: p.amount > 130_000 ? "medium" : "low",
  relationshipYears: 3,
  currency: "USD",
  source: "demo",
  sourceType: "supplier",
  asOf: AS_OF,
  dataProvenance: "demo",
}))

export const USA_CUSTOMERS: CustomerFact[] = DEMO_RECEIVABLES.reduce<CustomerFact[]>((acc, r) => {
  const id = `cust_${r.customer.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
  if (acc.some((c) => c.id === id)) return acc
  acc.push({
    id,
    entityId: ENTITY_USA,
    name: r.customer,
    annualRevenue: Math.round(r.amount * 5.5),
    paymentTermsDays: 30,
    historicalPaymentBehavior: r.daysOverdue > 10 ? "erratic" : r.daysOverdue > 0 ? "stable" : "reliable",
    currency: "USD",
    source: "demo",
    sourceType: "customer",
    asOf: AS_OF,
    dataProvenance: "demo",
  })
  return acc
}, [])

export const USA_FUNDING_FACILITIES: FundingFacilityFact[] = [
  {
    id: "fund_usa_revolver",
    entityId: ENTITY_USA,
    facility: "Meridian Commercial Bank — Revolving Credit Facility",
    limit: 2_000_000,
    drawn: 500_000,
    ratePct: 7.25,
    maturity: "2027-06-30",
    currency: "USD",
    source: "demo",
    sourceType: "funding_facility",
    asOf: AS_OF,
    dataProvenance: "demo",
  },
]

/* ---- Brazil (BRL) — new, internally coherent ---- */
export const BRAZIL_BANK_ACCOUNTS: BankAccountFact[] = [
  { id: "acct_br_operating", entityId: ENTITY_BRAZIL, bank: "Banco Horizonte", accountType: "operating", balance: 1_180_000, yieldPct: 0.3, currency: "BRL", source: "demo", sourceType: "bank_account", asOf: AS_OF, dataProvenance: "demo" },
  { id: "acct_br_reserve", entityId: ENTITY_BRAZIL, bank: "Banco Horizonte", accountType: "reserve", balance: 420_000, yieldPct: 0.05, currency: "BRL", source: "demo", sourceType: "bank_account", asOf: AS_OF, dataProvenance: "demo" },
]

export const BRAZIL_RECEIVABLES: ReceivableFact[] = [
  { id: "inv_br_3001", entityId: ENTITY_BRAZIL, customerId: "cust_br_altavista", customer: "Altavista Varejo", invoiceId: "inv_br_3001", amount: 640_000, issuedDate: "2026-07-20", dueDate: "2026-08-19", status: "overdue", currency: "BRL", source: "demo", sourceType: "receivable", asOf: AS_OF, dataProvenance: "demo" },
  { id: "inv_br_3002", entityId: ENTITY_BRAZIL, customerId: "cust_br_serramar", customer: "Serramar Distribuidora", invoiceId: "inv_br_3002", amount: 510_000, issuedDate: "2026-08-02", dueDate: "2026-09-01", status: "current", currency: "BRL", source: "demo", sourceType: "receivable", asOf: AS_OF, dataProvenance: "demo" },
  { id: "inv_br_3003", entityId: ENTITY_BRAZIL, customerId: "cust_br_altavista", customer: "Altavista Varejo", invoiceId: "inv_br_3003", amount: 260_000, issuedDate: "2026-08-10", dueDate: "2026-09-09", status: "current", currency: "BRL", source: "demo", sourceType: "receivable", asOf: AS_OF, dataProvenance: "demo" },
]

export const BRAZIL_PAYABLES: PayableFact[] = [
  { id: "bill_br_4001", entityId: ENTITY_BRAZIL, supplierId: "sup_br_transnorte", supplier: "Transnorte Logistica", invoiceId: "bill_br_4001", amount: 310_000, issuedDate: AS_OF, dueDate: "2026-09-15", paymentTermsDays: 30, earlyPayDiscountPct: 0, earlyPayWindowDays: 0, currency: "BRL", source: "demo", sourceType: "payable", asOf: AS_OF, dataProvenance: "demo" },
  { id: "bill_br_4002", entityId: ENTITY_BRAZIL, supplierId: "sup_br_embalar", supplier: "Embalar Industrial", invoiceId: "bill_br_4002", amount: 175_000, issuedDate: AS_OF, dueDate: "2026-09-08", paymentTermsDays: 30, earlyPayDiscountPct: 1.5, earlyPayWindowDays: 10, currency: "BRL", source: "demo", sourceType: "payable", asOf: AS_OF, dataProvenance: "demo" },
]

export const BRAZIL_SUPPLIERS: SupplierFact[] = [
  { id: "sup_br_transnorte", entityId: ENTITY_BRAZIL, name: "Transnorte Logistica", category: "Logistics", annualSpend: 1_300_000, paymentTermsDays: 30, risk: "low", relationshipYears: 4, currency: "BRL", source: "demo", sourceType: "supplier", asOf: AS_OF, dataProvenance: "demo" },
  { id: "sup_br_embalar", entityId: ENTITY_BRAZIL, name: "Embalar Industrial", category: "Packaging", annualSpend: 735_000, paymentTermsDays: 30, risk: "medium", relationshipYears: 2, currency: "BRL", source: "demo", sourceType: "supplier", asOf: AS_OF, dataProvenance: "demo" },
]

export const BRAZIL_CUSTOMERS: CustomerFact[] = [
  { id: "cust_br_altavista", entityId: ENTITY_BRAZIL, name: "Altavista Varejo", annualRevenue: 4_950_000, paymentTermsDays: 30, historicalPaymentBehavior: "erratic", currency: "BRL", source: "demo", sourceType: "customer", asOf: AS_OF, dataProvenance: "demo" },
  { id: "cust_br_serramar", entityId: ENTITY_BRAZIL, name: "Serramar Distribuidora", annualRevenue: 2_800_000, paymentTermsDays: 30, historicalPaymentBehavior: "reliable", currency: "BRL", source: "demo", sourceType: "customer", asOf: AS_OF, dataProvenance: "demo" },
]

/* ---- Europe (EUR) — new, internally coherent ---- */
export const EUROPE_BANK_ACCOUNTS: BankAccountFact[] = [
  { id: "acct_eu_operating", entityId: ENTITY_EUROPE, bank: "Nordkreis Bank", accountType: "operating", balance: 610_000, yieldPct: 0.6, currency: "EUR", source: "demo", sourceType: "bank_account", asOf: AS_OF, dataProvenance: "demo" },
  { id: "acct_eu_reserve", entityId: ENTITY_EUROPE, bank: "Nordkreis Bank", accountType: "reserve", balance: 285_000, yieldPct: 0.15, currency: "EUR", source: "demo", sourceType: "bank_account", asOf: AS_OF, dataProvenance: "demo" },
]

export const EUROPE_RECEIVABLES: ReceivableFact[] = [
  { id: "inv_eu_5001", entityId: ENTITY_EUROPE, customerId: "cust_eu_baltichome", customer: "Baltic Home Group", invoiceId: "inv_eu_5001", amount: 410_000, issuedDate: "2026-07-28", dueDate: "2026-08-27", status: "current", currency: "EUR", source: "demo", sourceType: "receivable", asOf: AS_OF, dataProvenance: "demo" },
  { id: "inv_eu_5002", entityId: ENTITY_EUROPE, customerId: "cust_eu_rheinsupply", customer: "Rhein Supply Partners", invoiceId: "inv_eu_5002", amount: 265_000, issuedDate: "2026-08-05", dueDate: "2026-09-04", status: "current", currency: "EUR", source: "demo", sourceType: "receivable", asOf: AS_OF, dataProvenance: "demo" },
]

export const EUROPE_PAYABLES: PayableFact[] = [
  { id: "bill_eu_6001", entityId: ENTITY_EUROPE, supplierId: "sup_eu_alpenfracht", supplier: "Alpenfracht GmbH", invoiceId: "bill_eu_6001", amount: 190_000, issuedDate: AS_OF, dueDate: "2026-09-12", paymentTermsDays: 30, earlyPayDiscountPct: 0, earlyPayWindowDays: 0, currency: "EUR", source: "demo", sourceType: "payable", asOf: AS_OF, dataProvenance: "demo" },
]

export const EUROPE_SUPPLIERS: SupplierFact[] = [
  { id: "sup_eu_alpenfracht", entityId: ENTITY_EUROPE, name: "Alpenfracht GmbH", category: "Freight", annualSpend: 820_000, paymentTermsDays: 30, risk: "low", relationshipYears: 5, currency: "EUR", source: "demo", sourceType: "supplier", asOf: AS_OF, dataProvenance: "demo" },
]

export const EUROPE_CUSTOMERS: CustomerFact[] = [
  { id: "cust_eu_baltichome", entityId: ENTITY_EUROPE, name: "Baltic Home Group", annualRevenue: 2_050_000, paymentTermsDays: 30, historicalPaymentBehavior: "reliable", currency: "EUR", source: "demo", sourceType: "customer", asOf: AS_OF, dataProvenance: "demo" },
  { id: "cust_eu_rheinsupply", entityId: ENTITY_EUROPE, name: "Rhein Supply Partners", annualRevenue: 1_300_000, paymentTermsDays: 30, historicalPaymentBehavior: "stable", currency: "EUR", source: "demo", sourceType: "customer", asOf: AS_OF, dataProvenance: "demo" },
]

export const DEMO_TRANSACTIONS: TransactionFact[] = [
  { id: "txn_usa_1", entityId: ENTITY_USA, date: "2026-08-20", type: "inflow", amount: 185_000, category: "customer_payment", bankAccountId: "acct_operating", currency: "USD", source: "demo", sourceType: "transaction", asOf: AS_OF, dataProvenance: "demo" },
  { id: "txn_usa_2", entityId: ENTITY_USA, date: "2026-08-21", type: "outflow", amount: 92_000, category: "supplier_payment", bankAccountId: "acct_operating", currency: "USD", source: "demo", sourceType: "transaction", asOf: AS_OF, dataProvenance: "demo" },
  { id: "txn_br_1", entityId: ENTITY_BRAZIL, date: "2026-08-19", type: "outflow", amount: 88_000, category: "supplier_payment", bankAccountId: "acct_br_operating", currency: "BRL", source: "demo", sourceType: "transaction", asOf: AS_OF, dataProvenance: "demo" },
  { id: "txn_eu_1", entityId: ENTITY_EUROPE, date: "2026-08-18", type: "inflow", amount: 74_000, category: "customer_payment", bankAccountId: "acct_eu_operating", currency: "EUR", source: "demo", sourceType: "transaction", asOf: AS_OF, dataProvenance: "demo" },
]

/* ---- consolidated, entity-aware accessors ---- */
export const ALL_BANK_ACCOUNTS: BankAccountFact[] = [...USA_BANK_ACCOUNTS, ...BRAZIL_BANK_ACCOUNTS, ...EUROPE_BANK_ACCOUNTS]
export const ALL_RECEIVABLES: ReceivableFact[] = [...USA_RECEIVABLES, ...BRAZIL_RECEIVABLES, ...EUROPE_RECEIVABLES]
export const ALL_PAYABLES: PayableFact[] = [...USA_PAYABLES, ...BRAZIL_PAYABLES, ...EUROPE_PAYABLES]
export const ALL_SUPPLIERS: SupplierFact[] = [...USA_SUPPLIERS, ...BRAZIL_SUPPLIERS, ...EUROPE_SUPPLIERS]
export const ALL_CUSTOMERS: CustomerFact[] = [...USA_CUSTOMERS, ...BRAZIL_CUSTOMERS, ...EUROPE_CUSTOMERS]

export function bankAccountsForEntity(entityId: string): BankAccountFact[] {
  return ALL_BANK_ACCOUNTS.filter((a) => a.entityId === entityId)
}
