import "server-only"

/* Real connector registry — a DataSource's `connector` column is
 * validated against this, never an arbitrary string that resolves to
 * nothing at ingestion time. */

import type { DataConnector } from "./types"
import { fixtureConnector } from "./fixture-connector"

const REGISTRY: Record<string, DataConnector> = {
  fixture: fixtureConnector,
}

export function getConnector(key: string): DataConnector | null {
  return REGISTRY[key] ?? null
}

export function listConnectorKeys(): string[] {
  return Object.keys(REGISTRY)
}
