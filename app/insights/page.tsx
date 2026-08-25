import { MarketingCommandCenter } from "@/components/insights/marketing-command-center"
import { TopNav } from "@/components/studio/top-nav"

export const metadata = {
  title: "Agent Smith Marketing Command Center — Menlo Whitehabbit",
  description: "Inspect market signals, autonomous worker reasoning, creative output, live execution, and measurable marketing impact.",
}

export default function InsightsPage() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <MarketingCommandCenter />
    </div>
  )
}
