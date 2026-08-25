/* ------------------------------------------------------------------ *
 * /approvals — the real Human-in-the-Loop gate. Replaces the earlier
 * demo-store-backed page (lib/workforce-demo/) with one reading the
 * real, persisted approvals queue (GET /api/approvals) — see
 * lib/agent/tool-runner.ts's runToolAction() for where a real request
 * is created, and app/api/approvals/[id]/decide/route.ts for where a
 * real decision actually runs the captured action.
 * ------------------------------------------------------------------ */

import { ApprovalsPage } from "@/components/approvals/approvals-page"
import { StudioShell } from "@/components/studio/studio-shell"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default function Approvals() {
  const runtimeMode = getRuntimeMode()
  return (
    <StudioShell runtimeMode={runtimeMode}>
      <ApprovalsPage />
    </StudioShell>
  )
}
