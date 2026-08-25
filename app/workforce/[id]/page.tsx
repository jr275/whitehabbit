/* ------------------------------------------------------------------ *
 * /workforce/[id] — AGENT DETAIL. Replaces the earlier demo-store-
 * backed page (lib/workforce-demo/ org-chart/IP/heuristics content,
 * keyed against a demo store that almost never matched the real DB
 * id a click from the real Agents directory actually passes) with the
 * real thing — see components/workers/worker-detail.tsx. Same
 * "replace the demo page in place" pattern already established for
 * /approvals, /outputs, /observatory, /workforce.
 * ------------------------------------------------------------------ */

import { WorkerDetail } from "@/components/workers/worker-detail"
import { StudioShell } from "@/components/studio/studio-shell"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default async function WorkerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const runtimeMode = getRuntimeMode()
  return (
    <StudioShell runtimeMode={runtimeMode}>
      <WorkerDetail id={id} />
    </StudioShell>
  )
}
