"use client"

import { TopNav } from "@/components/studio/top-nav"

/**
 * Compatibility wrapper for operational routes that previously mounted a
 * separate demo shell. These routes now share the persisted product shell.
 */
export function WorkforceNav() {
  return <TopNav />
}
