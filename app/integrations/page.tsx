import type { Metadata } from "next"
import { Suspense } from "react"
import { IntegrationsWorkspace } from "@/components/integrations/integrations-workspace"
import { getRuntimeMode } from "@/lib/runtime-mode"

export const metadata: Metadata = {
  title: "Integrations | Menlo Whitehabbit",
  description: "Govern the tools, permissions, and data access available to your AI workforce.",
}

export default function IntegrationsPage() {
  // IntegrationsWorkspace reads ?connected=/?error= via useSearchParams()
  // (real create/test-flow feedback) — Next.js requires a Suspense
  // boundary around any client component that calls it, or the static
  // build bails out entirely on this route.
  return (
    <Suspense fallback={null}>
      <IntegrationsWorkspace runtimeMode={getRuntimeMode()} />
    </Suspense>
  )
}
