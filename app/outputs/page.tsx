/* ------------------------------------------------------------------ *
 * /outputs — the operating system for Worker productivity. What did
 * my Workers actually do, right now, today — not abstract KPIs.
 * ------------------------------------------------------------------ */

import { Suspense } from "react"
import { OutputsHub } from "@/components/outputs/outputs-hub"
import { StudioShell } from "@/components/studio/studio-shell"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default function OutputsPage() {
  const runtimeMode = getRuntimeMode()
  // OutputsHub reads ?execution= via useSearchParams (Observatory's real
  // deep link into the existing OutputDrawer) — Next requires that behind
  // a Suspense boundary so the shell can still prerender.
  return (
    <StudioShell runtimeMode={runtimeMode}>
      <Suspense fallback={null}>
        <OutputsHub />
      </Suspense>
    </StudioShell>
  )
}
