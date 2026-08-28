import { IntelligenceGraph } from "@/components/mission/intelligence-graph"

/* Knowledge is now the flagship ontology-explorer entry point (Phase
 * UI-4, docs/ontology-ui-architecture-v1.md §3-4): the same real,
 * shared multi-mode System Graph + universal Object Inspector
 * `/intelligence/map` uses, opened straight into "knowledge" mode —
 * never a second, parallel explorer. */
export default function KnowledgePage() {
  return <IntelligenceGraph initialMode="knowledge" />
}
