"use client"

import { useEffect, useRef, useState } from "react"
import type { Envelope } from "./types"

/**
 * Minimal async-resource hook with an SWR-shaped return value
 * (`{ data, isLoading, error, provenance }`). The project does not ship
 * SWR, so this is a tiny local stand-in whose surface deliberately
 * matches SWR's — swapping to `useSWR` later is a one-line change per
 * call site with no shape churn.
 *
 * It reads through the async adapter (never the mock directly), so the
 * loading/error/provenance states are exactly what the UI will get from
 * the real API.
 */
export function useEnvelope<T>(key: string, fetcher: () => Promise<Envelope<T>>) {
  const [data, setData] = useState<T | null>(null)
  const [provenance, setProvenance] = useState<Envelope<T>["provenance"] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  // Keep the latest fetcher without making it a dependency (it is an
  // inline closure at the call site and would otherwise re-run forever).
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError(null)
    fetcherRef.current()
      .then((env) => {
        if (!active) return
        setData(env.data)
        setProvenance(env.provenance)
      })
      .catch((e) => {
        if (!active) return
        setError(e instanceof Error ? e : new Error(String(e)))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [key])

  return { data, provenance, isLoading, error }
}
