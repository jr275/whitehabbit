/* ------------------------------------------------------------------ *
 * /outputs — the operating system for Worker productivity. What did
 * my Workers actually do, right now, today — not abstract KPIs.
 * ------------------------------------------------------------------ */

import { OutputsHub } from "@/components/outputs/outputs-hub"
import { StudioShell } from "@/components/studio/studio-shell"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default function OutputsPage() {
  const runtimeMode = getRuntimeMode()
  return (
    <StudioShell runtimeMode={runtimeMode}>
      <OutputsHub />
    </StudioShell>
  )
}
