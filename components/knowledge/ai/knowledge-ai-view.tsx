"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Plus } from "lucide-react"
import { askKnowledge, KnowledgeAiUnavailableError, type KnowledgeAIResponse } from "@/lib/knowledge/ai"
import { fetchLibrary } from "@/lib/knowledge/client"
import { openSaveDialog } from "@/lib/knowledge/config"
import { AiComposer } from "./composer"
import { AiAnswer } from "./answer"
import { AiSources } from "./sources"
import { ResearchThread, ResearchStage } from "./research-thread"
import {
  AiEmptyLibrary,
  AiError,
  AiInsufficient,
  AiLoading,
  AiNoResults,
  AiSuggestions,
  AiUnavailable,
} from "./states"

type Status = "idle" | "loading" | "answer" | "no-results" | "insufficient" | "error" | "unavailable"
type LibraryState = "checking" | "empty" | "has-items"

const RECENT_KEY = "knowledge.ai.recent.v1"
const RECENT_MAX = 6

/** Static example prompts — populate the composer only, never executed. */
const EXAMPLES = [
  "What have I saved about AI agents?",
  "Which ideas appear repeatedly across my research?",
  "What are the most important trends in my library?",
  "Show me sources that disagree with each other.",
]

function loadRecent(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

export function KnowledgeAiView() {
  const [status, setStatus] = useState<Status>("idle")
  const [query, setQuery] = useState("")
  const [submitted, setSubmitted] = useState("")
  const [response, setResponse] = useState<KnowledgeAIResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
  const [activeCitation, setActiveCitation] = useState<string | null>(null)
  const [recent, setRecent] = useState<string[]>([])
  const [library, setLibrary] = useState<LibraryState>("checking")
  const [libraryTotal, setLibraryTotal] = useState<number | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => setRecent(loadRecent()), [])

  // Lightweight, honest empty-library check using the existing list API —
  // the real total, so we know whether the user has anything to ask about
  // and can scope the composer with a true count (never invented).
  useEffect(() => {
    const ac = new AbortController()
    fetchLibrary({ limit: 1 }, ac.signal)
      .then((r) => {
        setLibrary(r.total > 0 ? "has-items" : "empty")
        setLibraryTotal(r.total)
      })
      .catch(() => setLibrary("has-items")) // never block the composer on a check failure
    return () => ac.abort()
  }, [])

  const pushRecent = useCallback((q: string) => {
    setRecent((prev) => {
      const next = [q, ...prev.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX)
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {
        /* persistence is best-effort */
      }
      return next
    })
  }, [])

  const runQuery = useCallback(
    async (raw: string) => {
      const q = raw.trim()
      if (!q) return

      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac

      setSubmitted(q)
      setQuery("") // the composer clears, ready for the next question
      setResponse(null)
      setErrorMessage(undefined)
      setActiveCitation(null)
      setStatus("loading")
      pushRecent(q)

      try {
        const res = await askKnowledge(q, ac.signal)
        if (ac.signal.aborted) return
        setResponse(res)
        if (res.insufficientEvidence) {
          setStatus("insufficient")
        } else if (res.retrieval?.results === 0 || (!res.answer?.trim() && res.citations.length === 0)) {
          setStatus("no-results")
        } else {
          setStatus("answer")
        }
      } catch (err) {
        if (ac.signal.aborted) return
        if (err instanceof KnowledgeAiUnavailableError) {
          setStatus("unavailable")
        } else {
          setErrorMessage(err instanceof Error ? err.message : undefined)
          setStatus("error")
        }
      }
    },
    [pushRecent],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setStatus("idle")
    setQuery("")
    setSubmitted("")
    setResponse(null)
    setErrorMessage(undefined)
    setActiveCitation(null)
  }, [])

  const pickSuggestion = useCallback((q: string) => setQuery(q), [])

  const idle = status === "idle"

  // ── Empty idle + empty library → save-first onboarding ────────────
  if (idle && library === "empty") {
    return (
      <HeroShell>
        <Hero />
        <div className="mt-10">
          <AiEmptyLibrary onSave={openSaveDialog} />
        </div>
      </HeroShell>
    )
  }

  // ── Empty idle → the research desk hero ───────────────────────────
  if (idle) {
    return (
      <HeroShell>
        <Hero />
        <div className="mt-8">
          <AiComposer
            value={query}
            onChange={setQuery}
            onSubmit={() => runQuery(query)}
            autoFocus
            size="hero"
            scopeCount={libraryTotal}
          />
        </div>
        <AiSuggestions examples={EXAMPLES} recent={recent} onPick={pickSuggestion} />
      </HeroShell>
    )
  }

  // ── Active states: a connected research thread ────────────────────
  const showSources =
    (status === "answer" || status === "insufficient") && (response?.citations.length ?? 0) > 0

  return (
    <ResultShell>
      {/* Top bar — quiet app identity on the left, a way back to a fresh
          question on the right. Neither competes with the query below. */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
          Ask your knowledge
        </p>
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--kn-edge)] bg-card/50 px-2.5 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:border-[var(--kn-ai)]/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        >
          <Plus className="size-3.5" /> New question
        </button>
      </div>

      <AiComposer
        value={query}
        onChange={setQuery}
        onSubmit={() => runQuery(query)}
        loading={status === "loading"}
        size="compact"
        scopeCount={libraryTotal}
      />

      <div className="mt-8">
        <ResearchThread>
          <ResearchStage label="Question">
            <h1 className="text-balance font-serif text-2xl font-medium leading-tight tracking-tight text-foreground sm:text-[1.7rem]">
              {submitted}
            </h1>
          </ResearchStage>

          <ResearchStage label="Answer" emphasis last={!showSources}>
            {status === "loading" ? <AiLoading /> : null}
            {status === "answer" && response ? (
              <AiAnswer
                response={response}
                activeCitation={activeCitation}
                onCite={setActiveCitation}
                onFollowUp={(q) => {
                  setQuery(q)
                  runQuery(q)
                }}
              />
            ) : null}
            {status === "insufficient" ? <AiInsufficient /> : null}
            {status === "no-results" ? <AiNoResults /> : null}
            {status === "unavailable" ? <AiUnavailable message={errorMessage} /> : null}
            {status === "error" ? <AiError message={errorMessage} onRetry={() => runQuery(submitted)} /> : null}
          </ResearchStage>

          {showSources && response ? (
            <ResearchStage label="Sources" subtitle="Evidence from your knowledge" last>
              <AiSources
                citations={response.citations}
                activeCitation={activeCitation}
                confidence={response.confidence}
              />
            </ResearchStage>
          ) : null}
        </ResearchThread>
      </div>
    </ResultShell>
  )
}

/** Centered hero column — the idle research desk. */
function HeroShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">{children}</div>
}

/** A slightly wider column for results — a comfortable research reading
 *  measure with room for the thread's left spine. */
function ResultShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</div>
}

function Hero() {
  return (
    <header className="text-center">
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--kn-ai)]">Ask your knowledge</p>
      <h1 className="mt-4 text-balance font-serif text-[2rem] font-medium leading-[1.08] tracking-tight text-foreground sm:text-[2.6rem]">
        Understand what you’ve saved.
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base">
        Ask questions across your saved articles, notes and sources. Keeply finds the relevant evidence and connects
        the answer back to where it came from.
      </p>
    </header>
  )
}
