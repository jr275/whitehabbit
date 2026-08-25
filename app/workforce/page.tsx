/* ------------------------------------------------------------------ *
 * /workforce — WORKERS. The real Worker directory: "who is working?"
 * Replaces the earlier demo-store-backed page (org-chart, lead/
 * specialist roles, competence scores — lib/workforce-demo/) with one
 * reading the real, persisted Worker/Execution/Output ledger (GET
 * /api/observatory/workers — the same real endpoint Observatory's own
 * Worker health panel uses) — same "replace the demo page in place"
 * pattern already established for /approvals, /outputs, /observatory.
 * ------------------------------------------------------------------ */

import { StudioShell } from "@/components/studio/studio-shell"
import { WorkersDirectory } from "@/components/workers/workers-directory"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default function WorkforcePage() {
  const runtimeMode = getRuntimeMode()
  return (
    <StudioShell runtimeMode={runtimeMode}>
      <WorkersDirectory />
    </StudioShell>
  )
}
