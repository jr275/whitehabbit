import { Compass } from "lucide-react"
import { ComingSoon } from "@/components/knowledge/coming-soon"

export const metadata = {
  title: "Research · Knowledge",
  description: "Group your saves into research projects and synthesize across sources.",
}

export default function ResearchPage() {
  return (
    <ComingSoon
      eyebrow="Deep work"
      title="Research across your sources."
      description="Pull related saves into a project and synthesize a point of view across them."
      icon={Compass}
      bullets={[
        "Group saved pieces into a focused research thread",
        "Cross-source synthesis grounded in the extracted text",
        "Export notes and citations from a project",
      ]}
    />
  )
}
