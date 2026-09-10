"use client"

/* ================================================================== *
 * REVEAL — scroll as the storytelling mechanism.
 *
 * One IntersectionObserver per revealed element, unobserved the moment
 * it fires. Nothing polls, nothing listens to scroll, and no animation
 * loop runs after a section has appeared — which is what keeps a page
 * of a dozen revealed sections from costing anything once read.
 *
 * REDUCED MOTION IS NOT A DEGRADED PATH. When a viewer asks for less
 * motion, `revealed` starts true: the content is simply *there*, fully
 * legible, with no transition to wait through. A reduced-motion reader
 * must never be left staring at an element that is still at opacity 0
 * because its animation was disabled but its initial state was not.
 * ================================================================== */

import { useCallback, useEffect, useRef, useState } from "react"

export function usePrefersReducedMotion(): boolean {
  // Starts false so server and first client paint agree; the effect
  // corrects it before anything animates.
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  return reduced
}

export interface RevealOptions {
  /** How far into the viewport before it counts as entered. */
  rootMargin?: string
  threshold?: number
}

/**
 * Returns a ref to attach and whether it has entered the viewport.
 * Fires once — a section that has told its part of the story does not
 * un-tell it when scrolled past.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options: RevealOptions = {}) {
  const { rootMargin = "0px 0px -12% 0px", threshold = 0.15 } = options
  const reduced = usePrefersReducedMotion()
  const [revealed, setRevealed] = useState(false)
  const ref = useRef<T | null>(null)

  useEffect(() => {
    if (reduced) {
      setRevealed(true)
      return
    }
    const node = ref.current
    if (!node) return

    // No IntersectionObserver (very old browser, some test envs): show
    // the content rather than hiding it forever.
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true)
            observer.unobserve(entry.target)
          }
        }
      },
      { rootMargin, threshold },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [reduced, rootMargin, threshold])

  return { ref, revealed, reduced }
}

/**
 * Counts up to `value` once revealed.
 *
 * The animation communicates DISCOVERY — numbers resolving as the
 * library is read — so it eases out and settles, rather than ticking
 * like a scoreboard. Under reduced motion it never runs: the final
 * value is what renders, immediately.
 */
export function useCountUp(value: number, revealed: boolean, durationMs = 900): number {
  const reduced = usePrefersReducedMotion()
  const [display, setDisplay] = useState(reduced ? value : 0)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    if (reduced || !revealed) {
      setDisplay(value)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      // easeOutExpo — fast to most of the way, then settles.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      setDisplay(Math.round(value * eased))
      if (t < 1) frame.current = requestAnimationFrame(tick)
      else frame.current = null
    }
    frame.current = requestAnimationFrame(tick)
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [value, revealed, reduced, durationMs])

  return display
}

/**
 * Staggered index-based delay, in ms, for a list that reveals in
 * sequence. Capped so a long list never leaves its tail waiting.
 */
export function useStagger(reduced: boolean) {
  return useCallback((index: number, step = 60, cap = 420) => (reduced ? 0 : Math.min(index * step, cap)), [reduced])
}
