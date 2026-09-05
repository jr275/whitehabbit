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

import { AlertTriangle, ArrowUp, BookOpen, Clock, Info, Loader2, Search, ShieldAlert, Sparkles, WifiOff } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { PageContainer, PageHeader } from "../page-header"
import { openSaveDialog } from "@/lib/knowledge/config"
import { useKnowledgeAsk, type AskFailure } from "@/lib/knowledge/use-knowledge-ai"
import { isFullyGrounded, MAX_QUESTION_CHARS, MIN_QUESTION_CHARS, type KnowledgeAnswer } from "@/lib/knowledge/ai"
import { AnswerBody } from "./answer-body"
import { CitationList } from "./citation-list"

export function AskView({ libraryIsEmpty }: { libraryIsEmpty: boolean }) {
  const { state, ask } = useKnowledgeAsk()
  const [draft, setDraft] = useState("")
  const busy = state.phase === "loading"

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Ask"
        title="Ask your library."
        subtitle="Answers drawn only from what you've saved, with the passages they came from."
      />

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault()
          ask(draft)
        }}
      >
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] px-4 py-2 focus-within:border-[var(--kn-ai)]/50">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={libraryIsEmpty}
            placeholder="What did I save about…?"
            aria-label="Ask your library"
            maxLength={MAX_QUESTION_CHARS}
            className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={busy || draft.trim().length < MIN_QUESTION_CHARS}
            aria-label="Ask"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" strokeWidth={2.5} />}
          </button>
        </div>
      </form>

      <div className="mt-8">
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
    </PageContainer>
  )
}

/* ── States ─────────────────────────────────────────────────────── */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-[var(--kn-edge)] bg-[var(--kn-paper)] px-6 py-14 text-center">
      {children}
    </div>
  )
}

function PanelIcon({ children, tone = "ai" }: { children: React.ReactNode; tone?: "ai" | "warn" }) {
  return (
    <span
      className={`flex size-12 items-center justify-center rounded-2xl ${
        tone === "warn" ? "bg-secondary text-muted-foreground" : "bg-[var(--kn-ai)]/12 text-[var(--kn-ai)]"
      }`}
    >
      {children}
    </span>
  )
}

/** 1. Empty library — nothing has been saved, so there is nothing to
 *  ask. Shown instead of letting a question run and reporting a
 *  refusal that would read as a failure of the feature. */
function EmptyLibraryState() {
  return (
    <Panel>
      <PanelIcon>
        <BookOpen className="size-6" />
      </PanelIcon>
      <div className="max-w-sm space-y-2">
        <p className="text-[15px] font-medium text-foreground">Nothing to ask yet.</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Ask answers only from what you&apos;ve saved. Save a few pieces and this becomes useful.
        </p>
      </div>
      <button
        onClick={openSaveDialog}
        className="flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
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
      <PanelIcon>
        <Sparkles className="size-6" />
      </PanelIcon>
      <div className="max-w-sm space-y-2">
        <p className="text-[15px] font-medium text-foreground">Ask a question.</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Answers are built from the passages in your own saves, and every claim links to the piece it came from.
        </p>
      </div>
    </Panel>
  )
}

/** 3. Loading. */
function LoadingState({ question }: { question: string }) {
  return (
    <Panel>
      <Loader2 className="size-5 animate-spin text-[var(--kn-ai)]" />
      <p className="max-w-md text-sm text-muted-foreground">
        Searching your library for <span className="text-foreground">{question}</span>
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
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[var(--kn-edge)] bg-secondary/50 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            This answer refers to {answer.unresolvedCitationIds.length === 1 ? "a source" : "sources"} that
            {answer.unresolvedCitationIds.length === 1 ? " was" : " were"} not retrieved
            {" "}({answer.unresolvedCitationIds.map((id) => `[${id}]`).join(" ")}). Treat it as unverified — those
            references point to nothing in your library.
          </p>
        </div>
      ) : null}

      <AnswerBody text={answer.answer} citations={answer.citations} />
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
      <PanelIcon tone="warn">
        <ShieldAlert className="size-6" />
      </PanelIcon>
      <div className="max-w-md space-y-2">
        <p className="text-[15px] font-medium text-foreground">Not enough to answer this.</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your library has {answer.retrieval.chunksRetrieved === 1 ? "a passage" : "passages"} near this topic, but
          {answer.retrieval.chunksRetrieved === 1 ? " it isn't" : " none is"} close enough to answer from. Rather than
          guess, nothing was generated.
        </p>
      </div>
      <Link href="/knowledge/library" className="text-sm text-muted-foreground underline underline-offset-4">
        Browse your library instead
      </Link>
    </Panel>
  )
}

/** 8. No results — retrieval found nothing at all. */
function NoResultsState({ answer }: { answer: KnowledgeAnswer }) {
  return (
    <Panel>
      <PanelIcon tone="warn">
        <Search className="size-6" />
      </PanelIcon>
      <div className="max-w-md space-y-2">
        <p className="text-[15px] font-medium text-foreground">Nothing in your library covers this.</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{answer.answer}</p>
      </div>
      {/* Without meaning-based search, "nothing matched" means
          "no saved page used these exact words" — a much weaker
          claim, and the user deserves to know which one they got. */}
      <div className="max-w-md">
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
      <PanelIcon tone="warn">{copy.icon}</PanelIcon>
      <div className="max-w-md space-y-2">
        <p className="text-[15px] font-medium text-foreground">{copy.title}</p>
        {/* The server's own message, not a rewrite of it — it carries
            the specifics (which limit, which credential). */}
        <p className="text-sm leading-relaxed text-muted-foreground">{failure.message}</p>
      </div>
      {failure.retryable ? (
        <button
          onClick={onRetry}
          className="flex h-10 items-center rounded-full border border-border px-5 text-sm text-foreground hover:bg-secondary"
        >
          Try again
        </button>
      ) : failure.kind === "unauthorized" ? (
        <Link
          href="/login"
          className="flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
        >
          Sign in
        </Link>
      ) : null}
    </Panel>
  )
}

const FAILURE_COPY: Record<AskFailure["kind"], { title: string; icon: React.ReactNode }> = {
  unauthorized: { title: "Sign in to ask.", icon: <ShieldAlert className="size-6" /> },
  invalid_request: { title: "That question can't be asked.", icon: <AlertTriangle className="size-6" /> },
  rate_limited: { title: "Too many questions just now.", icon: <Clock className="size-6" /> },
  provider_unavailable: { title: "Ask isn't configured.", icon: <ShieldAlert className="size-6" /> },
  provider_error: { title: "Couldn't reach the model.", icon: <AlertTriangle className="size-6" /> },
  malformed_response: { title: "Unreadable response.", icon: <AlertTriangle className="size-6" /> },
  network: { title: "You appear to be offline.", icon: <WifiOff className="size-6" /> },
  unknown: { title: "Something went wrong.", icon: <AlertTriangle className="size-6" /> },
}

/** Retrieval provenance, stated plainly. Shown because a silently
 *  degraded answer — semantic retrieval unavailable, half the context
 *  dropped to a budget — looks identical to a healthy one otherwise. */
function RetrievalNote({ answer }: { answer: KnowledgeAnswer }) {
  const { retrieval } = answer
  const bits: string[] = [`${retrieval.chunksUsed} ${retrieval.chunksUsed === 1 ? "passage" : "passages"}`]
  if (retrieval.droppedChunks > 0) bits.push(`${retrieval.droppedChunks} left out for length`)

  return (
    <div className="mt-8 space-y-3 border-t border-[var(--kn-edge)] pt-4">
      <SemanticNotice status={retrieval.semanticSearch} />
      <p className="text-[12px] text-muted-foreground">{bits.join(" · ")}</p>
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
    <div className="flex items-start gap-2.5 rounded-xl bg-secondary/50 px-3 py-2.5">
      <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <p className="text-[12px] leading-relaxed text-muted-foreground">{copy}</p>
    </div>
  )
}
