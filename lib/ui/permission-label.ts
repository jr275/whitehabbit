/* ================================================================== *
 * PERMISSION LABEL — the one shared mapping from the real
 * ToolPermission vocabulary (lib/agent/types.ts, also reused verbatim
 * by lib/workforce/model.ts's ToolPermission and every
 * ConnectorAction) onto the 3-way "Read-only / Write / Destructive"
 * label the product brief asks for everywhere a Tool/Action is shown
 * (Agent Detail's Tools tab, Studio's Tools step, Connector Detail's
 * Actions table). No screen defines this mapping itself — they all
 * import it from here, so the label is identical everywhere.
 *
 * Client-safe (no "server-only") — every one of those three surfaces
 * is a client component.
 * ================================================================== */

import type { ToolPermission } from "@/lib/agent/types"

export type PermissionLabel = "Read-only" | "Write" | "Destructive"

/** read -> Read-only (never mutates anything).
 * write / publish -> Write (mutates external state, but reversible/
 * ordinary in nature).
 * delete / financial / external_communication -> Destructive (data
 * loss, money movement, or an irreversible outward message — the
 * same set lib/workforce/model.ts already calls HIGH_RISK_PERMISSIONS,
 * minus write/publish, which this label treats one notch lower). */
export function toolPermissionLabel(permission: ToolPermission): PermissionLabel {
  if (permission === "read") return "Read-only"
  if (permission === "write" || permission === "publish") return "Write"
  return "Destructive" // delete | financial | external_communication
}

/** Reuses the exact same 5-tone vocabulary components/shared/tone-pill.tsx
 * and components/studio/primitives.tsx's StatusDot already use — never a
 * new color system. */
export function toolPermissionTone(permission: ToolPermission): "good" | "warn" | "bad" {
  const label = toolPermissionLabel(permission)
  if (label === "Read-only") return "good"
  if (label === "Write") return "warn"
  return "bad"
}
