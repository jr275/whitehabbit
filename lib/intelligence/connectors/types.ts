/* ================================================================== *
 * DATA CONNECTOR (§20) — provider-independent, mirroring
 * lib/agent/tools/llm-providers' abstraction pattern. A connector
 * declares discover/fetch/normalize/validate; nothing outside this
 * interface ever assumes a specific external API's shape.
 * ================================================================== */

export interface DiscoveredDataset {
  externalId: string
  name: string
  schema: Record<string, unknown>
}

export interface FetchedRow {
  key: string
  value: unknown
  observedAt: number
  entityHint?: string // a real, connector-supplied hint (e.g. a name) for matching to an existing Entity — never a fabricated match
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export interface DataConnector {
  key: string
  /** Lists real datasets this connector's configured source actually
   * offers — never a fabricated catalog. */
  discover(config: Record<string, unknown>): Promise<DiscoveredDataset[]>
  /** Fetches real rows for one dataset. */
  fetch(config: Record<string, unknown>, datasetExternalId: string): Promise<FetchedRow[]>
  /** Normalizes a connector-native row shape into FetchedRow — kept
   * separate from fetch() so a connector's raw response format can
   * change without touching the generic ingestion pipeline. */
  normalize(raw: unknown): FetchedRow[]
  /** Real structural/sanity validation — never lets malformed data
   * silently become "truth" (§20). */
  validate(rows: FetchedRow[]): ValidationResult
}
