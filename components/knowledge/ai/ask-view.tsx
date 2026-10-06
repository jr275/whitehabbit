"use client"

/* ================================================================== *
 * ASK — a research tool over your own library.
 *
 * Deliberately not a chat: no bubbles, no avatars, no transcript. The
 * mental model is a search box that answers, and the answer's value
 * comes from the sources under it, so those get the space a
 * conversation UI would spend on turn-taking.
 *
 * THE ONE RULE IN THIS FILE. Every string the user reads that makes a
 * claim about their library comes from the API. There is no fallback
 * copy that stands in for an answer, no cached result replayed as a
 * new one, and no state entered on a guess. The states below are
 * distinguishable because the backend reports them distinctly —
 * "nothing matched" and "matched but nothing supported a claim" are
 * different facts and are shown as different things.
 * ================================================================== */

import { AlertTriangle, ArrowUp, Info, Loader2, Search } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { openSaveDialog } from "@/lib/knowledge/config"
import { useKnowledgeAsk, type AskFailure } from "@/lib/knowledge/use-knowledge-ai"
import { isFullyGrounded, MAX_QUESTION_CHARS, MIN_QUESTION_CHARS, type KnowledgeAnswer } from "@/lib/knowledge/ai"
import { AnswerBody } from "./answer-body"
import { CitationList, EvidenceList } from "./citation-list"

/* ---- recent questions -------------------------------------------- *
 *
 * Carried over from the Ask surface this replaced. Per-browser only:
 * a question someone typed is theirs, and there is no reason for it to
 * reach the server, so it never does. Reads and writes are wrapped
 * because storage throws outright in some privacy modes — a blocked
 * convenience must not take the page down with it. */
const RECENT_KEY = "keeply.ask.recent"
const RECENT_MAX = 4

function loadRecent(): string[] {
  if (typeof window === "undefined") return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

function rememberQuestion(question: string): string[] {
  const next = [question, ...loadRecent().filter((q) => q !== question)].slice(0, RECENT_MAX)
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable — the feature degrades, nothing else does */
  }
  return next
}

export function AskView({ libraryIsEmpty, scopeCount = null }: { libraryIsEmpty: boolean; scopeCount?: number | null }) {
  const { state, ask } = useKnowledgeAsk()
  const [draft, setDraft] = useState("")
  const [recent, setRecent] = useState<string[]>([])
  const busy = state.phase === "loading"

  // Read after mount: localStorage is per-browser, so touching it during
  // render would disagree with the server-rendered markup.
  useEffect(() => {
    setRecent(loadRecent())
  }, [])

  const submit = useCallback(
    (question: string) => {
      const q = question.trim()
      if (q.length < MIN_QUESTION_CHARS) return
      setRecent(rememberQuestion(q))
      ask(q)
    },
    [ask],
  )

  return (
    <div className="pk-page pb-24">
      {/* ── Masthead ──────────────────────────────────────────────
          One question field, at the size of the thing it is for. No
          transcript above it and no history beside it: this is a
          research tool, and the previous answer is not context for the
          next one — it is a different piece of work. */}
      <header className="pt-14 sm:pt-20">
        <p className="pk-label">Ask</p>
        <h1 className="pk-display mt-4 max-w-[16ch] text-[var(--pk-ink)]">Ask your knowledge.</h1>
        <p className="mt-5 max-w-[52ch] text-[15px] leading-[1.65] text-[var(--pk-ink-3)]">
          Answers are built only from what you&rsquo;ve saved, and every claim carries the passage it came from.
        </p>
      </header>

      <form
        className="mt-9 max-w-[42rem]"
        onSubmit={(e) => {
          e.preventDefault()
          submit(draft)
        }}
      >
        <div className="pk-field">
          <Search className="size-[18px] shrink-0 text-[var(--pk-ink-4)]" strokeWidth={1.8} />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={libraryIsEmpty}
            placeholder="What do I know about…?"
            aria-label="Ask your knowledge"
            maxLength={MAX_QUESTION_CHARS}
            className="disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={busy || draft.trim().length < MIN_QUESTION_CHARS}
            aria-label="Ask"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--pk-accent)] text-[var(--pk-accent-ink)] transition-opacity disabled:opacity-25"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" strokeWidth={2.5} />}
          </button>
        </div>

        {!libraryIsEmpty && scopeCount !== null && (
          <p className="pk-meta mt-3">
            Answered from {scopeCount === 1 ? "the 1 item" : `all ${scopeCount.toLocaleString()} items`} you&rsquo;ve
            saved.
          </p>
        )}

        {!libraryIsEmpty && recent.length > 0 && state.phase === "idle" && (
          <div className="mt-6">
            <p className="pk-label mb-2.5">Recent</p>
            <ul className="flex flex-col">
              {recent.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(q)
                      submit(q)
                    }}
                    className="w-full truncate border-b border-[var(--pk-rule)] py-2.5 text-left text-[14px] text-[var(--pk-ink-2)] transition-colors hover:text-[var(--pk-ink)]"
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>

      <div>
        {libraryIsEmpty ? (
          <EmptyLibraryState />
        ) : state.phase === "idle" ? (
          <IdleState />
        ) : state.phase === "loading" ? (
          <LoadingState question={state.question} />
        ) : state.phase === "error" ? (
          <ErrorState failure={state.failure} onRetry={() => ask(state.question)} />
        ) : state.outcome.kind === "answered" ? (
          <AnswerState answer={state.outcome.answer} />
        ) : state.outcome.kind === "insufficient_evidence" ? (
          <InsufficientEvidenceState answer={state.outcome.answer} />
        ) : (
          <NoResultsState answer={state.outcome.answer} />
        )}
      </div>
    </div>
  )
}

/* ── States ─────────────────────────────────────────────────────── */

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[48ch] py-16">{children}</div>
}

/** 1. Empty library — nothing has been saved, so there is nothing to
 *  ask. Shown instead of letting a question run and reporting a
 *  refusal that would read as a failure of the feature. */
function EmptyLibraryState() {
  return (
    <Panel>
      <p className="text-[17px] font-medium tracking-[-0.011em] text-[var(--pk-ink)]">Nothing to ask yet.</p>
      <p className="mt-2 text-[14px] leading-[1.65] text-[var(--pk-ink-3)]">
        Ask answers only from what you&apos;ve saved. Save a few pieces and this becomes useful.
      </p>
      <button
        onClick={openSaveDialog}
        className="mt-4 text-[14px] text-[var(--pk-ink)] underline decoration-[var(--pk-rule-2)] underline-offset-4"
      >
        Save a link
      </button>
    </Panel>
  )
}

/** 2. Idle. No suggested questions: a canned prompt is a claim about
 *  what is in the library, and this component does not know. */
function IdleState() {
  return (
    <Panel>
      <p className="text-[14px] leading-[1.65] text-[var(--pk-ink-4)]">
        Your answer, the passages behind it and the pieces they came from will appear here.
      </p>
    </Panel>
  )
}

/** 3. Loading. */
function LoadingState({ question }: { question: string }) {
  return (
    <Panel>
      <p className="pk-label flex items-center gap-2 text-[var(--pk-signal)]">
        <Loader2 className="size-3.5 animate-spin" />
        Retrieving
      </p>
      <p className="mt-3 text-[15px] leading-[1.6] text-[var(--pk-ink-3)]">
        Searching your library for <span className="text-[var(--pk-ink)]">{question}</span>
      </p>
    </Panel>
  )
}

/** 4/5/6. The answer, its citations and its source cards. */
function AnswerState({ answer }: { answer: KnowledgeAnswer }) {
  const grounded = isFullyGrounded(answer)
  return (
    <article>
      {!grounded ? (
        <div className="mt-8 flex max-w-[60ch] items-start gap-2.5 border-l-2 border-[var(--pk-danger)] pl-3.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--pk-danger)]" />
          <p className="text-[13px] leading-[1.6] text-[var(--pk-ink-2)]">
            This answer refers to {answer.unresolvedCitationIds.length === 1 ? "a source" : "sources"} that
            {answer.unresolvedCitationIds.length === 1 ? " was" : " were"} not retrieved
            {" "}({answer.unresolvedCitationIds.map((id) => `[${id}]`).join(" ")}). Treat it as unverified — those
            references point to nothing in your library.
          </p>
        </div>
      ) : null}

      {/* ANSWER → EVIDENCE → SOURCES. The order is the argument: the
          claim, the text that backs it, then where that text lives. */}
      <section className="pk-section">
        <h2 className="pk-label mb-5">Answer</h2>
        <AnswerBody text={answer.answer} citations={answer.citations} />
      </section>
      <EvidenceList citations={answer.citations} />
      <CitationList citations={answer.citations} />
      <RetrievalNote answer={answer} />
    </article>
  )
}

/** 7. Insufficient evidence — passages WERE retrieved and every one
 *  was rejected as evidence. Distinct from "nothing matched", and the
 *  difference is actionable: the topic is nearby in the library but
 *  nothing in it supports a claim. */
function InsufficientEvidenceState({ answer }: { answer: KnowledgeAnswer }) {
  return (
    <Panel>
      <div className="max-w-[52ch]">
        <p className="text-[17px] font-medium tracking-[-0.011em] text-[var(--pk-ink)]">Not enough to answer this.</p>
        <p className="mt-2 text-[14px] leading-[1.65] text-[var(--pk-ink-3)]">
          Your library has {answer.retrieval.chunksRetrieved === 1 ? "a passage" : "passages"} near this topic, but
          {answer.retrieval.chunksRetrieved === 1 ? " it isn't" : " none is"} close enough to answer from. Rather than
          guess, nothing was generated.
        </p>
      </div>
      <Link
        href="/knowledge/library"
        className="mt-4 inline-block text-[14px] text-[var(--pk-ink)] underline decoration-[var(--pk-rule-2)] underline-offset-4"
      >
        Browse your library instead
      </Link>
    </Panel>
  )
}

/** 8. No results — retrieval found nothing at all. */
function NoResultsState({ answer }: { answer: KnowledgeAnswer }) {
  return (
    <Panel>
      <div className="max-w-[52ch]">
        <p className="text-[17px] font-medium tracking-[-0.011em] text-[var(--pk-ink)]">
          Nothing in your library covers this.
        </p>
        <p className="mt-2 text-[14px] leading-[1.65] text-[var(--pk-ink-3)]">{answer.answer}</p>
      </div>
      {/* Without meaning-based search, "nothing matched" means
          "no saved page used these exact words" — a much weaker
          claim, and the user deserves to know which one they got. */}
      <div className="mt-5 max-w-[52ch]">
        <SemanticNotice status={answer.retrieval.semanticSearch} />
      </div>
    </Panel>
  )
}

/** 9/10/11. Every failure, named. */
function ErrorState({ failure, onRetry }: { failure: AskFailure; onRetry: () => void }) {
  const copy = FAILURE_COPY[failure.kind]
  return (
    <Panel>
      <div className="max-w-[52ch]">
        <p className="text-[17px] font-medium tracking-[-0.011em] text-[var(--pk-ink)]">{copy.title}</p>
        {/* The server's own message, not a rewrite of it — it carries
            the specifics (which limit, which credential). */}
        <p className="mt-2 text-[14px] leading-[1.65] text-[var(--pk-ink-3)]">{failure.message}</p>
      </div>
      {failure.retryable ? (
        <button
          onClick={onRetry}
          className="mt-4 text-[14px] text-[var(--pk-ink)] underline decoration-[var(--pk-rule-2)] underline-offset-4"
        >
          Try again
        </button>
      ) : failure.kind === "unauthorized" ? (
        <Link
          href="/login?callbackUrl=/knowledge/home"
          className="mt-4 inline-block text-[14px] text-[var(--pk-ink)] underline decoration-[var(--pk-rule-2)] underline-offset-4"
        >
          Sign in
        </Link>
      ) : null}
    </Panel>
  )
}

/* Titles only. The icons these used to carry (a shield, a clock, a
 * broken-wifi glyph) were decoration for text that already says exactly
 * what happened, and each one arrived inside a rounded square — the
 * shape that makes an error state look like a dashboard widget. */
const FAILURE_COPY: Record<AskFailure["kind"], { title: string }> = {
  unauthorized: { title: "Sign in to ask." },
  invalid_request: { title: "That question can't be asked." },
  rate_limited: { title: "Too many questions just now." },
  provider_unavailable: { title: "Ask isn't configured." },
  provider_error: { title: "Couldn't reach the model." },
  malformed_response: { title: "Unreadable response." },
  network: { title: "You appear to be offline." },
  unknown: { title: "Something went wrong." },
}

/** Retrieval provenance, stated plainly. Shown because a silently
 *  degraded answer — semantic retrieval unavailable, half the context
 *  dropped to a budget — looks identical to a healthy one otherwise. */
function RetrievalNote({ answer }: { answer: KnowledgeAnswer }) {
  const { retrieval } = answer
  const bits: string[] = [`${retrieval.chunksUsed} ${retrieval.chunksUsed === 1 ? "passage" : "passages"}`]
  if (retrieval.droppedChunks > 0) bits.push(`${retrieval.droppedChunks} left out for length`)

  return (
    <div className="mt-2 space-y-3 border-t border-[var(--pk-rule)] pt-5">
      <SemanticNotice status={retrieval.semanticSearch} />
      <p className="pk-meta">Retrieved {bits.join(" · ")}</p>
    </div>
  )
}

/** Semantic search failing open to lexical is correct and dangerous:
 *  the answer still arrives, so nothing looks wrong. Saying which
 *  half of retrieval ran — and why the other did not — is what stops
 *  a partial search from being read as a complete one. The two
 *  disabled reasons are shown differently because the actions differ:
 *  one is a deployment task, the other is an outage to wait out. */
function SemanticNotice({ status }: { status: KnowledgeAnswer["retrieval"]["semanticSearch"] }) {
  if (status.enabled || status.reason === "not_requested") return null

  const copy =
    status.reason === "provider_not_configured"
      ? "Meaning-based search is not configured on this deployment, so this searched exact words only. Questions phrased differently from your saved text may find nothing."
      : "Meaning-based search is temporarily unavailable, so this searched exact words only. Try again later for a fuller answer."

  return (
    <div className="flex max-w-[60ch] items-start gap-2.5 border-l-2 border-[var(--pk-signal)] pl-3.5">
      <Info className="mt-0.5 size-3.5 shrink-0 text-[var(--pk-signal)]" />
      <p className="text-[12.5px] leading-[1.6] text-[var(--pk-ink-3)]">{copy}</p>
    </div>
  )
}
