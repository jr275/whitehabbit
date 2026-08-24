/* ------------------------------------------------------------------ *
 * StudioShell — the light operational frame shared by /studio and
 * /outputs. Scopes the light theme via .studio-surface and mounts the
 * persistent top nav. The immersive Fabric never passes through here.
 * ------------------------------------------------------------------ */

import type { ReactNode } from "react"
import { TopNav } from "./top-nav"

/* runtimeMode is computed server-side (lib/runtime-mode.ts, which
 * imports "server-only") by whichever page renders this — never
 * here. StudioShell itself is imported from BOTH real Server
 * Components (app/outputs/page.tsx) AND from within a Client
 * Component (worker-studio.tsx renders it directly, not via
 * children), so it must stay free of server-only imports itself; it
 * only ever receives the already-computed plain string as a prop. */
export function StudioShell({ children, runtimeMode }: { children: ReactNode; runtimeMode?: "development" | "preview" | "production" }) {
  return (
    <div className="studio-surface min-h-dvh bg-background text-foreground">
      <TopNav runtimeMode={runtimeMode} />
      <div className="bg-grid-light">{children}</div>
    </div>
  )
}
