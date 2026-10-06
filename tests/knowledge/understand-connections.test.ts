/* ================================================================== *
 * CONNECTIONS ARE DERIVED FROM THE VIEWER'S OWN OBJECTS.
 *
 * The bug these cover: the graph drew the viewer's REAL concepts joined
 * by the SAMPLE library's edges, so it asserted relationships between
 * someone's own ideas on the authority of fixture data.
 * ================================================================== */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { deriveConnections } from "@/lib/knowledge/understand/connections"
import type { KnowledgeConcept, KnowledgeObject } from "@/lib/knowledge/understand/types"

function concept(id: string, label: string): KnowledgeConcept {
  return { id, label, itemCount: 1, kind: "concept" } as KnowledgeConcept
}

function object(id: string, conceptIds: string[]): KnowledgeObject {
  return { id, title: `Item ${id}`, conceptIds } as KnowledgeObject
}

describe("deriveConnections", () => {
  it("connects two concepts only when one real item carries both", () => {
    const concepts = [concept("a", "Agent Memory"), concept("b", "Tool Calling")]
    const edges = deriveConnections([object("o1", ["a", "b"])], concepts)

    assert.equal(edges.length, 1)
    assert.equal(edges[0].sourceId, "a")
    assert.equal(edges[0].targetId, "b")
    assert.deepEqual(edges[0].objectIds, ["o1"])
  })

  it("draws no edge between concepts that never share an item", () => {
    const concepts = [concept("a", "A"), concept("b", "B")]
    const edges = deriveConnections([object("o1", ["a"]), object("o2", ["b"])], concepts)

    assert.deepEqual(edges, [], "two concepts in the library is not a relationship")
  })

  it("weights an edge by how many items actually carry both", () => {
    const concepts = [concept("a", "A"), concept("b", "B")]
    const edges = deriveConnections([object("o1", ["a", "b"]), object("o2", ["a", "b"])], concepts)

    assert.equal(edges[0].coOccurrences, 2)
    assert.deepEqual(edges[0].objectIds, ["o1", "o2"])
  })

  it("IGNORES a concept id that is not one of the viewer's own", () => {
    // The concepts list is already scoped to one owner by the query
    // that produced it. An id from outside it must not become an edge,
    // however it arrived — a concept id is never authorization.
    const concepts = [concept("mine", "Mine")]
    const edges = deriveConnections([object("o1", ["mine", "someone-elses"])], concepts)

    assert.deepEqual(edges, [])
  })

  it("counts a concept listed twice on one item only once", () => {
    const concepts = [concept("a", "A"), concept("b", "B")]
    const edges = deriveConnections([object("o1", ["a", "a", "b"])], concepts)

    assert.equal(edges.length, 1)
    assert.equal(edges[0].coOccurrences, 1)
  })

  it("treats a pair as one edge regardless of the order it appears in", () => {
    const concepts = [concept("a", "A"), concept("b", "B")]
    const edges = deriveConnections([object("o1", ["a", "b"]), object("o2", ["b", "a"])], concepts)

    assert.equal(edges.length, 1, "a::b and b::a are the same relationship")
    assert.equal(edges[0].coOccurrences, 2)
  })

  it("states the reason from the stored rows, naming both ends", () => {
    // The sentence is shown as EVIDENCE, so it has to be checkable
    // against the data rather than generated.
    const concepts = [concept("a", "Agent Memory"), concept("b", "Tool Calling")]
    const one = deriveConnections([object("o1", ["a", "b"])], concepts)[0]
    const two = deriveConnections([object("o1", ["a", "b"]), object("o2", ["a", "b"])], concepts)[0]

    assert.match(one.evidence, /One piece/)
    assert.match(one.evidence, /Agent Memory/)
    assert.match(one.evidence, /Tool Calling/)
    assert.match(two.evidence, /^2 pieces/)
  })

  it("is deterministic — the same library always draws the same graph", () => {
    const concepts = [concept("a", "A"), concept("b", "B"), concept("c", "C")]
    const objects = [object("o1", ["a", "b"]), object("o2", ["b", "c"]), object("o3", ["a", "b"])]

    const first = deriveConnections(objects, concepts)
    const second = deriveConnections([...objects].reverse(), concepts)

    assert.deepEqual(
      first.map((e) => e.id),
      second.map((e) => e.id),
      "edge order must not depend on the order items were fetched in",
    )
    assert.equal(first[0].coOccurrences, 2, "the heaviest edge sorts first")
  })
})
