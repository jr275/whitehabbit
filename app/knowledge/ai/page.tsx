import type { Metadata } from "next"
import { PageHeader } from "@/components/knowledge/page-header"
import { AiView } from "@/components/knowledge/ai-view"

export const metadata: Metadata = {
  title: "Ask · Knowledge",
  description: "Ask your own library and surface the connections in what you save.",
}

export default function AiPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
      <PageHeader
        eyebrow="Intelligence"
        title="Ask your library"
        description="Query everything you've saved. Every answer is grounded in your own pieces, with citations."
      />
      <AiView />
    </div>
  )
}
