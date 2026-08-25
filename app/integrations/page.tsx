/* ------------------------------------------------------------------ *
 * /integrations — the Integration Hub. A dedicated product surface
 * (section "PHASE 2"), not a rename of /connections.
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
