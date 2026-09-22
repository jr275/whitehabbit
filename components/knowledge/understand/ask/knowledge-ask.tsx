"use client"

/* ================================================================== *
 * ASK — a knowledge query surface, explicitly not a chat.
 *
 * No bubbles, no avatars, no turn history. One question, one answer,
 * set as prose. The reason is not taste: a chat log implies the
 * assistant is the thing you are talking to, and here the thing you
 * are querying is YOUR LIBRARY. The answer is therefore typeset like
 * an editor's note about your own material.
 *
 * The three-part hierarchy the brief calls for is enforced visually:
 * ANSWER is large and serif, EVIDENCE is quoted and attributed, and
 * RELATED is a plain list. A reader must never have to work out which
 * of the three they are looking at.
 * ================================================================== */

import { useEffect, useRef } from "react"
import type { AskController } from "@/lib/knowledge/understand/hooks"
import type { KnowledgeConcept, KnowledgeObject } from "@/lib/knowledge/understand/types"
import { Label } from "../shell/section"

export function KnowledgeAsk({
  ask,
  objects,
  concepts,
  onOpenObject,
  onAsk,
}: {
  ask: AskController
  objects: KnowledgeObject[]
  concepts: KnowledgeConcept[]
  onOpenObject: (id: string) => void
  /** Supplied when the reader has a real library: the question goes to
   *  the real, grounded Ask instead of this section's simulation. The
   *  field and the suggestions stay exactly as they are — what changes
   *  is where pressing them leads. */
  onAsk?: (question: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const objectById = new Map(objects.map((o) => [o.id, o]))
  const conceptById = new Map(concepts.map((c) => [c.id, c]))

  // When a question arrives from elsewhere on the page (a theme, a
  // question card, the header), the field must show it — otherwise the
  // answer appears with no visible cause.
  useEffect(() => {
    if (ask.status === "thinking") inputRef.current?.blur()
  }, [ask.status])

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (onAsk) {
            const q = ask.question.trim()
            if (q) onAsk(q)
            return
          }
          ask.submit()
        }}
        className="border-y border-[var(--kp-rule-strong)] py-2"
      >
        <label htmlFor="kp-ask" className="sr-only">
          Ask your knowledge a question
        </label>
        <div className="flex items-center gap-4">
          <input
            id="kp-ask"
            ref={inputRef}
            value={ask.question}
            onChange={(e) => ask.setQuestion(e.target.value)}
            placeholder="What do I know about…?"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-3 font-[family-name:var(--font-fraunces)] text-[clamp(1.1rem,2.4vw,1.6rem)] leading-snug tracking-[-0.02em] placeholder:text-[var(--kp-ink-faint)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!ask.question.trim() || ask.status === "thinking"}
            className="shrink-0 rounded-full bg-[var(--kp-ink)] px-5 py-2.5 text-[13px] font-medium text-[var(--kp-paper)] transition-colors duration-[var(--kp-fast)] hover:bg-[var(--kp-accent)] disabled:opacity-30"
          >
            Ask
          </button>
        </div>
      </form>

      {ask.status === "idle" && (
        <div className="mt-6">
          <Label>Try</Label>
          <ul className="mt-3 flex flex-wrap gap-2">
            {ask.suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => (onAsk ? onAsk(s) : ask.submit(s))}
                  className="rounded-full border border-[var(--kp-rule)] px-3.5 py-1.5 text-[13px] text-[var(--kp-ink-soft)] transition-colors duration-[var(--kp-fast)] hover:border-[var(--kp-accent)] hover:text-[var(--kp-accent)]"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div aria-live="polite" aria-busy={ask.status === "thinking"}>
        {ask.status === "thinking" && (
          <p className="mt-10 text-[14px] text-[var(--kp-ink-faint)]">
            Reading across your library<span className="kp-ellipsis" aria-hidden />
          </p>
        )}

        {ask.status === "answered" && ask.result && (
          <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <Label>Answer</Label>
              <div className="mt-4 space-y-5">
                {ask.result.answer.map((paragraph, i) => (
                  <p
                    key={i}
                    className={
                      i === 0
                        ? "max-w-[var(--kp-measure)] font-[family-name:var(--font-fraunces)] text-[clamp(1.2rem,2.2vw,1.5rem)] leading-[1.45] tracking-[-0.01em]"
                        : "max-w-[var(--kp-measure)] text-[15.5px] leading-[1.65] text-[var(--kp-ink-soft)]"
                    }
                  >
                    {paragraph}
                  </p>
                ))}
              </div>

              <div className="mt-9">
                <Label>Ideas that recur</Label>
                <ol className="mt-3 space-y-1.5">
                  {ask.result.recurringIdeas.map((idea, i) => (
                    <li key={idea} className="flex items-baseline gap-3 text-[15px]">
                      <span className="kp-tnum text-[13px] text-[var(--kp-accent)]">{i + 1}</span>
                      {idea}
                    </li>
                  ))}
                </ol>
              </div>

              <button
                type="button"
                onClick={ask.reset}
                className="mt-9 text-[13px] text-[var(--kp-ink-faint)] underline-offset-4 hover:text-[var(--kp-ink)] hover:underline"
              >
                Ask something else
              </button>
            </div>

            <div>
              <Label>Evidence</Label>
              <ul className="mt-4 space-y-5">
                {ask.result.evidence.map((e) => (
                  <li key={e.objectId} className="border-l-2 border-[var(--kp-accent)] pl-4">
                    <blockquote className="text-[14.5px] leading-[1.6] text-[var(--kp-ink-soft)]">
                      “{e.excerpt}”
                    </blockquote>
                    <button
                      type="button"
                      onClick={() => onOpenObject(e.objectId)}
                      className="mt-2 block text-left text-[12.5px] font-medium transition-colors hover:text-[var(--kp-accent)]"
                    >
                      {e.title}
                      <span className="font-normal text-[var(--kp-ink-faint)]"> · {e.source}</span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-9">
                <Label>Related knowledge</Label>
                <ul className="mt-3 divide-y divide-[var(--kp-rule)] border-y border-[var(--kp-rule)]">
                  {ask.result.relatedObjectIds.map((id) => {
                    const object = objectById.get(id)
                    if (!object) return null
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => onOpenObject(id)}
                          className="group w-full py-2.5 text-left text-[13.5px] leading-snug transition-colors hover:text-[var(--kp-accent)]"
                        >
                          {object.title}
                          <span className="block text-[12px] text-[var(--kp-ink-faint)]">{object.source}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>

              <div className="mt-9">
                <Label>Connected concepts</Label>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {ask.result.connectedConceptIds.map((id) => (
                    <li
                      key={id}
                      className="rounded-full bg-[var(--kp-wash)] px-2.5 py-1 text-[12.5px] text-[var(--kp-ink-soft)]"
                    >
                      {conceptById.get(id)?.label ?? id}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
