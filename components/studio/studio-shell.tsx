/* ------------------------------------------------------------------ *
 * StudioShell — the light operational frame shared by /studio and
 * /outputs. Scopes the light theme via .studio-surface and mounts the
 * persistent top nav. The immersive Fabric never passes through here.
 * ------------------------------------------------------------------ */

import type { ReactNode } from "react"
import { TopNav } from "./top-nav"

export function StudioShell({ children }: { children: ReactNode }) {
  return (
    <div className="studio-surface min-h-dvh bg-background text-foreground">
      <TopNav />
      <div className="bg-grid-light">{children}</div>
    </div>
  )
}
