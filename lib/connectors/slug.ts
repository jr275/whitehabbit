/* ================================================================== *
 * SLUG — a stable, URL-safe identifier for a custom connector, derived
 * from its name (connector platform audit, Fase D1). Distinct from
 * the opaque cconn_<uuid> id: a slug is what a friendly URL or a
 * cross-reference would use, matching the pattern static connectors
 * already have via ConnectorDefinition.id being a real, readable
 * string ("connector_salesforce", not a uuid).
 *
 * Not guaranteed globally unique on its own — migrations/
 * 0011_custom_connector_contract.sql enforces uniqueness per
 * organization (idx_custom_connectors_org_slug); a name collision
 * within one org must be resolved by the caller (see
 * lib/db/repo.ts's createCustomConnector, which retries with a suffix
 * on a real unique-constraint violation rather than guessing ahead of
 * time whether one will happen).
 * ================================================================== */

// ̀-ͯ is the Unicode "Combining Diacritical Marks" block —
// what NFKD decomposition splits an accented letter (é) into (e + ́),
// so stripping this range after normalize("NFKD") turns "é" into "e"
// rather than dropping it or leaving a stray combining mark behind.
const COMBINING_DIACRITICS = /[̀-ͯ]/g

export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
  return base || "connector"
}
