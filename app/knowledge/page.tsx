/* ------------------------------------------------------------------ *
 * /knowledge — an honest Coming-soon page (no cross-Agent knowledge
 * backend exists yet — see components/knowledge/knowledge-page.tsx).
 * ------------------------------------------------------------------ */

import { KnowledgePage } from "@/components/knowledge/knowledge-page"
import { StudioShell } from "@/components/studio/studio-shell"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default function Knowledge() {
  const runtimeMode = getRuntimeMode()
  return (
    <StudioShell runtimeMode={runtimeMode}>
      <KnowledgePage />
    </StudioShell>
  )
}
