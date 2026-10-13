"use client"

/* ================================================================== *
 * ASK — a research tool over your own library.
 *
 * NOT A CHAT, AND THAT IS STILL THE DESIGN. There are no bubbles, no
 * avatars and no scrollback, because the runtime holds exactly ONE
 * exchange at a time: useKnowledgeAskStream keeps one question and one
 * run, and the previous answer is never context for the next. A
 * transcript would be a drawing of state that does not exist.
 *
 * WHAT DID CHANGE. The page used to be a masthead, a field and then
 * whatever happened, all at the same altitude — the pitch kept its
 * display type above every answer, and the question the answer was
 * for was visible only inside the loading timeline, so it vanished
 * the moment the answer arrived. It now reads in three parts:
 *
 *   HEADER     — identifies the surface. Collapses to its label once a
 *                question has been asked; the h1 stays in the
 *                accessibility tree rather than being deleted.
 *   COMPOSER   — a multiline field, because the cap is 1,000
 *                characters and a question that uses them has to be
 *                readable while it is typed. Enter sends,
 *                Shift+Enter breaks the line, Escape stops a run.
 *   EXCHANGE   — the question as asked, then the assistant's turn
 *                under it: the run while it happens, or the answer,
 *                its evidence and its sources.
 *
 * THE ONE RULE IN THIS FILE IS UNCHANGED. Every string the user reads
 * that makes a claim about their library comes from the API. There is
 * no fallback copy that stands in for an answer, no cached result
 * replayed as a new one, and no state entered on a guess. In
 * particular there is no typing animation: callLlm has no streaming
 * path (lib/ai/llm), the provider returns one complete string, and
 * lib/knowledge/answer.ts emits it as ONE delta on purpose. Revealing
 * it token by token would be inventing progress the provider never
 * reported — the exact failure the rest of this surface exists to
 * prevent. What IS streamed, and shown, is the run: four real steps
 * with the pipeline's own counts.
 * ================================================================== */

import { AlertTriangle, ArrowUp, ChevronRight, Info, Loader2, Square } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { openSaveDialog } from "@/lib/knowledge/config"
import { useKnowledgeAskStream, type AskFailure } from "@/lib/knowledge/use-knowledge-ask-stream"
import type { AskRunState } from "@/lib/knowledge/ask-run"
import {
  classifyAnswer,
  isFullyGrounded,
  MAX_QUESTION_CHARS,
  MIN_QUESTION_CHARS,
  type KnowledgeAnswer,
} from "@/lib/knowledge/ai"
import { AnswerBody } from "./answer-body"
import { AskRunTimeline } from "./ask-run-timeline"
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

/** The counter appears only once the cap is in sight. A permanent
 *  "0 / 1000" is noise on a field nobody will fill. */
const COUNTER_VISIBLE_FROM = MAX_QUESTION_CHARS - 120

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
  /* Streams the run's real stages instead of showing one spinner for
   * all of them. The outcome states below are unchanged: the stream
   * still delivers the whole KnowledgeAnswer as the record, and it is
   * classified by the same classifyAnswer the non-streaming path uses. */
  const { question, run, failure, streaming, ask, cancel } = useKnowledgeAskStream()
  const [draft, setDraft] = useState("")
  const [recent, setRecent] = useState<string[]>([])
  const field = useRef<HTMLTextAreaElement>(null)
  const busy = streaming
  const asked = question !== null

  // Read after mount: localStorage is per-browser, so touching it during
  // render would disagree with the server-rendered markup.
  useEffect(() => {
    setRecent(loadRecent())
  }, [])

  /* Grows the field to its content, up to the max-height the stylesheet
   * sets (.pk-composer textarea), after which it scrolls inside itself.
   * Resetting to "auto" first is what lets it shrink again on delete. */
  useEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  const submit = useCallback(
    (question: string) => {
      const q = question.trim()
      if (q.length < MIN_QUESTION_CHARS) return
      setRecent(rememberQuestion(q))
      // Cleared, because the question it held is now shown as the turn
      // it became. Leaving it would put the same sentence on screen
      // twice and make "ask again" look like "edit the last one".
      setDraft("")
      ask(q)
    },
    [ask],
  )

  return (
    <div className="pk-page pb-28">
      {/* ── 1. HEADER ─────────────────────────────────────────────
          Steps back once there is an exchange to read. The h1 stays
          for assistive tech — a page with no h1 is a worse outcome
          than a quiet one. */}
      <header className={asked ? "pt-10 sm:pt-12" : "pt-14 sm:pt-20"}>
        <p className="pk-label">Ask</p>
        <h1
          className={
            asked ? "sr-only" : "pk-display mt-4 max-w-[16ch] text-[var(--pk-ink)]"
          }
        >
          Ask your knowledge.
        </h1>
        {!asked && (
          <p className="mt-5 max-w-[52ch] text-[15px] leading-[1.65] text-[var(--pk-ink-3)]">
            Answers are built only from what you&rsquo;ve saved, and every claim carries the passage it came from.
          </p>
        )}
      </header>

      {/* ── 2. COMPOSER ───────────────────────────────────────────── */}
      <form
        className={asked ? "mt-6 max-w-[46rem]" : "mt-9 max-w-[46rem]"}
        onSubmit={(e) => {
          e.preventDefault()
          submit(draft)
        }}
      >
        <div className="pk-composer">
          <textarea
            ref={field}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              /* Enter sends, Shift+Enter breaks the line. isComposing
               * is checked because in a CJK or accent IME the first
               * Enter commits the candidate — sending there would cut
               * the question mid-word. */
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                if (!busy) submit(draft)
                return
              }
              // Escape stops a run from the keyboard, where the hand
              // already is.
              if (e.key === "Escape" && busy) {
                e.preventDefault()
                cancel()
              }
            }}
            disabled={libraryIsEmpty}
            placeholder="What do I know about…?"
            aria-label="Ask your knowledge"
            aria-describedby="ask-composer-hint"
            maxLength={MAX_QUESTION_CHARS}
            className="disabled:cursor-not-allowed"
          />
          {/* One control, two jobs — because there is one action
              available at a time. While a run is live the only useful
              thing this button can do is stop it, and cancel() really
              does abort the request (it does not claim to cancel the
              model call, which lib/ai/llm cannot). */}
          {busy ? (
            <button
              type="button"
              onClick={cancel}
              aria-label="Stop"
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--pk-rule-2)] text-[var(--pk-ink-2)] transition-colors hover:border-[var(--pk-ink-4)] hover:text-[var(--pk-ink)]"
            >
              <Square className="size-3 fill-current" strokeWidth={0} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={draft.trim().length < MIN_QUESTION_CHARS}
              aria-label="Ask"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--pk-accent)] text-[var(--pk-accent-ink)] transition-opacity disabled:opacity-25"
            >
              <ArrowUp className="size-4" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* The composer's footer: what an answer is drawn from on the
            left, how to drive the field on the right. Wraps rather
            than overflowing on a narrow screen. */}
        <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1.5">
          <p className="pk-meta">
            {libraryIsEmpty
              ? "Nothing saved yet."
              : scopeCount !== null
                ? `Answered from ${scopeCount === 1 ? "the 1 item" : `all ${scopeCount.toLocaleString()} items`} you’ve saved.`
                : /* The library count has not been read yet. Saying a
                     number here would be a guess about their data. */
                  ""}
          </p>
          <p id="ask-composer-hint" className="pk-meta">
            {busy ? (
              "Esc to stop"
            ) : draft.length >= COUNTER_VISIBLE_FROM ? (
              <span className={draft.length >= MAX_QUESTION_CHARS ? "text-[var(--pk-danger)]" : undefined}>
                {draft.length.toLocaleString()} / {MAX_QUESTION_CHARS.toLocaleString()}
              </span>
            ) : (
              "Enter to send · Shift+Enter for a new line"
            )}
          </p>
        </div>

        {!libraryIsEmpty && recent.length > 0 && !asked && (
          <div className="mt-6">
            <p className="pk-label mb-2.5">Recent</p>
            <ul className="flex flex-col">
              {recent.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => submit(q)}
                    className="group flex w-full items-center gap-2 border-b border-[var(--pk-rule)] py-2.5 text-left text-[14px] text-[var(--pk-ink-2)] transition-colors hover:text-[var(--pk-ink)]"
                  >
                    <ChevronRight
                      aria-hidden
                      className="size-3.5 shrink-0 text-[var(--pk-ink-4)] transition-transform group-hover:translate-x-0.5"
                    />
                    <span className="min-w-0 truncate">{q}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>

      {/* ── 3. EXCHANGE ───────────────────────────────────────────── */}
      {libraryIsEmpty ? (
        <EmptyLibraryState />
      ) : !asked ? (
        <IdleState />
      ) : (
        <section className="mt-10" aria-label="Your question and its answer">
          <AskedTurn question={question} />

          <div className="mt-7">
            {failure ? (
              /* Refused before the stream began — a real HTTP status. */
              <ErrorState failure={failure} onRetry={() => question && ask(question)} />
            ) : run.answer ? (
              /* The record arrived. Same three outcomes as before. */
              (() => {
                const outcome = classifyAnswer(run.answer)
                if (outcome.kind === "answered") return <AnswerState answer={outcome.answer} run={run} />
                if (outcome.kind === "insufficient_evidence") return <InsufficientEvidenceState answer={outcome.answer} />
                return <NoResultsState answer={outcome.answer} />
              })()
            ) : (
              /* Still running, cut off, or failed mid-stream — the
                 timeline reports whichever it is, from the events.
                 Stopping is the composer's button now, so no second
                 Stop is rendered here. */
              <AskRunTimeline run={run} streaming={streaming} />
            )}
          </div>
        </section>
      )}
    </div>
  )
}

/* ── The turns ──────────────────────────────────────────────────── */

/** The question, as asked. The accent rule and the step down in size
 *  are the whole distinction between this turn and the answer — which
 *  is as much chrome as one exchange needs. */
function AskedTurn({ question }: { question: string }) {
  return (
    <div className="pk-turn-asked max-w-[var(--pk-measure)]">
      <p className="pk-label mb-2 text-[var(--pk-accent)]">You asked</p>
      {/* whitespace-pre-line: a question typed over several lines is
          read back the way it was written. */}
      <p className="whitespace-pre-line text-[15.5px] leading-[1.6] text-[var(--pk-ink-2)]">{question}</p>
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

/* 3. Loading was a single "Retrieving" spinner for all four stages,
 * which made a refusal look like a slow answer until the text
 * appeared. ./ask-run-timeline.tsx reports the stages the run really
 * went through instead. */

/** 4/5/6. The answer, its citations and its source cards. */
function AnswerState({ answer, run }: { answer: KnowledgeAnswer; run: AskRunState }) {
  const grounded = isFullyGrounded(answer)
  return (
    <article>
      {!grounded ? (
        <div className="flex max-w-[60ch] items-start gap-2.5 border-l-2 border-[var(--pk-danger)] pl-3.5">
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
      <RetrievalNote answer={answer} run={run} />
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
    <div className="max-w-[48ch]">
      <div className="max-w-[52ch] border-l-2 border-[var(--pk-danger)] pl-3.5">
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
    </div>
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
 *  dropped to a budget — looks identical to a healthy one otherwise.
 *
 *  The run itself is folded in here, collapsed. Those four steps and
 *  their counts are the record of how the answer was produced, and
 *  they used to be destroyed the instant it arrived: the timeline
 *  unmounted and nobody could check afterwards what search ran or how
 *  many passages were rejected. It is closed by default because it is
 *  provenance, not the answer. */
function RetrievalNote({ answer, run }: { answer: KnowledgeAnswer; run: AskRunState }) {
  const { retrieval } = answer
  const bits: string[] = [`${retrieval.chunksUsed} ${retrieval.chunksUsed === 1 ? "passage" : "passages"}`]
  if (retrieval.droppedChunks > 0) bits.push(`${retrieval.droppedChunks} left out for length`)

  return (
    <div className="mt-2 space-y-4 border-t border-[var(--pk-rule)] pt-5">
      <SemanticNotice status={retrieval.semanticSearch} />
      <p className="pk-meta">Retrieved {bits.join(" · ")}</p>

      <details className="group">
        <summary className="pk-label inline-flex cursor-pointer list-none items-center gap-1.5 transition-colors hover:text-[var(--pk-ink-2)] [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden className="size-3 transition-transform group-open:rotate-90" />
          How this answer was produced
        </summary>
        <div className="mt-4">
          <AskRunTimeline run={run} streaming={false} />
        </div>
      </details>
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
