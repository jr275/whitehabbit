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
import { fetchIndexingStatus, startBackfill, type IndexingStatus, type ReadinessCheck } from "@/lib/knowledge/client"
import { useT } from "./i18n"

type Phase = "loading" | "ready" | "error"

export function IndexingPanel() {
  const t = useT()
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
          ? t.indexing.queued(result.enqueued)
          : result.alreadyQueued > 0
            ? t.indexing.alreadyQueued(result.alreadyQueued)
            : t.indexing.nothingToQueue,
      )
      setAttempt((n) => n + 1)
    } catch (err) {
      setQueued(err instanceof Error ? err.message : t.indexing.queueFailed)
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
          {t.indexing.readFailed}
        </p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-3 text-[14px] text-[var(--pk-ink)] underline decoration-[var(--pk-rule-2)] underline-offset-4"
        >
          {t.common.tryAgain}
        </button>
      </Section>
    )
  }

  const { backlog, jobs, embedding } = status
  const pending = backlog.total
  const working = jobs.queued + jobs.leased

  return (
    <Section>
      {/* THE DEPLOYMENT FIRST. When a piece of configuration is
          missing, nothing below it will ever finish, and a backlog
          number shown first reads as the problem when it is only the
          symptom. */}
      {!status.deployment.ready && (
        <div className="mb-7">
          <p className="pk-label mb-3 text-[var(--pk-evidence)]">{t.indexing.deploymentUnfinished}</p>
          <ul className="flex flex-col">
            {status.deployment.checks.map((check) => (
              <Check key={check.id} check={check} />
            ))}
          </ul>
          <p className="pk-meta mt-3 max-w-[54ch]">
            {t.indexing.deploymentHint}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
        <Fact label={t.indexing.read} value={jobs.done} />
        <Fact label={t.indexing.waiting} value={pending} />
        <Fact label={t.indexing.inTheQueue} value={working} />
        {jobs.failed > 0 && <Fact label={t.indexing.failed} value={jobs.failed} tone="danger" />}
      </dl>

      {/* The breakdown only earns its space when there IS a backlog,
          and only the reasons that actually have items. */}
      {pending > 0 && (
        <ul className="mt-6 flex flex-col">
          {(
            [
              [t.indexing.neverRead, backlog.neverIndexed],
              [t.indexing.textChanged, backlog.staleChunks],
              [t.indexing.noIdeas, backlog.neverAnalyzed],
              [t.indexing.noSummary, backlog.neverSummarized],
              [t.indexing.missingEmbeddings, backlog.missingVectors],
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
          {queueing ? t.indexing.queueing : pending === 0 ? t.indexing.nothingWaiting : t.indexing.readWhatsWaiting}
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
  const t = useT()
  return (
    <section className="border-t border-[var(--pk-rule)] py-6">
      <p className="pk-label mb-5">{t.indexing.heading}</p>
      {children}
    </section>
  )
}

/** One configuration line. A satisfied check still renders — a list
 *  that only shows failures cannot tell "this is fine" from "this was
 *  never checked", and the point of the screen is to answer that. */
function Check({ check }: { check: ReadinessCheck }) {
  const t = useT()
  return (
    <li className="flex items-baseline gap-3 border-b border-[var(--pk-rule)] py-2.5 last:border-b-0">
      <span
        aria-hidden
        className={`shrink-0 text-[13px] ${check.ok ? "text-[var(--pk-good)]" : "text-[var(--pk-evidence)]"}`}
      >
        {check.ok ? "✓" : "✗"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-[14px] text-[var(--pk-ink)]">{check.label}</span>
        {!check.ok && (
          <>
            {/* The variable NAMES, which is the whole deliverable of
                this screen. Never a value — see lib/deployment-readiness. */}
            <span className="pk-meta mt-1 block">
              set {check.missing.join(" · ")}
            </span>
            <span className="mt-1 block text-[13px] leading-[1.55] text-[var(--pk-ink-3)]">{check.consequence}</span>
          </>
        )}
      </span>
      <span className="sr-only">{check.ok ? t.indexing.configured : t.indexing.notConfigured}</span>
    </li>
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
