/* ================================================================== *
 * CONNECTIONS, DERIVED FROM THE VIEWER'S OWN OBJECTS.
 *
 * The Connections graph used to draw the viewer's real concepts joined
 * by the SAMPLE library's edges: once concepts went live the nodes were
 * the person's own, but the relationships between them still came from
 * demo-data. The picture asserted that two of your ideas were related
 * on the authority of a fixture, and the panel beside it listed pairs
 * that were not on screen.
 *
 * Two concepts are connected when a real saved item carries both. The
 * weight is how many items do, and the items are named — so every edge
 * can be checked against the library it claims to describe.
 *
 * No imports: this file is pure derivation over data the caller already
 * fetched, which is also what makes it unit-testable under the
 * react-server test conditions (anything reaching lucide-react cannot
 * load there).
 * ================================================================== */

import type { KnowledgeConcept, KnowledgeConnection, KnowledgeObject } from "./types"

/**
 * Edges for the concepts these objects actually share.
 *
 * A concept id that is not in `concepts` cannot enter a pair. That is
 * the authorization property as well as a correctness one: `concepts`
 * is already scoped to one owner by the query that produced it, so an
 * id belonging to someone else matches nothing here no matter how it
 * arrived.
 *
 * Deterministic: pairs are keyed on the sorted id pair and the result
 * is sorted by weight then id, so the same library always draws the
 * same graph and a reader can build spatial memory of it.
 */
export function deriveConnections(
  objects: readonly KnowledgeObject[],
  concepts: readonly KnowledgeConcept[],
): KnowledgeConnection[] {
  const labelOf = new Map(concepts.map((c) => [c.id, c.label]))
  const pairs = new Map<string, string[]>()

  for (const object of objects) {
    // Deduplicated and sorted so `a::b` and `b::a` are one pair, and an
    // item that lists a concept twice does not count twice.
    const ids = [...new Set(object.conceptIds.filter((id) => labelOf.has(id)))].sort()
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = `${ids[i]}::${ids[j]}`
        pairs.set(key, [...(pairs.get(key) ?? []), object.id])
      }
    }
  }

  return [...pairs.entries()]
    .map(([key, objectIds]) => {
      const [sourceId, targetId] = key.split("::")
      const source = labelOf.get(sourceId)!
      const target = labelOf.get(targetId)!
      const n = objectIds.length
      return {
        id: key,
        sourceId,
        targetId,
        coOccurrences: n,
        // Assembled from the stored rows, never generated — which is
        // why the surface can show it as evidence rather than as a
        // claim the reader has to take on trust.
        evidence:
          n === 1
            ? `One piece you saved is about both ${source} and ${target}.`
            : `${n} pieces you saved are about both ${source} and ${target}.`,
        objectIds,
      }
    })
    .sort((x, y) => y.coOccurrences - x.coOccurrences || x.id.localeCompare(y.id))
}
