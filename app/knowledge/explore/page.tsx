import { IntelligenceView, type SurfaceId } from "@/components/knowledge/intelligence/intelligence-view"

export const metadata = {
  title: "Explore · Knowledge",
}

const VALID = new Set([
  "overview",
  "concepts",
  "themes",
  "connections",
  "timeline",
  "insights",
  "questions",
  "gaps",
  "contradictions",
  "changes",
  "ask",
])

// Deep-linkable: /knowledge/explore?s=connections opens that surface.
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>
}) {
  const { s } = await searchParams
  const initial = s && VALID.has(s) ? (s as SurfaceId) : undefined
  return <IntelligenceView initial={initial} />
}
