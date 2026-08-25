/* ------------------------------------------------------------------ *
 * /marketing — the Marketing Super Agent's Command Center. WORLD ->
 * BRAND -> AUDIENCE -> OPPORTUNITY -> CREATIVE, made visible.
 * ------------------------------------------------------------------ */

import { MarketingCommandCenter } from "@/components/marketing/command-center"
import { StudioShell } from "@/components/studio/studio-shell"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default function MarketingPage() {
  const runtimeMode = getRuntimeMode()
  return (
    <StudioShell runtimeMode={runtimeMode}>
      <MarketingCommandCenter />
    </StudioShell>
  )
}
