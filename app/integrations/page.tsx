/* ------------------------------------------------------------------ *
 * /integrations — the Connector Hub (nav label "Connectors"; on-page
 * heading "Connector Hub" — see components/integrations/integration-
 * hub.tsx). A dedicated product surface (section "PHASE 2"), not a
 * rename of /connections. Component/file names kept as "integration-*"
 * — a route/file rename, unlike the label, isn't required for the new
 * IA and would be a pure churn risk for zero product benefit.
 * ------------------------------------------------------------------ */

import { Suspense } from "react"
import { IntegrationHub } from "@/components/integrations/integration-hub"
import { StudioShell } from "@/components/studio/studio-shell"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default function IntegrationsPage() {
  const runtimeMode = getRuntimeMode()
  return (
    <StudioShell runtimeMode={runtimeMode}>
      <Suspense fallback={null}>
        <IntegrationHub />
      </Suspense>
    </StudioShell>
  )
}
