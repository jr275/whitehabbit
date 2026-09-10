"use client"

/* ================================================================== *
 * ADAPTER BOUNDARY — the only place the surface learns where data
 * comes from.
 *
 * Every hook returns the same envelope shape a real fetch would:
 * { data, status, origin }. Components branch on `status`, never on
 * whether the value happens to be a literal, so replacing a body with
 * a real request is a change inside this file and nowhere else.
 *
 * They resolve synchronously today. That is deliberate: a fake latency
 * timer would make the demo feel slower AND would train the components
 * to expect a loading state that the real implementation may not have.
 * The `status` field exists so a real async version can use it without
 * a component rewrite; it is simply always "ready" right now.
 * ================================================================== */

import { useCallback, useMemo, useState } from "react"
import {
  ASK_SUGGESTIONS,
  CONCEPTS,
  CONNECTIONS,
  INSIGHTS,
  OBJECTS,
  OVERVIEW,
  QUESTIONS,
  RESEARCH_SUGGESTIONS,
  THEMES,
  TIMELINE,
  askResultFor,
  researchFindingFor,
} from "./demo-data"
import type {
  AskResult,
  DataOrigin,
  KnowledgeConcept,
  KnowledgeConnection,
  KnowledgeInsight,
  KnowledgeObject,
  KnowledgeOverview,
  KnowledgeQuestion,
  KnowledgeTheme,
  KnowledgeTimelineEvent,
  ResearchStage,
  ResearchState,
  VoiceIntentKind,
  VoiceState,
} from "./types"
import { RESEARCH_STAGES } from "./types"

export interface Resource<T> {
  data: T
  status: "loading" | "ready" | "error"
  origin: DataOrigin
}

function ready<T>(data: T): Resource<T> {
  return { data, status: "ready", origin: OVERVIEW.origin }
}

export function useKnowledgeOverview(): Resource<KnowledgeOverview> {
  return useMemo(() => ready(OVERVIEW), [])
}

export function useKnowledgeThemes(): Resource<KnowledgeTheme[]> {
  return useMemo(() => ready(THEMES), [])
}

export function useKnowledgeConcepts(): Resource<KnowledgeConcept[]> {
  return useMemo(() => ready(CONCEPTS), [])
}

export function useKnowledgeConnections(): Resource<KnowledgeConnection[]> {
  return useMemo(() => ready(CONNECTIONS), [])
}

export function useKnowledgeTimeline(): Resource<KnowledgeTimelineEvent[]> {
  return useMemo(() => ready(TIMELINE), [])
}

export function useKnowledgeQuestions(): Resource<KnowledgeQuestion[]> {
  return useMemo(() => ready(QUESTIONS), [])
}

export function useKnowledgeInsights(): Resource<KnowledgeInsight[]> {
  return useMemo(() => ready(INSIGHTS), [])
}

export function useKnowledgeObjects(): Resource<KnowledgeObject[]> {
  return useMemo(() => ready(OBJECTS), [])
}

/* ---- ask ------------------------------------------------------------ */

export interface AskController {
  question: string
  setQuestion: (value: string) => void
  result: AskResult | null
  status: "idle" | "thinking" | "answered"
  suggestions: string[]
  submit: (question?: string) => void
  reset: () => void
}

/** The one place the demo simulates time. A knowledge answer that
 *  appears instantly reads as a lookup; the short pause is what makes
 *  it read as *work over a library*. Kept to one tick so it never
 *  becomes something a person waits on. */
const THINKING_MS = 620

export function useAsk(): AskController {
  const [question, setQuestion] = useState("")
  const [result, setResult] = useState<AskResult | null>(null)
  const [status, setStatus] = useState<AskController["status"]>("idle")

  const submit = useCallback(
    (override?: string) => {
      const q = (override ?? question).trim()
      if (!q) return
      setQuestion(q)
      setStatus("thinking")
      setResult(null)
      window.setTimeout(() => {
        setResult(askResultFor(q))
        setStatus("answered")
      }, THINKING_MS)
    },
    [question],
  )

  const reset = useCallback(() => {
    setQuestion("")
    setResult(null)
    setStatus("idle")
  }, [])

  return { question, setQuestion, result, status, suggestions: ASK_SUGGESTIONS, submit, reset }
}

/* ---- research ------------------------------------------------------- */

export interface ResearchController extends ResearchState {
  suggestions: string[]
  setObjective: (value: string) => void
  start: (objective?: string) => void
  reset: () => void
}

const STAGE_MS = 780

export function useResearch(): ResearchController {
  const [state, setState] = useState<ResearchState>({
    status: "idle",
    objective: "",
    stage: null,
    completed: [],
    finding: null,
    error: null,
  })

  const setObjective = useCallback((objective: string) => {
    setState((s) => ({ ...s, objective }))
  }, [])

  const start = useCallback(
    (override?: string) => {
      setState((s) => {
        const objective = (override ?? s.objective).trim()
        if (!objective) return s
        // Walk the real stage list rather than a hard-coded four, so the
        // visual state machine and the type stay the same thing.
        RESEARCH_STAGES.forEach((stage: ResearchStage, i) => {
          window.setTimeout(() => {
            setState((prev) => ({
              ...prev,
              stage,
              completed: RESEARCH_STAGES.slice(0, i) as ResearchStage[],
            }))
          }, i * STAGE_MS)
        })
        window.setTimeout(() => {
          setState((prev) => ({
            ...prev,
            status: "complete",
            stage: null,
            completed: [...RESEARCH_STAGES],
            finding: researchFindingFor(objective),
          }))
        }, RESEARCH_STAGES.length * STAGE_MS)

        return { status: "running", objective, stage: RESEARCH_STAGES[0], completed: [], finding: null, error: null }
      })
    },
    [],
  )

  const reset = useCallback(() => {
    setState({ status: "idle", objective: "", stage: null, completed: [], finding: null, error: null })
  }, [])

  return { ...state, suggestions: RESEARCH_SUGGESTIONS, setObjective, start, reset }
}

/* ---- voice ----------------------------------------------------------- */

export interface VoiceController extends VoiceState {
  /** Runs the visual state machine over a supplied transcript. The real
   *  capability (lib/knowledge/voice-search.ts) drives the same states
   *  from the Web Speech API; this surface only renders them. */
  simulate: (transcript: string) => void
  cancel: () => void
}

/** Routing is expressed ONLY in terms of capabilities Knowledge already
 *  has. There is deliberately no branch that voice alone can reach —
 *  that is what keeps voice an interface rather than a second product. */
export function classifyIntent(transcript: string): { intent: VoiceIntentKind; routedTo: string } {
  const t = transcript.toLowerCase()
  if (/^(save|keep|bookmark)\b/.test(t)) return { intent: "save", routedTo: "SAVE → LIBRARY" }
  if (/\b(research|look into|find out about)\b/.test(t)) return { intent: "research", routedTo: "RESEARCH → WEB" }
  if (/^(what|why|how|who|when|where|do i|did i)\b/.test(t)) return { intent: "ask", routedTo: "ASK → KNOWLEDGE" }
  if (/^(find|show|search)\b/.test(t)) return { intent: "search", routedTo: "SEARCH → LIBRARY" }
  return { intent: "unknown", routedTo: "NOT UNDERSTOOD" }
}

export function useVoice(): VoiceController {
  const [state, setState] = useState<VoiceState>({
    status: "idle",
    transcript: "",
    intent: null,
    routedTo: null,
    error: null,
  })

  const simulate = useCallback((transcript: string) => {
    setState({ status: "listening", transcript: "", intent: null, routedTo: null, error: null })

    // Reveal the transcript a few words at a time, which is what real
    // interim speech results look like — not a single atomic string.
    const words = transcript.split(" ")
    words.forEach((_, i) => {
      window.setTimeout(() => {
        setState((s) => (s.status === "idle" ? s : { ...s, transcript: words.slice(0, i + 1).join(" ") }))
      }, 90 * (i + 1))
    })

    const spoken = 90 * (words.length + 1)
    window.setTimeout(() => setState((s) => (s.status === "idle" ? s : { ...s, status: "processing" })), spoken)
    window.setTimeout(() => {
      setState((s) => {
        if (s.status === "idle") return s
        const { intent, routedTo } = classifyIntent(transcript)
        return { ...s, status: intent === "unknown" ? "error" : "understood", intent, routedTo, error: intent === "unknown" ? "Try asking a question about your library." : null }
      })
    }, spoken + 480)
    window.setTimeout(() => {
      setState((s) => (s.status === "understood" ? { ...s, status: "answering" } : s))
    }, spoken + 1100)
  }, [])

  const cancel = useCallback(() => {
    setState({ status: "idle", transcript: "", intent: null, routedTo: null, error: null })
  }, [])

  return { ...state, simulate, cancel }
}
