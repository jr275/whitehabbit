"use client"

/* ================================================================== *
 * WHAT KEEPLY HAS READ — the answer to the only question an empty
 * Connections page raises.
 *
 * Three different facts arrive on screen looking identical: you have
 * saved nothing; Keeply has not read what you saved yet; this
 * deployment has no model configured, so it never will. The product
 * knew which one it was — /api/knowledge/indexing has reported it
 * since it was written — and had no screen to say it on. That is the
 * same defect as a sign-in form that answers "incorrect password"
 * when the server has no database: the system knows and does not say.
 *
 * Everything here is read from that route and scoped to the caller's
 * own library by the route itself. Nothing is estimated: a number that
 * has not arrived renders as nothing, never as zero, because zero is a
 * claim about someone's library.
 *
 * The button queues work on the EXISTING queue and returns. It does
 * not run it — the scheduled tick drains the queue — so this adds no
 * second worker and no second pipeline.
 * ================================================================== */

import { Loader2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { fetchIndexingStatus, startBackfill, type IndexingStatus } from "@/lib/knowledge/client"

type Phase = "loading" | "ready" | "error"

export function IndexingPanel() {
  const [status, setStatus] = useState<IndexingStatus | null>(null)
  const [phase, setPhase] = useState<Phase>("loading")
  const [queueing, setQueueing] = useState(false)
  const [queued, setQueued] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    setPhase("loading")
    fetchIndexingStatus(ac.signal)
      .then((data) => {
        setStatus(data)
        setPhase("ready")
      })
      .catch(() => {
        if (!ac.signal.aborted) setPhase("error")
      })
    return () => ac.abort()
  }, [attempt])

  const queue = useCallback(async () => {
    setQueueing(true)
    setQueued(null)
    try {
      const result = await startBackfill()
      // The server's own counts, not a cheerful paraphrase. "Nothing to
      // queue" and "queued 40" are different outcomes and the person
      // asked a question that deserves whichever one is true.
      setQueued(
        result.enqueued > 0
          ? `Queued ${result.enqueued} ${result.enqueued === 1 ? "piece" : "pieces"}.`
          : result.alreadyQueued > 0
            ? `Already queued — ${result.alreadyQueued} waiting.`
            : "Nothing to queue: everything has been read.",
      )
      setAttempt((n) => n + 1)
    } catch (err) {
      setQueued(err instanceof Error ? err.message : "Couldn't queue the work.")
    } finally {
      setQueueing(false)
    }
  }, [])

  if (phase === "loading") {
    return (
      <Section>
        <p className="pk-meta flex items-center gap-2">
          <Loader2 className="size-3.5 animate-spin text-[var(--pk-signal)]" aria-hidden />
          Checking
        </p>
      </Section>
    )
  }

  if (phase === "error" || !status) {
    return (
      <Section>
        <p className="text-[14px] leading-[1.65] text-[var(--pk-ink-3)]">
          Couldn&apos;t read what Keeply has processed.
        </p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-3 text-[14px] text-[var(--pk-ink)] underline decoration-[var(--pk-rule-2)] underline-offset-4"
        >
          Try again
        </button>
      </Section>
    )
  }

  const { backlog, jobs, semanticSearch, embedding } = status
  const pending = backlog.total
  const working = jobs.queued + jobs.leased

  return (
    <Section>
      {/* THE DEPLOYMENT FACT FIRST. When meaning-based search is not
          configured, nothing below it will ever finish, and saying so
          after a backlog number would read as a detail rather than the
          reason. */}
      {!semanticSearch.enabled && (
        <p className="pk-evidence mb-6 max-w-[54ch] text-[13.5px] leading-[1.6]">
          Meaning-based search isn&rsquo;t configured on this deployment, so saved pieces can&rsquo;t be read or
          connected. Until it is, search matches exact words only.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
        <Fact label="Read" value={jobs.done} />
        <Fact label="Waiting" value={pending} />
        <Fact label="In the queue" value={working} />
        {jobs.failed > 0 && <Fact label="Failed" value={jobs.failed} tone="danger" />}
      </dl>

      {/* The breakdown only earns its space when there IS a backlog,
          and only the reasons that actually have items. */}
      {pending > 0 && (
        <ul className="mt-6 flex flex-col">
          {(
            [
              ["Never read", backlog.neverIndexed],
              ["Text changed since", backlog.staleChunks],
              ["No ideas extracted yet", backlog.neverAnalyzed],
              ["No summary yet", backlog.neverSummarized],
              ["Missing embeddings", backlog.missingVectors],
            ] as const
          )
            .filter(([, n]) => n > 0)
            .map(([label, n]) => (
              <li
                key={label}
                className="flex items-baseline justify-between gap-4 border-b border-[var(--pk-rule)] py-2.5"
              >
                <span className="text-[14px] text-[var(--pk-ink-2)]">{label}</span>
                <span className="pk-meta pk-num">{n}</span>
              </li>
            ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          type="button"
          onClick={queue}
          disabled={queueing || pending === 0}
          className="inline-flex items-center gap-1.5 text-[14px] text-[var(--pk-ink)] underline decoration-[var(--pk-rule-2)] underline-offset-4 transition-colors hover:decoration-[var(--pk-ink)] disabled:cursor-not-allowed disabled:text-[var(--pk-ink-4)] disabled:no-underline"
        >
          {queueing && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {queueing ? "Queueing…" : pending === 0 ? "Nothing waiting" : "Read what's waiting"}
        </button>
        {queued && (
          <span role="status" className="pk-meta">
            {queued}
          </span>
        )}
      </div>

      {/* Which model, never the credential. Which model is configured
          is exactly what an operator needs when a backlog will not
          clear, and it is not a secret. */}
      <p className="pk-meta mt-6">
        {embedding.provider} · {embedding.model} · {embedding.dimensions}d
      </p>
    </Section>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section className="border-t border-[var(--pk-rule)] py-6">
      <p className="pk-label mb-5">What Keeply has read</p>
      {children}
    </section>
  )
}

function Fact({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div>
      <dt className="pk-label">{label}</dt>
      <dd
        className={`pk-num mt-1.5 text-[22px] font-medium tracking-[-0.02em] ${
          tone === "danger" ? "text-[var(--pk-danger)]" : "text-[var(--pk-ink)]"
        }`}
      >
        {value.toLocaleString()}
      </dd>
    </div>
  )
}
