"use client"

/* Section 7 (original Observatory brief) / section 20 (productization
 * brief): a workspace with zero real executions is a legitimate,
 * common state — never rendered as "0 Agents / 0 Executions / 0
 * Errors". Thin Observatory-specific wrapper over the shared
 * EmptyState (components/shared/empty-state.tsx), which every other
 * real page (Workers, History, Operational Intelligence) also uses. */

import { EmptyState } from "@/components/shared/empty-state"

export function ObservatoryEmptyState() {
  return (
    <EmptyState
      title="No runtime activity yet."
      description="Nothing has run in this workspace — real executions, events and outputs will appear here the moment a Worker actually runs."
      ctaHref="/new"
      ctaLabel="Run your first Agent"
    />
  )
}
