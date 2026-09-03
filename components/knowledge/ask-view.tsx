"use client"

/* ================================================================== *
 * ASK — one question, one grounded answer, with the pieces it drew on.
 *
 * Deliberately not a chat surface. There is no thread, no history and
 * no follow-up box, because the thing being asked is a library, not an
 * assistant: the answer is only as good as what you saved, and the
 * citations are the point. A transcript would invite the general-
 * purpose questions this cannot honestly answer.
 * ================================================================== */

import { AlertCircle, ArrowUp, Loader2, LogIn, Sparkles } from "lucide-react"
import Link from "next/link"
import { useRef, useState } from "react"
import { AuthRequiredError } from "@/lib/knowledge/auth-state"
import { askLibrary, KnowledgeApiError, type AskResponse } from "@/lib/knowledge/client"
import { cn } from "@/lib/utils"
import { useKnowledgeAuth } from "./knowledge-auth"

/** Real questions, not feature copy — they show the shape of what this
 *  answers well (things you saved), which is the fastest way to convey
 *  that it is not a general chatbot. */
const EXAMPLES = [
  "What have I saved about AI agents?",
  "Summarize what I've saved on SEO.",
  "What are the main ideas across my saves?",
  "Which pieces mention Claude?",
]

type Phase =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "answered"; result: AskResponse; question: string }
  | { kind: "error"; message: string; needsAuth: boolean }

export function AskView() {
  const auth = useKnowledgeAuth()
  const [question, setQuestion] = useState("")
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const signedOut = auth.state !== "authenticated"

  async function ask(q: string) {
    const trimmed = q.trim()
    if (!trimmed || phase.kind === "asking") return
    setPhase({ kind: "asking" })
    try {
      const result = await askLibrary(trimmed)
      setPhase({ kind: "answered", result, question: trimmed })
    } catch (err) {
      // A lapsed session is not a failure of the feature, and must not
      // be reported as one — auth-state.ts turns the 401 into this.
      if (err instanceof AuthRequiredError) {
        setPhase({ kind: "error", message: err.message, needsAuth: true })
        return
      }
      if (err instanceof KnowledgeApiError && err.status === 401) {
        setPhase({ kind: "error", message: "Sign in to ask your library.", needsAuth: true })
        return
      }
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Couldn't answer that right now. Try again.",
        needsAuth: false,
      })
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Sparkles className="size-4" />
          Intelligence
        </div>
        <h1 className="text-balance font-serif text-4xl font-medium leading-[1.05] tracking-tight text-foreground sm:text-[2.75rem]">
          Ask your library.
        </h1>
        <p className="text-pretty text-[15px] leading-relaxed text-muted-foreground">
          Answers come only from the pieces you&apos;ve saved, and cite them.
        </p>
      </header>

      {signedOut ? (
        <SignedOutState state={auth.state} onSignIn={auth.promptSignIn} />
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void ask(question)
            }}
            className="mt-8"
          >
            <div className="relative rounded-2xl border border-[var(--kn-edge)] bg-card shadow-sm transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
              <textarea
                ref={inputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  // Enter asks; Shift+Enter is a newline. A question is
                  // one line far more often than not.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    void ask(question)
                  }
                }}
                rows={3}
                maxLength={500}
                placeholder="What have I saved about…?"
                aria-label="Ask a question about your library"
                className="w-full resize-none bg-transparent px-4 py-3.5 pr-14 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={!question.trim() || phase.kind === "asking"}
                aria-label="Ask"
                className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {phase.kind === "asking" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" strokeWidth={2.5} />
                )}
              </button>
            </div>
          </form>

          {phase.kind === "idle" && (
            <div className="mt-5 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  onClick={() => {
                    setQuestion(example)
                    void ask(example)
                  }}
                  className="rounded-full border border-[var(--kn-edge)] bg-card px-3.5 py-1.5 text-[13px] text-muted-foreground shadow-sm transition-colors hover:border-foreground/25 hover:text-foreground"
                >
                  {example}
                </button>
              ))}
            </div>
          )}

          {phase.kind === "asking" && <Thinking />}
          {phase.kind === "error" && (
            <ErrorPanel message={phase.message} needsAuth={phase.needsAuth} onSignIn={auth.promptSignIn} />
          )}
          {phase.kind === "answered" && <Answer result={phase.result} />}
        </>
      )}
    </div>
  )
}

function Thinking() {
  return (
    <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin text-primary" />
      Reading through what you&apos;ve saved…
    </div>
  )
}

function Answer({ result }: { result: AskResponse }) {
  // Split on the citation markers so each becomes a real link into the
  // Reader. The marker stays visible — it is what ties the sentence to
  // the source, and hiding it would make the claim look unsourced.
  const byMarker = new Map(result.citations.map((c) => [c.marker, c]))

  return (
    <div className="mt-8">
      <div className="rounded-2xl border border-[var(--kn-edge)] bg-card p-6 shadow-sm">
        <div className="space-y-4 text-[16px] leading-[1.7] text-foreground/90">
          {result.answer.split(/\n{2,}/).map((paragraph, i) => (
            <p key={i} className="text-pretty">
              {paragraph.split(/(\[\d{1,2}\])/g).map((chunk, j) => {
                const match = chunk.match(/^\[(\d{1,2})\]$/)
                const citation = match ? byMarker.get(Number(match[1])) : undefined
                if (!citation) return <span key={j}>{chunk}</span>
                return (
                  <Link
                    key={j}
                    href={`/knowledge/read/${citation.itemId}`}
                    title={citation.title}
                    className="mx-0.5 inline-flex items-baseline rounded bg-primary/12 px-1 align-baseline font-mono text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    {citation.marker}
                  </Link>
                )
              })}
            </p>
          ))}
        </div>
      </div>

      {result.citations.length > 0 && (
        <section className="mt-6">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            From your library
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {result.citations.map((citation) => (
              <li key={citation.itemId}>
                <Link
                  href={`/knowledge/read/${citation.itemId}`}
                  className="flex items-start gap-3 rounded-xl border border-[var(--kn-edge)] bg-card px-4 py-3 shadow-sm transition-colors hover:border-foreground/25"
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-primary/12 font-mono text-[11px] font-medium text-primary">
                    {citation.marker}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{citation.title}</span>
                    {citation.domain && (
                      <span className="block truncate text-[12px] text-muted-foreground">{citation.domain}</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Said plainly rather than hidden: an answer with no citations
          drew on nothing, and the reader deserves to know that before
          they trust it. */}
      {result.citations.length === 0 && result.retrieval !== "none" && (
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          No piece in your library was cited for this — treat the answer as a
          statement about what you haven&apos;t saved, not about the subject.
        </p>
      )}

      {result.retrieval === "recent" && result.citations.length > 0 && (
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          Nothing matched those words directly, so this read your most recent
          saves instead.
        </p>
      )}
    </div>
  )
}

function ErrorPanel({
  message,
  needsAuth,
  onSignIn,
}: {
  message: string
  needsAuth: boolean
  onSignIn: () => void
}) {
  return (
    <div className="mt-8 flex flex-col items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-5">
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        <AlertCircle className="size-4 text-destructive" />
        {message}
      </span>
      {needsAuth && (
        <button
          onClick={onSignIn}
          className="flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <LogIn className="size-4" />
          Sign in
        </button>
      )}
    </div>
  )
}

function SignedOutState({ state, onSignIn }: { state: string; onSignIn: () => void }) {
  const expired = state === "auth_required"
  return (
    <div className={cn("mt-8 rounded-2xl border border-dashed border-[var(--kn-edge)] bg-card px-6 py-14 text-center shadow-sm")}>
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="size-6" />
      </span>
      <p className="mt-4 font-serif text-xl font-medium text-foreground">
        {expired ? "Your session ended." : "Ask needs an account."}
      </p>
      {/* The honest reason, not a growth prompt: a guest library lives
          in this browser, and answering from it would mean uploading
          those saved pages to a model. */}
      <p className="mx-auto mt-2 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
        {expired
          ? "Sign in again to ask about the library on your account."
          : "Guest libraries stay on this device and are never sent anywhere. Sign in to keep your library on the server, where Ask can read it."}
      </p>
      <button
        onClick={onSignIn}
        className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        <LogIn className="size-4" />
        {expired ? "Sign in again" : "Sign in"}
      </button>
    </div>
  )
}
