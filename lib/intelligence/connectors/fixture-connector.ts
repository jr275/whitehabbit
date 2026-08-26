/* ================================================================== *
 * FIXTURE CONNECTOR (§20) — a real, working implementation of
 * DataConnector proving the interface is genuinely usable, explicitly
 * NOT a live external API. Config supplies its own fixed dataset —
 * never fabricates data on its own; a caller must pass real rows via
 * config.rows. Used by tests and as a template for a real future
 * connector (e.g. a government open-data API, a market-data provider).
 * ================================================================== */

import type { DataConnector, DiscoveredDataset, FetchedRow, ValidationResult } from "./types"

export const fixtureConnector: DataConnector = {
  key: "fixture",

  async discover(config: Record<string, unknown>): Promise<DiscoveredDataset[]> {
    const datasets = (config.datasets as { id: string; name: string }[] | undefined) ?? []
    return datasets.map((d) => ({ externalId: d.id, name: d.name, schema: { key: "string", value: "number" } }))
  },

  async fetch(config: Record<string, unknown>, datasetExternalId: string): Promise<FetchedRow[]> {
    const rows = (config.rows as Record<string, FetchedRow[]> | undefined) ?? {}
    // defaults observedAt the same way normalize() does — a caller
    // supplying a fixture row without one is still a real row, just
    // one observed "now" rather than at a specific historical time.
    return (rows[datasetExternalId] ?? []).map((r) => ({ ...r, observedAt: r.observedAt ?? Date.now() }))
  },

  normalize(raw: unknown): FetchedRow[] {
    if (!Array.isArray(raw)) return []
    return raw
      .filter((r): r is { key: string; value: unknown; observedAt?: number } => typeof r === "object" && r !== null && "key" in r && "value" in r)
      .map((r) => ({ key: r.key, value: r.value, observedAt: r.observedAt ?? Date.now() }))
  },

  validate(rows: FetchedRow[]): ValidationResult {
    const errors: string[] = []
    for (const row of rows) {
      if (!row.key) errors.push("A row is missing its key.")
      if (row.value === undefined || row.value === null) errors.push(`Row "${row.key}" has no value.`)
    }
    return { valid: errors.length === 0, errors }
  },
}
