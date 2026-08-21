"use client"

import { useEffect } from "react"
import { useSyncExternalStore } from "react"
import { characterStore } from "./character-store"

/**
 * Subscribe to the character store. Hydrates on first mount (client
 * only) so the seeded Atlas — or a persisted worker — is available.
 */
export function useCharacter() {
  const snapshot = useSyncExternalStore(
    characterStore.subscribe,
    characterStore.getSnapshot,
    characterStore.getSnapshot,
  )

  useEffect(() => {
    characterStore.hydrate()
  }, [])

  return snapshot
}
