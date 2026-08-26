import "server-only"

/* ================================================================== *
 * DATA FRESHNESS (§21) — scans real dataset versions against their
 * data source's real freshness policy and emits a real `stale_data`
 * Signal for anything actually past its window. Never runs on a
 * schedule of its own (no cron infra beyond the existing worker tick,
 * ADR-017) — called opportunistically, same pattern as
 * lib/workflow/approval.ts's expireOverdueApprovals().
 * ================================================================== */

import { query } from "@/lib/db/client"
import { listDataSources, getLatestDatasetVersion, isStale } from "./connectors/repo"
import { recordSignal } from "./signals"

export async function detectStaleData(orgId: string, projectId: string): Promise<number> {
  const sources = await listDataSources(orgId, projectId)
  let staleCount = 0
  for (const source of sources) {
    const datasets = await query<{ id: string; name: string }>("SELECT id, name FROM datasets WHERE data_source_id = $1", [source.id])
    for (const dataset of datasets) {
      const version = await getLatestDatasetVersion(dataset.id, orgId)
      if (!version) continue
      if (isStale(source.freshnessPolicy, version.fetchedAt)) {
        staleCount += 1
        await recordSignal({
          orgId,
          projectId,
          sourceId: source.id,
          type: "stale_data",
          value: { dataSourceId: source.id, datasetId: dataset.id, datasetName: dataset.name, fetchedAt: version.fetchedAt, freshnessPolicy: source.freshnessPolicy },
          source: "data_freshness_scan",
          confidence: 1, // this is a real, computed fact (elapsed time vs. policy), not an estimate
        })
      }
    }
  }
  return staleCount
}
