import type { Metadata } from "next"
import { IntegrationsWorkspace } from "@/components/integrations/integrations-workspace"
import { getRuntimeMode } from "@/lib/runtime-mode"

export const metadata: Metadata = {
  title: "Integrations | WhiteHabbit",
  description: "Govern the tools, permissions, and data access available to your AI workforce.",
}

export default function IntegrationsPage() {
  return <IntegrationsWorkspace runtimeMode={getRuntimeMode()} />
}
