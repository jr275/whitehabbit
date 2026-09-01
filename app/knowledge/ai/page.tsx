import { Sparkles } from "lucide-react"
import { ComingSoon } from "@/components/knowledge/coming-soon"

export const metadata = {
  title: "Ask · Knowledge",
  description: "Ask your own library and surface the connections in what you save.",
}

export default function AiPage() {
  return (
    <ComingSoon
      eyebrow="Intelligence"
      title="Ask your library."
      description="Query everything you've saved and get answers grounded in your own pieces, with citations."
      icon={Sparkles}
      bullets={[
        "Retrieval over the real extracted text of your saves",
        "Answers cite the exact pieces they draw from",
        "Surfaces connections between things you saved at different times",
      ]}
    />
  )
}
