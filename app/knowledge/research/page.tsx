import type { Metadata } from "next"
import { PageHeader } from "@/components/knowledge/page-header"
import { ResearchView } from "@/components/knowledge/research-view"

export const metadata: Metadata = {
  title: "Research · Knowledge",
  description: "Group your saves into research projects and synthesize across sources.",
}

export default function ResearchPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
      <PageHeader
        eyebrow="Deep work"
        title="Research"
        description="Pull related saves into a project and let the system synthesize a point of view across your sources."
      />
      <ResearchView />
    </div>
  )
}
