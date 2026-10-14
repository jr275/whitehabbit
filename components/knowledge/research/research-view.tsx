"use client"

/* ================================================================== *
 * RESEARCH — an objective in, a grounded brief out.
 *
 * Deliberately not a chat and not a dashboard: one textarea, one
 * button, one result. The result's value is the sources under it, so
 * those get the space a conversation UI would spend on turn-taking.
 *
 * Every claim the user reads comes from the API. There is no fallback
 * copy standing in for a synthesis, no invented discovery, no
 * fabricated source — the states below are entered because the
 * backend reported them.
 * ================================================================== */

import { AlertTriangle, ArrowRight, Clock, ExternalLink, Info, Loader2, ShieldAlert, WifiOff } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { PageContainer, PageHeader } from "../page-header"
import { useKnowledgeResearch } from "@/lib/knowledge/use-knowledge-research"
import type { AskFailure } from "@/lib/knowledge/client"
import { MAX_OBJECTIVE_CHARS, MIN_OBJECTIVE_CHARS, type ResearchBrief } from "@/lib/knowledge/research-contract"
import { useLocale, useT } from "../i18n"


export function ResearchView() {
  const t = useT()
  const { state, research } = useKnowledgeResearch()
  const [draft, setDraft] = useState("")
  const busy = state.phase === "loading"

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t.research.eyebrow}
        title={t.research.title}
        /* The brief's copy said "search the web". This searches the
           user's own library, so that sentence would be false in the
           product's own header — see lib/knowledge/research.ts for why
           the library is the corpus. The promise is otherwise
           unchanged: an objective in, grounded evidence out. */
        subtitle={t.research.subtitle}
      />

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault()
          research(draft)
        }}
      >
        <div className="rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-4 focus-within:border-[var(--kn-ai)]/50">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            rows={4}
            maxLength={MAX_OBJECTIVE_CHARS}
            placeholder={t.research.placeholder}
            aria-label={t.research.objectiveLabel}
            className="w-full resize-y bg-transparent text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || draft.trim().length < MIN_OBJECTIVE_CHARS}
            className="flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t.research.submit}
          </button>
        </div>
      </form>

      <div className="mt-10">
        {state.phase === "idle" ? null : state.phase === "loading" ? (
          <LoadingState />
        ) : state.phase === "error" ? (
          <ErrorState failure={state.failure} onRetry={() => research(state.objective)} />
        ) : (
          <BriefResult brief={state.brief} />
        )}
      </div>
    </PageContainer>
  )
}

function LoadingState() {
  const t = useT()
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-[var(--kn-edge)] bg-[var(--kn-paper)] px-6 py-14 text-center">
      <Loader2 className="size-5 animate-spin text-[var(--kn-ai)]" />
      <p className="text-[15px] font-medium text-foreground">{t.research.loading}</p>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {t.research.loadingBody}
      </p>
    </div>
  )
}

function BriefResult({ brief }: { brief: ResearchBrief }) {
  const t = useT()
  const { n } = useLocale()
  if (brief.status === "no_evidence") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-[var(--kn-edge)] bg-[var(--kn-paper)] px-6 py-14 text-center">
        <div className="max-w-md space-y-2">
          <p className="text-[15px] font-medium text-foreground">{t.research.nothingCovers}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{brief.summary}</p>
        </div>
        <SemanticNotice status={brief.retrieval.semanticSearch} />
        <Link href="/knowledge/library" className="text-sm text-muted-foreground underline underline-offset-4">
          {t.research.browseLibrary}
        </Link>
      </div>
    )
  }

  return (
    <article className="space-y-10">
      <section>
        <h2 className="text-[13px] font-medium text-primary">{t.research.answerHeading}</h2>
        {brief.unresolvedCitationIds.length > 0 ? (
          <div className="mt-3 flex items-start gap-3 rounded-2xl border border-[var(--kn-edge)] bg-secondary/50 px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              This synthesis refers to {brief.unresolvedCitationIds.map((id) => `[${id}]`).join(" ")}, which
              {brief.unresolvedCitationIds.length === 1 ? " was" : " were"} not among the sources retrieved. Treat
              those references as unverified.
            </p>
          </div>
        ) : null}
        <div className="mt-3 space-y-4 text-[15px] leading-[1.7] text-foreground">
          {brief.summary
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean)
            .map((paragraph, i) => (
              <p key={i} className="text-pretty">
                {paragraph}
              </p>
            ))}
        </div>
      </section>

      {brief.discoveries.length > 0 ? (
        <section>
          <h2 className="text-[13px] font-medium text-primary">{t.research.keyDiscoveries}</h2>
          <ol className="mt-4 space-y-5">
            {brief.discoveries.map((d) => (
              <li key={`${d.importance}-${d.title}`} className="flex gap-4">
                <span className="mt-0.5 shrink-0 font-mono text-[13px] tabular-nums text-muted-foreground">
                  {String(d.importance).padStart(2, "0")}
                </span>
                <div className="min-w-0 space-y-1.5">
                  <p className="text-[15px] font-medium leading-snug text-foreground">{d.title}</p>
                  <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{d.finding}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {d.citationIds.length === 1 ? "Source " : "Sources "}
                    {d.citationIds.join(", ")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {brief.sources.length > 0 ? (
        <section>
          <h2 className="text-[13px] font-medium text-primary">Sources</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {brief.sources.map((s) => (
              <li key={s.citationId} className="rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-[var(--kn-ai)]/12 text-[11px] font-medium tabular-nums text-[var(--kn-ai)]">
                    {s.citationId}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {/* Links to the saved item's own reader: the point of
                        a source here is the piece the user already has. */}
                    <Link
                      href={`/knowledge/read/${s.knowledgeItemId}`}
                      className="line-clamp-2 text-sm font-medium leading-snug text-foreground hover:underline"
                    >
                      {s.title}
                    </Link>
                    {s.excerpt ? (
                      <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{s.excerpt}</p>
                    ) : null}
                    {s.sourceUrl ? (
                      <a
                        href={s.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3" />
                        {hostOf(s.sourceUrl)}
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="space-y-3 border-t border-[var(--kn-edge)] pt-4">
        <SemanticNotice status={brief.retrieval.semanticSearch} />
        <p className="text-[12px] text-muted-foreground">
          {t.ask.passages(brief.retrieval.chunksUsed)} · {t.research.pieces(brief.retrieval.itemsCovered, n(brief.retrieval.itemsCovered))}
        </p>
      </footer>
    </article>
  )
}

/** Semantic search failing open to lexical is correct and dangerous:
 *  the brief still arrives, so nothing looks wrong. */
function SemanticNotice({ status }: { status: ResearchBrief["retrieval"]["semanticSearch"] }) {
  const t = useT()
  if (status.enabled || status.reason === "not_requested") return null
  const copy =
    status.reason === "provider_not_configured"
      ? t.research.lexicalOnlyUnconfigured
      : t.research.lexicalOnlyUnavailable
  return (
    <div className="flex max-w-xl items-start gap-2.5 rounded-xl bg-secondary/50 px-3 py-2.5">
      <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <p className="text-[12px] leading-relaxed text-muted-foreground">{copy}</p>
    </div>
  )
}

function ErrorState({ failure, onRetry }: { failure: AskFailure; onRetry: () => void }) {
  const t = useT()
  const icon = FAILURE_ICON[failure.kind]
  const title = t.research.failure[failure.kind]
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-[var(--kn-edge)] bg-[var(--kn-paper)] px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
        {icon}
      </span>
      <div className="max-w-md space-y-2">
        <p className="text-[15px] font-medium text-foreground">{title}</p>
        {/* The server's own message, not a rewrite of it. */}
        <p className="text-sm leading-relaxed text-muted-foreground">{failure.message}</p>
      </div>
      {failure.retryable ? (
        <button
          onClick={onRetry}
          className="flex h-10 items-center rounded-full border border-border px-5 text-sm text-foreground hover:bg-secondary"
        >
          {t.common.tryAgain}
        </button>
      ) : failure.kind === "unauthorized" ? (
        <Link
          href="/login?callbackUrl=/knowledge/home"
          className="flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
        >
          {t.common.signIn} <ArrowRight className="size-4" />
        </Link>
      ) : null}
    </div>
  )
}

/* The icon only. The sentence lives in the dictionary, keyed by the
 * same `AskFailure["kind"]`, so a new failure kind cannot ship with an
 * English sentence baked in beside its icon. */
const FAILURE_ICON: Record<AskFailure["kind"], React.ReactNode> = {
  unauthorized: <ShieldAlert className="size-6" />,
  invalid_request: <AlertTriangle className="size-6" />,
  rate_limited: <Clock className="size-6" />,
  provider_unavailable: <ShieldAlert className="size-6" />,
  provider_error: <AlertTriangle className="size-6" />,
  malformed_response: <AlertTriangle className="size-6" />,
  network: <WifiOff className="size-6" />,
  unknown: <AlertTriangle className="size-6" />,
}

/** Display-only. A URL that will not parse is shown verbatim rather
 *  than dropped — the source is still real. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}
