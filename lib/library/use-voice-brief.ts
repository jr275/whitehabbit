"use client"

/* ------------------------------------------------------------------ *
 * useVoiceBrief — captures a spoken brief.
 *
 * Uses the Web Speech API when the browser grants microphone access.
 * When speech recognition is unavailable or denied (common inside
 * sandboxed preview frames), it falls back to a deterministic demo
 * that streams a sample brief word-by-word — so the VOICE -> SPEC
 * transformation is always demonstrable. A live amplitude signal
 * drives the waveform in both modes.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useRef, useState } from "react"

export type VoiceStatus = "idle" | "listening" | "processing" | "done"

interface Options {
  /** Streamed out in demo mode; also shown as the placeholder prompt. */
  sampleBrief: string
  onComplete?: (transcript: string) => void
}

interface VoiceBrief {
  status: VoiceStatus
  transcript: string
  amplitudes: number[]
  supported: boolean
  usingDemo: boolean
  start: () => void
  stop: () => void
  reset: () => void
}

const BARS = 28

export function useVoiceBrief({ sampleBrief, onComplete }: Options): VoiceBrief {
  const [status, setStatus] = useState<VoiceStatus>("idle")
  const [transcript, setTranscript] = useState("")
  const [amplitudes, setAmplitudes] = useState<number[]>(() => new Array(BARS).fill(0.06))
  const [usingDemo, setUsingDemo] = useState(false)

  const rafRef = useRef<number | null>(null)
  const recognitionRef = useRef<any>(null)
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const supported =
    typeof window !== "undefined" &&
    (("webkitSpeechRecognition" in window) || ("SpeechRecognition" in window))

  /* animated waveform ------------------------------------------------ */
  const animate = useCallback(() => {
    const tick = () => {
      setAmplitudes((prev) =>
        prev.map((_, i) => {
          const base = 0.35 + 0.45 * Math.abs(Math.sin(Date.now() / 320 + i * 0.6))
          const jitter = Math.random() * 0.28
          return Math.min(1, base * 0.7 + jitter)
        }),
      )
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const stopAnimation = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    setAmplitudes(new Array(BARS).fill(0.06))
  }, [])

  const finish = useCallback((finalText: string) => {
    stopAnimation()
    setStatus("processing")
    // brief "thinking" beat before the spec appears
    demoTimer.current = setTimeout(() => {
      setStatus("done")
      onCompleteRef.current?.(finalText)
    }, 650)
  }, [stopAnimation])

  /* demo streaming --------------------------------------------------- */
  const runDemo = useCallback(() => {
    setUsingDemo(true)
    setStatus("listening")
    setTranscript("")
    animate()
    const words = sampleBrief.split(" ")
    let i = 0
    const step = () => {
      i += 1
      setTranscript(words.slice(0, i).join(" "))
      if (i < words.length) {
        demoTimer.current = setTimeout(step, 90 + Math.random() * 70)
      } else {
        finish(sampleBrief)
      }
    }
    demoTimer.current = setTimeout(step, 400)
  }, [sampleBrief, animate, finish])

  const start = useCallback(() => {
    setTranscript("")
    if (!supported) {
      runDemo()
      return
    }
    try {
      const Ctor: any =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      const rec = new Ctor()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = "en-US"
      let final = ""
      rec.onresult = (e: any) => {
        let interim = ""
        for (let k = e.resultIndex; k < e.results.length; k++) {
          const seg = e.results[k]
          if (seg.isFinal) final += seg[0].transcript
          else interim += seg[0].transcript
        }
        setTranscript((final + interim).trim())
      }
      rec.onerror = () => {
        try { rec.stop() } catch {}
        runDemo()
      }
      rec.onend = () => {
        if (final.trim()) finish(final.trim())
      }
      recognitionRef.current = rec
      setUsingDemo(false)
      setStatus("listening")
      animate()
      rec.start()
    } catch {
      runDemo()
    }
  }, [supported, runDemo, animate, finish])

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
    }
    if (usingDemo) {
      if (demoTimer.current) clearTimeout(demoTimer.current)
      finish(transcript || sampleBrief)
    }
  }, [usingDemo, transcript, sampleBrief, finish])

  const reset = useCallback(() => {
    if (demoTimer.current) clearTimeout(demoTimer.current)
    if (recognitionRef.current) { try { recognitionRef.current.stop() } catch {} }
    stopAnimation()
    setStatus("idle")
    setTranscript("")
    setUsingDemo(false)
  }, [stopAnimation])

  useEffect(() => {
    return () => {
      if (demoTimer.current) clearTimeout(demoTimer.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (recognitionRef.current) { try { recognitionRef.current.stop() } catch {} }
    }
  }, [])

  return { status, transcript, amplitudes, supported, usingDemo, start, stop, reset }
}
