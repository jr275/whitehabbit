/* ------------------------------------------------------------------ *
 * /integrations/[id] — real per-connector detail (section "PHASE 3").
 * ------------------------------------------------------------------ */

import { IntegrationDetail } from "@/components/integrations/integration-detail"
import { StudioShell } from "@/components/studio/studio-shell"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default async function IntegrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const runtimeMode = getRuntimeMode()
  return (
    <StudioShell runtimeMode={runtimeMode}>
      <IntegrationDetail id={id} />
    </StudioShell>
  )
}
