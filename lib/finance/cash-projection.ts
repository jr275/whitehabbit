/* ================================================================== *
 * CASH POSITION ENGINE — deterministic 13-week BASELINE FORECAST (§8).
 *
 * Transparent logic, not a statistical model: each future week's known
 * inflows/outflows come from receivables/payables that actually fall
 * due in that week (real dated facts); everything else uses the
 * trailing 4-week average of real cash-flow history as a stated
 * baseline recurring flow. Every week is explicitly labeled
 * "BASELINE FORECAST" — never presented as a prediction with more
 * certainty than that.
 * ================================================================== */

import type { CashWeekFact, PayableFact, ReceivableFact } from "./types"
import type { CashProjectionResult, WeeklyCashProjection } from "./types"

const WEEK_MS = 7 * 86_400_000

export interface CashProjectionInput {
  asOfDate: string
  openingCash: number
  history: CashWeekFact[]
  receivables: ReceivableFact[]
  payables: PayableFact[]
  /** DEMO ASSUMPTION unless the caller passes a real operator-defined
   * value — see EconomicObjective.constraints in the Worker record.
   * Defaults to 1x the trailing 4-week average outflow: a common,
   * simple liquidity-buffer convention, not an external benchmark. */
  minimumLiquidityRequirement?: number
  horizonWeeks?: number
}

export function projectCashPosition13Weeks(input: CashProjectionInput): CashProjectionResult {
  const horizonWeeks = input.horizonWeeks ?? 13
  const trailing = input.history.slice(-4)
  const baselineWeeklyInflow = trailing.length ? avg(trailing.map((w) => w.inflow)) : 0
  const baselineWeeklyOutflow = trailing.length ? avg(trailing.map((w) => w.outflow)) : 0
  const minimumLiquidityRequirement = input.minimumLiquidityRequirement ?? round2(baselineWeeklyOutflow)

  const start = new Date(`${input.asOfDate}T00:00:00Z`)
  let opening = input.openingCash
  const weeks: WeeklyCashProjection[] = []

  for (let i = 0; i < horizonWeeks; i++) {
    const weekStartDate = new Date(start.getTime() + i * WEEK_MS)
    const weekEndDate = new Date(start.getTime() + (i + 1) * WEEK_MS)
    const weekStart = weekStartDate.toISOString().slice(0, 10)

    const knownInflow = input.receivables
      .filter((r) => r.status !== "paid" && inWindow(r.dueDate, weekStartDate, weekEndDate))
      .reduce((s, r) => s + r.amount, 0)
    const knownOutflow = input.payables.filter((p) => inWindow(p.dueDate, weekStartDate, weekEndDate)).reduce((s, p) => s + p.amount, 0)

    const inflows = round2(knownInflow + baselineWeeklyInflow)
    const outflows = round2(knownOutflow + baselineWeeklyOutflow)
    const closing = round2(opening + inflows - outflows)
    // "Committed" cash = known payables due within the horizon but not
    // yet this week — a simple, real, forward-looking obligation figure,
    // not a modeled reserve.
    const committed = round2(knownOutflow)
    const availableCash = round2(closing - committed)
    const liquidityBuffer = round2(availableCash - minimumLiquidityRequirement)
    const potentialShortfall = liquidityBuffer < 0 ? round2(-liquidityBuffer) : 0

    weeks.push({
      weekNumber: i + 1,
      weekStart,
      opening: round2(opening),
      inflows,
      outflows,
      closing,
      committed,
      availableCash,
      minimumLiquidityRequirement: round2(minimumLiquidityRequirement),
      liquidityBuffer,
      potentialShortfall,
    })
    opening = closing
  }

  const worstWeek = weeks.reduce<WeeklyCashProjection | null>((worst, w) => (worst === null || w.availableCash < worst.availableCash ? w : worst), null)

  return {
    label: "BASELINE FORECAST",
    horizonWeeks,
    weeks,
    openingCash: round2(input.openingCash),
    minimumMinCash: round2(minimumLiquidityRequirement),
    worstWeek,
  }
}

function inWindow(dateStr: string, start: Date, end: Date): boolean {
  const t = new Date(`${dateStr}T00:00:00Z`).getTime()
  return t >= start.getTime() && t < end.getTime()
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
