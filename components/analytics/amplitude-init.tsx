"use client"

/* ------------------------------------------------------------------ *
 * AMPLITUDE — analytics + session replay init. Mounted once in
 * app/layout.tsx so it runs on every route, client-side only. Product
 * events are tracked at the call site they represent (e.g. "Viewed
 * Home Page" in components/home/product-home.tsx) — the SDK queues
 * events fired before init resolves, so ordering across components
 * isn't a concern.
 * ------------------------------------------------------------------ */

import * as amplitude from "@amplitude/unified"
import { useEffect } from "react"

const AMPLITUDE_API_KEY = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY

let initialized = false

export function AmplitudeInit() {
  useEffect(() => {
    if (initialized) return
    initialized = true

    if (!AMPLITUDE_API_KEY) {
      console.warn("Amplitude API key missing — analytics disabled")
      return
    }

    amplitude.initAll(AMPLITUDE_API_KEY, { analytics: { autocapture: true }, sessionReplay: { sampleRate: 1 } })
  }, [])

  return null
}
