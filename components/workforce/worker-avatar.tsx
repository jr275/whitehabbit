"use client"

/* ------------------------------------------------------------------ *
 * WorkerAvatar — the one place a worker's visual identity is drawn.
 * Color + icon come from lib/workforce/visual-identity.ts (derived
 * from the worker's real primary skill category), never from a stored
 * per-worker random color. Every surface that shows "which worker is
 * this" (Studio canvas, switcher, Outputs Hub, evolve feed) renders
 * this component instead of its own ad-hoc colored initials circle.
 * ------------------------------------------------------------------ */

import { Landmark, MessagesSquare, PenLine, Search, Target } from "lucide-react"
import { getWorkerVisual } from "@/lib/workforce/visual-identity"
import type { Worker } from "@/lib/workforce/model"

const ICONS = { Search, PenLine, MessagesSquare, Target, Landmark }

const SIZE_CLASSES = {
  xs: "h-5 w-5",
  sm: "h-6 w-6",
  md: "h-9 w-9",
  lg: "h-12 w-12",
  xl: "h-14 w-14",
} as const

const ICON_SIZE_CLASSES = {
  xs: "h-2.5 w-2.5",
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
  xl: "h-6 w-6",
} as const

// Tailwind's JIT scanner needs literal class strings in source — never
// build one with template-string interpolation (`rounded-${x}` is
// invisible to it and silently renders unstyled).
const ROUNDED_CLASSES = {
  md: "rounded-md",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  full: "rounded-full",
} as const

export function WorkerAvatar({
  worker,
  size = "sm",
  rounded = "md",
  className = "",
}: {
  worker: Pick<Worker, "skills">
  size?: keyof typeof SIZE_CLASSES
  rounded?: "md" | "xl" | "2xl" | "full"
  className?: string
}) {
  const visual = getWorkerVisual(worker)
  const Icon = ICONS[visual.icon]
  return (
    <span
      className={`flex shrink-0 items-center justify-center text-white ${ROUNDED_CLASSES[rounded]} ${SIZE_CLASSES[size]} ${className}`}
      style={{ backgroundColor: visual.accent }}
      title={`${visual.label} worker`}
    >
      <Icon className={ICON_SIZE_CLASSES[size]} strokeWidth={2.25} />
    </span>
  )
}
