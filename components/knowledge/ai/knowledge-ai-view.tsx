"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { askKnowledge, KnowledgeAiUnavailableError, type KnowledgeAIResponse } from "@/lib/knowledge/ai"
import { fetchLibrary } from "@/lib/knowledge/client"
import { openSaveDialog } from "@/lib/knowledge/config"
import { AiComposer } from "./composer"
import { AiAnswer } from "./answer"
import { AiSources } from "./sources"
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
  "What are the main ideas across my research on RAG?",
  "Which sources disagree about this?",
  "What should I revisit?",
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

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => setRecent(loadRecent()), [])

  // Lightweight, honest empty-library check using the existing list API —
  // just the count, so we know whether the user has anything to ask about.
  useEffect(() => {
    const ac = new AbortController()
    fetchLibrary({ limit: 1 }, ac.signal)
      .then((r) => setLibrary(r.total > 0 ? "has-items" : "empty"))
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

  const pickSuggestion = useCallback((q: string) => setQuery(q), [])

  const idle = status === "idle"

  // ── Empty idle + empty library → save-first state ─────────────────
  if (idle && library === "empty") {
    return (
      <Shell>
        <Hero />
        <div className="mt-8">
          <AiEmptyLibrary onSave={openSaveDialog} />
        </div>
      </Shell>
    )
  }

  // ── Empty idle → centered research hero ───────────────────────────
  if (idle) {
    return (
      <Shell>
        <Hero />
        <div className="mt-8">
          <AiComposer value={query} onChange={setQuery} onSubmit={() => runQuery(query)} autoFocus size="hero" />
        </div>
        <AiSuggestions examples={EXAMPLES} recent={recent} onPick={pickSuggestion} />
      </Shell>
    )
  }

  // ── Active states: compact composer on top, result below ──────────
  const showSources =
    (status === "answer" || status === "insufficient") && (response?.citations.length ?? 0) > 0

  return (
    <Shell>
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-primary">Ask your knowledge</p>
      </header>

      <div className="mt-4">
        <AiComposer
          value={query}
          onChange={setQuery}
          onSubmit={() => runQuery(query)}
          loading={status === "loading"}
          size="compact"
        />
      </div>

      {submitted ? (
        <h1 className="mt-8 text-balance font-serif text-2xl font-medium leading-tight tracking-tight text-foreground sm:text-[1.75rem]">
          {submitted}
        </h1>
      ) : null}

      <div className="mt-6">
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

        {showSources && response ? (
          <AiSources
            citations={response.citations}
            activeCitation={activeCitation}
            title={status === "insufficient" ? "Related sources" : "Sources"}
          />
        ) : null}
      </div>
    </Shell>
  )
}

/** A comfortable, centered reading column — answers stay easy to read
 *  and sources sit as secondary content below. */
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14 lg:py-16">{children}</div>
}

function Hero() {
  return (
    <header className="text-center">
      <p className="text-sm font-medium text-primary">Ask your knowledge</p>
      <h1 className="mt-3 text-balance font-serif text-3xl font-medium leading-[1.1] tracking-tight text-foreground sm:text-4xl">
        What do you want to understand?
      </h1>
      <p className="mx-auto mt-3 max-w-md text-pretty text-[15px] leading-relaxed text-muted-foreground">
        Search across everything you’ve saved and get answers grounded in your own knowledge.
      </p>
    </header>
  )
}
