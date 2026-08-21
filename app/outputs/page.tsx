/* ------------------------------------------------------------------ *
 * /outputs — the operating system for Worker productivity. What did
 * my Workers actually do, right now, today — not abstract KPIs.
 * ------------------------------------------------------------------ */

import { OutputsHub } from "@/components/outputs/outputs-hub"
import { StudioShell } from "@/components/studio/studio-shell"

export default function OutputsPage() {
  return (
    <StudioShell>
      <OutputsHub />
    </StudioShell>
  )
}
