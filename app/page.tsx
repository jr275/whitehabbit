/* ------------------------------------------------------------------ *
 * "/" — Overview: the real operational home of the AI Agent Operating
 * System. Replaces the old "/" (the Assemble Worker creation flow,
 * unchanged, now at /new). Same pattern every other real page in this
 * shell already uses (see app/observatory/page.tsx) — StudioShell +
 * a client component reading real data.
 * ------------------------------------------------------------------ */

import { OverviewPage } from "@/components/overview/overview-page"
import { StudioShell } from "@/components/studio/studio-shell"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default function Overview() {
  const runtimeMode = getRuntimeMode()
  return (
    <StudioShell runtimeMode={runtimeMode}>
      <OverviewPage />
    </StudioShell>
  )
}
