/* ------------------------------------------------------------------ *
 * /observatory — real operational observability. Replaces the earlier
 * demo-store-backed page (lib/workforce-demo/) with one reading the
 * real, persisted runtime (GET /api/observatory/*) — same pattern
 * already established for /approvals and /outputs. See
 * components/observatory/observatory-page.tsx.
 * ------------------------------------------------------------------ */

import { ObservatoryPage } from "@/components/observatory/observatory-page"
import { StudioShell } from "@/components/studio/studio-shell"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default function Observatory() {
  const runtimeMode = getRuntimeMode()
  return (
    <StudioShell runtimeMode={runtimeMode}>
      <ObservatoryPage />
    </StudioShell>
  )
}
