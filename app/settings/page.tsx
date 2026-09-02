/* ------------------------------------------------------------------ *
 * /settings — minimal, real (org name, user email, sign out) + an
 * honest Coming-soon list for what isn't backed yet. See
 * components/settings/settings-page.tsx.
 * ------------------------------------------------------------------ */

import { SettingsPage } from "@/components/settings/settings-page"
import { StudioShell } from "@/components/studio/studio-shell"
import { getRuntimeMode } from "@/lib/runtime-mode"

export default function Settings() {
  const runtimeMode = getRuntimeMode()
  return (
    <StudioShell runtimeMode={runtimeMode}>
      <SettingsPage />
    </StudioShell>
  )
}
