"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  FileType2,
  Headphones,
  Heart,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Square,
} from "lucide-react"
import type { KnowledgeDocument } from "@/lib/knowledge/types"
import { useLocale, useT } from "./i18n"
import { KIND_META, askAboutHref, durationLabel, savedAgo } from "@/lib/knowledge/config"
import { patchItem, summarizeItem } from "@/lib/knowledge/client"
import { DiscoveryPanel } from "./discovery-panel"
import { READ_ALOUD_RATES, type ReadAloudRate } from "@/lib/knowledge/read-aloud"
import { useReadAloud, type UseReadAloudResult } from "@/lib/knowledge/use-read-aloud"
import { cn } from "@/lib/utils"

/** Split the extracted plain text into readable paragraphs. The stored
 *  body is flattened plain text (the extractor intentionally drops
 *  markup), so this is the honest maximum structure we can render. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/** Build an embeddable player URL for the common providers, or null.
 *  Only returns a URL we can genuinely embed — otherwise the caller
 *  falls back to a thumbnail + "watch at source" affordance. */
function videoEmbed(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl)
    const host = u.hostname.replace(/^www\./, "")
    if (host === "youtu.be") {
      const id = u.pathname.slice(1)
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host.endsWith("youtube.com")) {
      const v = u.searchParams.get("v")
      if (v) return `https://www.youtube.com/embed/${v}`
      const m = u.pathname.match(/\/(?:embed|shorts)\/([\w-]+)/)
      return m ? `https://www.youtube.com/embed/${m[1]}` : null
    }
    if (host.endsWith("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean)[0]
      return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null
    }
    return null
  } catch {
    return null
  }
}

export function ReaderView({ doc }: { doc: KnowledgeDocument }) {
  const t = useT()
  const { locale, n } = useLocale()
  const [favorite, setFavorite] = useState(doc.favorite)
  const [progress, setProgress] = useState(0)
  // Local override so a freshly-generated summary shows immediately —
  // same pattern as `favorite` above, since `doc` itself is an
  // immutable prop from the caller.
  const [aiSummary, setAiSummary] = useState(doc.aiSummary)

  const processing = doc.state === "saved" || doc.state === "fetching" || doc.state === "extracting"
  const failed = doc.state === "failed"
  const body = doc.contentText ? paragraphs(doc.contentText) : []
  const hasBody = body.length > 0
  const hasExcerpt = Boolean(doc.excerpt && doc.excerpt.trim().length > 0)

  // What kind of reading surface to render once the item is ready.
  const surface: "article" | "video" | "pdf" | "unextracted" = failed || processing
    ? "article" // routed by the state branches below, value unused
    : doc.kind === "video"
      ? "video"
      : doc.kind === "pdf"
        ? "pdf"
        : hasBody || hasExcerpt
          ? "article"
          : "unextracted"

  const showProgress = !processing && !failed && surface === "article" && hasBody

  // AI Summary and Read Aloud are both offered only where there is
  // real extracted body text to work from — the exact same condition
  // as the progress line above. video/pdf/unextracted/failed/
  // processing never reach either, matching "hide Listen" for
  // video/PDF and "don't offer it" for unextracted/failed; AI Summary
  // has nothing honest to summarize without real contentText either.
  const showTextTools = showProgress

  // Keyed on doc.id so navigating to a different item tears down any
  // in-progress speech and starts fresh (see the hook).
  const read = useReadAloud(doc.id, body, doc.lang)

  async function toggleFavorite() {
    const next = !favorite
    setFavorite(next)
    try {
      await patchItem(doc.id, { favorite: next })
    } catch {
      setFavorite(!next)
    }
  }

  // Discreet reading-progress line, tracked against the window scroll and
  // updated on a rAF so it stays smooth. Only mounted for long-form text.
  useEffect(() => {
    if (!showProgress) return
    let raf = 0
    function onScroll() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = document.documentElement
        const max = el.scrollHeight - el.clientHeight
        setProgress(max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0)
      })
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [showProgress])

  return (
    /* ONE COLUMN.
     *
     * The Reader used to be a 1fr + 360px grid: the article on the left
     * and an Info / Notebook inspector on the right holding the topics,
     * the source facts and everything Keeply understood. Three
     * consequences, all bad for a reading surface. The article was
     * pushed off-centre and never got the page's optical middle. The
     * understanding was filed in a panel, which is where you put things
     * a reader is not expected to read. And the panel's second tab
     * existed only to say a feature had not shipped.
     *
     * Everything is now one column in the order a person meets it:
     *   source → title → byline → summary → the text → what Keeply
     *   understood → where it came from
     * AI is a layer around the article, not a sidebar beside it. */
    <div className="pk-page">
      {/* A reading surface earns a thinner bar than an app screen: back,
          the three things you do to a piece, and the progress hairline. */}
      <div className="sticky top-0 z-10 -mx-[var(--pk-gutter)] border-b border-[var(--pk-rule)] bg-[var(--pk-ground)]/88 px-[var(--pk-gutter)] backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-3">
          <Link
            href="/knowledge/library"
            className="pk-meta -ml-1 flex items-center gap-1.5 px-1 transition-colors hover:text-[var(--pk-ink)]"
          >
            <ArrowLeft className="size-3.5" /> {t.nav.library}
          </Link>
          <div className="flex items-center gap-1">
            {/* Ask about this — routes to the existing Ask surface with
                the composer pre-filled. Passes only the `q` free-text
                the flow already accepts; nothing is auto-run or faked. */}
            <Link
              href={askAboutHref(t.reader.askMainIdeas(doc.title))}
              className="pk-meta flex h-8 items-center gap-1.5 rounded-full px-2.5 transition-colors hover:bg-[var(--pk-sunken)] hover:text-[var(--pk-ink)]"
            >
              <Sparkles className="size-3.5" />
              <span className="hidden sm:inline">{t.reader.askAboutThis}</span>
            </Link>
            <IconButton
              label={favorite ? t.reader.removeFavorite : t.reader.addFavorite}
              active={favorite}
              onClick={toggleFavorite}
            >
              <Heart className={cn("h-4 w-4", favorite && "fill-current")} />
            </IconButton>
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.reader.openOriginal}
              className="flex size-8 items-center justify-center rounded-full text-[var(--pk-ink-3)] transition-colors hover:bg-[var(--pk-sunken)] hover:text-[var(--pk-ink)]"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
        {showProgress && (
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-px origin-left bg-[var(--pk-ink)] transition-[width] duration-150 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        )}
      </div>

      <article className="mx-auto max-w-[var(--pk-measure)] pb-28 pt-14 sm:pt-20">
        {/* ── SOURCE → TITLE → BYLINE ───────────────────────────── */}
        <SourceLine doc={doc} />

        <h1 className="pk-title mt-5 text-pretty text-[var(--pk-ink)]">{doc.title}</h1>

        <MetaRow doc={doc} />

        {/* ── SUMMARY — shown ONCE (see AiSummaryBlock below). ──── */}
        {!processing && !failed && aiSummary?.trim() ? <AiSummaryCard summary={aiSummary.trim()} /> : null}

        {/* ── THE TEXT, routed by real state then kind ──────────── */}
        {processing ? (
          <ProcessingBlock />
        ) : failed ? (
          <FailedBlock url={doc.url} error={doc.error} />
        ) : surface === "video" ? (
          <VideoBlock doc={doc} />
        ) : surface === "pdf" ? (
          <PdfBlock doc={doc} />
        ) : surface === "article" ? (
          hasBody ? (
            <>
              {showTextTools && (
                <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--pk-rule)] pb-6">
                  <AiSummaryBlock docId={doc.id} summary={aiSummary} onSummary={setAiSummary} />
                  <ReadAloudControls read={read} />
                </div>
              )}
              <ArticleBody
                body={body}
                cover={doc.cover}
                title={doc.title}
                spokenIndex={read.state === "playing" || read.state === "paused" ? read.paragraphIndex : null}
              />
            </>
          ) : (
            <ExcerptLede excerpt={doc.excerpt!} cover={doc.cover} title={doc.title} url={doc.url} />
          )
        ) : (
          <UnextractedBlock url={doc.url} />
        )}

        {/* ── INSIGHTS — what Keeply understood, in the flow.
            Topics come straight from the item; Key ideas and Related
            knowledge come from the concepts pipeline (migration 0010)
            through /api/knowledge/:id/related. Nothing is rendered that
            cannot be supported: an unanalyzed item says so rather than
            showing an empty result. */}
        {!processing && !failed && (
          <section aria-label={t.reader.insights} className="pk-section mt-10">
            <h2 className="pk-label mb-6">{t.reader.insights}</h2>

            {doc.topics.length > 0 && (
              <div className="mb-7">
                <p className="pk-label mb-2.5">{t.reader.topics}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {doc.topics.map((t) => (
                    <Link
                      key={t}
                      href={`/knowledge/library?q=${encodeURIComponent(t)}`}
                      className="text-[14px] text-[var(--pk-ink-2)] underline decoration-[var(--pk-rule-2)] underline-offset-4 transition-colors hover:text-[var(--pk-ink)]"
                    >
                      {t}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <DiscoveryPanel itemId={doc.id} />
          </section>
        )}

        {/* ── SOURCE, at the end: where this came from, and the way
            back to it. The reader wants this after the piece, not
            beside it. */}
        <section aria-label={t.reader.source} className="pk-section">
          <h2 className="pk-label mb-6">{t.reader.source}</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
            <Meta label={t.reader.source} value={doc.source} />
            {doc.author ? <Meta label={t.reader.author} value={doc.author} /> : null}
            {doc.domain ? <Meta label={t.reader.origin} value={doc.domain} /> : null}
            <Meta label={t.reader.type} value={t.kinds[doc.kind]} />
            {doc.wordCount ? <Meta label={t.reader.words} value={n(doc.wordCount)} /> : null}
            <Meta label={t.reader.saved} value={savedAgo(t, locale, doc.savedAt)} />
            {doc.publishedAt ? <Meta label={t.reader.published} value={new Date(doc.publishedAt).toLocaleDateString(locale)} /> : null}
          </dl>
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-7 inline-flex items-center gap-1.5 text-[14px] text-[var(--pk-ink)] underline decoration-[var(--pk-rule-2)] underline-offset-4"
          >
            <ExternalLink className="size-3.5" /> {t.reader.openTheOriginal}
          </a>
        </section>
      </article>
    </div>
  )
}

/* ── Header pieces ──────────────────────────────────────────────── */

function SourceLine({ doc }: { doc: KnowledgeDocument }) {
  const t = useT()
  const [iconFailed, setIconFailed] = useState(false)
  const Kind = KIND_META[doc.kind].icon
  return (
    <div className="pk-label flex items-center gap-2 text-[var(--pk-ink-3)]">
      {doc.favicon && !iconFailed ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={doc.favicon || "/placeholder.svg"}
          alt=""
          width={16}
          height={16}
          referrerPolicy="no-referrer"
          onError={() => setIconFailed(true)}
          className="size-4 shrink-0 rounded-[3px] object-contain"
        />
      ) : (
        <Kind className="size-3.5 shrink-0" />
      )}
      <span className="truncate">{doc.source || doc.domain}</span>
      <span aria-hidden className="text-[var(--pk-rule-2)]">/</span>
      <span className="shrink-0">{t.kinds[doc.kind]}</span>
    </div>
  )
}

/** Quiet, on-brand presentation of the item's existing AI summary.
 *  Single accent (Apple blue), no gradient — it reads as a calm digest
 *  above the full piece, never competing with the headline. */
/** The item's existing AI summary.
 *
 *  It used to be a tinted, bordered panel in the accent colour, sitting
 *  directly under the headline — the loudest element on a reading page,
 *  for text the reader did not write and may not want. It is now marked
 *  the way Keeply marks everything the system produced: a label and a
 *  rule in the accent, and the words themselves in ordinary ink. The
 *  claim "Keeply wrote this" is fully carried; the shout is not. */
function AiSummaryCard({ summary }: { summary: string }) {
  const t = useT()
  return (
    <aside aria-label={t.reader.aiSummary} className="mt-9 border-l-2 border-[var(--pk-accent)] pl-5">
      <p className="pk-label flex items-center gap-1.5 text-[var(--pk-accent)]">
        <Sparkles className="size-3" />
        Summary
      </p>
      <p className="mt-2.5 text-pretty text-[15px] leading-[1.68] text-[var(--pk-ink-2)]">{summary}</p>
    </aside>
  )
}

function MetaRow({ doc }: { doc: KnowledgeDocument }) {
  const t = useT()
  const { locale } = useLocale()
  const duration = durationLabel(t, doc.kind, doc.durationMin)
  /* A byline, not a stats bar. The kind already appears in the source
     line above, so repeating it here between two rules was chrome
     restating chrome. */
  return (
    <div className="pk-meta mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
      {doc.author && (
        <>
          <span className="text-[var(--pk-ink-2)]">{doc.author}</span>
          <span aria-hidden>·</span>
        </>
      )}
      {duration && (
        <>
          <span>{duration}</span>
          <span aria-hidden>·</span>
        </>
      )}
      <span>{savedAgo(t, locale, doc.savedAt)}</span>
    </div>
  )
}

/** The Reader's AI Summary block — an on-demand "AI Summary" pill that
 *  calls POST /api/knowledge/:id/summarize, and the generated summary
 *  once it exists. On-demand only: this never fires on its own, and
 *  once a summary exists it is shown as plain settled content, never
 *  regenerated by re-opening the item. Guest items (no server-side
 *  row, no session) simply don't get the affordance. */
function AiSummaryBlock({
  docId,
  summary,
  onSummary,
}: {
  docId: string
  summary: string | undefined
  onSummary: (summary: string) => void
}) {
  const t = useT()
  const [state, setState] = useState<"idle" | "loading" | "error">("idle")

  if (docId.startsWith("kn_guest_")) return null

  async function summarize() {
    setState("loading")
    try {
      const updated = await summarizeItem(docId)
      if (updated.aiSummary) onSummary(updated.aiSummary)
      setState("idle")
    } catch {
      setState("error")
    }
  }

  // Nothing to offer when one already exists — AiSummaryCard above is
  // the one place a summary is DISPLAYED. Both used to render it, which
  // stayed invisible while summaries were rare: the card only appeared
  // when doc.aiSummary existed, and back then it usually did not. The
  // pipeline now writes one for every saved item, so every reader
  // showed the same two or three sentences twice, one above the other.
  if (summary) return null

  return (
    <>
      <button
        type="button"
        onClick={summarize}
        disabled={state === "loading"}
        title={t.reader.summarizeTitle}
        className="inline-flex items-center gap-1.5 text-[13.5px] text-[var(--pk-ink-2)] transition-colors hover:text-[var(--pk-ink)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "loading" ? (
          <Loader2 className="size-3.5 animate-spin text-[var(--pk-accent)]" aria-hidden />
        ) : (
          <Sparkles className="size-3.5 text-[var(--pk-accent)]" aria-hidden />
        )}
        {state === "loading" ? t.reader.summarizing : t.reader.summarize}
      </button>
      {state === "error" ? (
        <span role="status" className="pk-meta text-[var(--pk-danger)]">
          {t.reader.summaryFailed}
        </span>
      ) : null}
    </>
  )
}

/** The Reader's Listen toolbar — a single toggling button (Listen →
 *  Pause/Resume) plus Previous/Next/Stop once reading has started.
 *  Deliberately reads as an editorial tool (a pill button in the
 *  Reader's own idiom), not a music player: no waveform, no scrubber,
 *  no album-art chrome. */
function ReadAloudControls({ read }: { read: UseReadAloudResult }) {
  const t = useT()
  if (read.state === "unsupported") {
    return (
      <span className="pk-meta inline-flex items-center gap-1.5">
        <Headphones className="size-3.5" aria-hidden />
        {read.message}
      </span>
    )
  }

  // Defensive only — the Reader never renders this component unless
  // there is real extracted body text, so the controller's own
  // "unavailable" (empty queue) is not reachable in practice.
  if (read.state === "unavailable") return null

  const isPlaying = read.state === "playing"
  const isPaused = read.state === "paused"
  const isActive = isPlaying || isPaused

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        onClick={() => (isPlaying ? read.pause() : isPaused ? read.resume() : read.play())}
        aria-label={isPlaying ? t.reader.pauseReading : isPaused ? t.reader.resumeReading : t.reader.listen}
        aria-pressed={isPlaying}
        title={isPlaying ? t.reader.pauseReading : isPaused ? t.reader.resumeReading : t.reader.listen}
        className="inline-flex items-center gap-1.5 text-[13.5px] text-[var(--pk-ink-2)] transition-colors hover:text-[var(--pk-ink)]"
      >
        {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        {isPlaying ? "Pause" : isPaused ? "Resume" : "Listen"}
      </button>

      {isActive ? (
        <>
          <IconButton label={t.reader.previousParagraph} onClick={read.previous} disabled={!read.hasPrevious}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <IconButton label={t.reader.nextParagraph} onClick={read.next} disabled={!read.hasNext}>
            <ChevronRight className="size-4" />
          </IconButton>
          <IconButton label={t.reader.stopReading} onClick={read.stop}>
            <Square className="size-3.5" />
          </IconButton>
          <RateSelect read={read} />
        </>
      ) : null}

      {read.state === "error" ? (
        <span role="status" className="pk-meta text-[var(--pk-danger)]">
          {read.message}
        </span>
      ) : null}
    </div>
  )
}

/** Playback speed.
 *
 * A native <select> rather than a row of pills: five options is one
 * too many for a toolbar that already carries four buttons, and the
 * native control is the one that is already keyboard- and
 * screen-reader-correct on every platform, including the mobile
 * sheet. It is only rendered while Read Aloud is active, so it costs
 * nothing on an article nobody is listening to.
 *
 * Changing speed mid-paragraph restarts that paragraph — the Web
 * Speech API fixes an utterance's rate when it is created. See
 * ReadAloudController.setRate. */
function RateSelect({ read }: { read: UseReadAloudResult }) {
  const t = useT()
  return (
    <label className="flex items-center">
      <span className="sr-only">{t.reader.playbackSpeed}</span>
      <select
        value={read.rate}
        onChange={(e) => read.setRate(Number(e.target.value) as ReadAloudRate)}
        className="h-8 rounded-full border border-[var(--pk-rule-2)] bg-[var(--pk-raised)] px-2 text-[12px] text-[var(--pk-ink-2)] transition-colors hover:border-[var(--pk-ink-4)]"
      >
        {READ_ALOUD_RATES.map((r) => (
          <option key={r} value={r}>
            {r}×
          </option>
        ))}
      </select>
    </label>
  )
}

/* ── Body surfaces ──────────────────────────────────────────────── */

function ArticleBody({
  body,
  cover,
  title,
  spokenIndex,
}: {
  body: string[]
  cover?: string
  title: string
  /** The paragraph Read Aloud is narrating, or null when it is not
   *  speaking. Null rather than 0, so a resting player does not mark
   *  the first paragraph as if it were being read. */
  spokenIndex: number | null
}) {
  const t = useT()
  const [coverFailed, setCoverFailed] = useState(false)
  return (
    <>
      {cover && !coverFailed ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={cover || "/placeholder.svg"}
          alt={t.reader.leadImage(title)}
          referrerPolicy="no-referrer"
          onError={() => setCoverFailed(true)}
          className="mt-10 aspect-[16/9] w-full rounded-[var(--pk-r)] object-cover"
        />
      ) : null}

      {/* THE ONE PLACE THE SERIF IS SPENT.
          Everything Keeply writes is sans; the text you saved is set in
          Fraunces. That is not decoration — it is the page saying
          "these are someone else's words", which no border or label
          says as quietly, and it is why headings are sans: a serif
          headline would spend the distinction on nothing.

          The drop cap is gone with it. A 60px accent-coloured initial
          is a magazine flourish; here it made the accent the first
          thing the eye hit on every article, on a page whose whole
          argument is that the article comes first. */}
      <div className="pk-read mt-10 space-y-6 text-[1.1rem] leading-[1.75] text-[var(--pk-ink)] [word-break:break-word] selection:bg-[var(--pk-accent-wash)]">
        {/* The narrated paragraph is marked with a wash and a rule in
            the margin, not a colour change on the text: the article's
            own ink is the one thing the Reader does not repaint.
            aria-current carries the same fact to a screen reader,
            which cannot see either. */}
        {body.map((p, i) => (
          <p
            key={i}
            aria-current={i === spokenIndex ? "true" : undefined}
            className={
              i === spokenIndex
                ? "-mx-3 rounded-[var(--pk-r-sm)] border-l-2 border-[var(--pk-accent)] bg-[var(--pk-accent-wash)] px-3 py-0.5 transition-colors"
                : "transition-colors"
            }
          >
            {p}
          </p>
        ))}
      </div>
    </>
  )
}

/** Shown when we have the source's real summary but not the full body
 *  (e.g. guest items, which are never server-extracted). Presented
 *  honestly as the summary, with the original one tap away. */
function ExcerptLede({
  excerpt,
  cover,
  title,
  url,
}: {
  excerpt: string
  cover?: string
  title: string
  url: string
}) {
  const t = useT()
  const [coverFailed, setCoverFailed] = useState(false)
  return (
    <>
      {cover && !coverFailed ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={cover || "/placeholder.svg"}
          alt={t.reader.leadImage(title)}
          referrerPolicy="no-referrer"
          onError={() => setCoverFailed(true)}
          className="mt-10 aspect-[16/9] w-full rounded-[var(--pk-r)] object-cover"
        />
      ) : null}

      <p className="mt-8 font-serif text-[1.35rem] leading-[1.6] text-foreground/90 [word-break:break-word]">
        {excerpt}
      </p>

      <div className="mt-8 flex flex-col items-start gap-3 border-t border-[var(--kn-edge)] pt-6">
        <p className="text-sm text-muted-foreground">
          {t.reader.partialSummary}
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <ExternalLink className="size-4" /> {t.reader.openOriginal}
        </a>
      </div>
    </>
  )
}

function VideoBlock({ doc }: { doc: KnowledgeDocument }) {
  const embed = videoEmbed(doc.url)
  const [coverFailed, setCoverFailed] = useState(false)
  return (
    <div className="mt-8">
      {embed ? (
        <div className="aspect-video w-full overflow-hidden rounded-2xl border border-[var(--kn-edge)] bg-black">
          <iframe
            src={embed}
            title={doc.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      ) : (
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-well)]"
        >
          {doc.cover && !coverFailed ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={doc.cover || "/placeholder.svg"}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setCoverFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          <span className="relative flex size-16 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg transition-transform group-hover:scale-105">
            <Play className="size-6 translate-x-0.5 fill-current" />
          </span>
        </a>
      )}

      {doc.excerpt ? <p className="mt-6 text-[1.05rem] leading-relaxed text-foreground/80">{doc.excerpt}</p> : null}

      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        <Play className="size-4 fill-current" /> Watch on {doc.source}
      </a>
    </div>
  )
}

function PdfBlock({ doc }: { doc: KnowledgeDocument }) {
  const t = useT()
  return (
    <div className="mt-8 flex flex-col items-center gap-5 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] px-6 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--kn-ai)]/10 text-[var(--kn-ai)]">
        <FileType2 className="size-7" />
      </span>
      <div>
        <p className="font-serif text-xl font-medium text-foreground">{t.reader.isPdf}</p>
        <p className="mx-auto mt-1.5 max-w-sm text-pretty text-sm text-muted-foreground">
          {t.reader.pdfOpensBest}
        </p>
      </div>
      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        <ExternalLink className="size-4" /> Open PDF
      </a>
    </div>
  )
}

function ProcessingBlock() {
  const t = useT()
  return (
    <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] py-16 text-center">
      <Loader2 className="size-6 animate-spin text-[var(--kn-ai)]" />
      <p className="text-sm text-foreground">{t.reader.stillFetching}</p>
      <p className="text-xs text-muted-foreground">{t.reader.stillFetchingHint}</p>
    </div>
  )
}

function FailedBlock({ url, error }: { url: string; error?: string }) {
  const t = useT()
  return (
    <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--kn-edge)] bg-[var(--kn-paper)] py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-5" />
      </span>
      <p className="text-sm font-medium text-foreground">{t.reader.extractFailed}</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {error ? error : t.reader.extractFailedHint}
      </p>
      <OpenOriginalPill url={url} />
    </div>
  )
}

function UnextractedBlock({ url }: { url: string }) {
  const t = useT()
  return (
    <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <FileText className="size-5" />
      </span>
      <p className="text-sm font-medium text-foreground">{t.reader.noReadableText}</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {t.reader.noArticleText}
      </p>
      <OpenOriginalPill url={url} />
    </div>
  )
}

function OpenOriginalPill({ url }: { url: string }) {
  const t = useT()
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--kn-edge)] bg-card px-4 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-foreground/25"
    >
      <ExternalLink className="size-3.5" /> {t.reader.openOriginal}
    </a>
  )
}

/* ── Small shared UI ────────────────────────────────────────────── */

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="pk-label">{label}</dt>
      <dd className="mt-1.5 text-[14px] text-[var(--pk-ink)]">{value}</dd>
    </div>
  )
}

function IconButton({
  children,
  label,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)]",
        disabled
          ? "cursor-not-allowed text-muted-foreground/40"
          : active
            ? "text-foreground"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
