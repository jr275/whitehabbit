"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowLeft,
  Clock,
  ExternalLink,
  FileText,
  FileType2,
  Heart,
  Loader2,
  Play,
} from "lucide-react"
import type { KnowledgeDocument } from "@/lib/knowledge/types"
import { KIND_META, durationLabel, savedAgo } from "@/lib/knowledge/config"
import { patchItem } from "@/lib/knowledge/client"
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
  const [favorite, setFavorite] = useState(doc.favorite)
  const [tab, setTab] = useState<"notebook" | "info">("info")
  const [progress, setProgress] = useState(0)

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
    <div className="grid min-h-[calc(100dvh-57px)] lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Reading column */}
      <div className="relative min-w-0">
        {/* sticky reader header */}
        <div className="sticky top-0 z-10 border-b border-[var(--kn-edge)] bg-background/85 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3 sm:px-8">
            <Link
              href="/knowledge/library"
              className="-ml-1 flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Library
            </Link>
            <div className="flex items-center gap-1">
              <IconButton
                label={favorite ? "Remove favorite" : "Add favorite"}
                active={favorite}
                onClick={toggleFavorite}
              >
                <Heart className={cn("h-4 w-4", favorite && "fill-[var(--kn-ai)] text-[var(--kn-ai)]")} />
              </IconButton>
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open original in a new tab"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
          {/* reading progress — a hair-thin fill along the header's base */}
          {showProgress && (
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[var(--kn-ai)] transition-[width] duration-150 ease-out"
              style={{ width: `${progress * 100}%` }}
            />
          )}
        </div>

        <article
          className={cn(
            "mx-auto px-4 py-9 sm:px-8 sm:py-12",
            surface === "video" || surface === "pdf" ? "max-w-3xl" : "max-w-2xl",
          )}
        >
          {/* ── Unified header block: source · title · meta ─────── */}
          <SourceLine doc={doc} />

          <h1 className="mt-4 text-balance font-serif text-[2rem] font-medium leading-[1.12] tracking-tight text-foreground sm:text-[2.75rem]">
            {doc.title}
          </h1>

          {doc.author ? <p className="mt-3 text-sm text-muted-foreground">By {doc.author}</p> : null}

          <MetaRow doc={doc} />

          {/* ── Body, routed by real state then kind ────────────── */}
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
              <ArticleBody body={body} cover={doc.cover} title={doc.title} />
            ) : (
              <ExcerptLede excerpt={doc.excerpt!} cover={doc.cover} title={doc.title} url={doc.url} />
            )
          ) : (
            <UnextractedBlock url={doc.url} />
          )}

          {/* Mobile-only details — the Info aside is desktop-only, so on
              small screens surface the same source metadata + topics here
              rather than leaving them unreachable. */}
          <div className="mt-12 border-t border-[var(--kn-edge)] pt-8 lg:hidden">
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-6 flex items-center justify-center gap-2 rounded-full border border-[var(--kn-edge)] bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-foreground/25"
            >
              <ExternalLink className="size-4" /> Open original
            </a>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <Meta label="Source" value={doc.source} />
              {doc.author ? <Meta label="Author" value={doc.author} /> : null}
              {doc.domain ? <Meta label="Origin" value={doc.domain} /> : null}
              <Meta label="Type" value={KIND_META[doc.kind].label} />
              {doc.wordCount ? <Meta label="Words" value={doc.wordCount.toLocaleString()} /> : null}
              <Meta label="Saved" value={savedAgo(doc.savedAt)} />
            </dl>
            {doc.topics.length > 0 ? (
              <div className="mt-4">
                <dt className="text-[12px] font-medium text-muted-foreground">Topics</dt>
                <dd className="mt-2 flex flex-wrap gap-1.5">
                  {doc.topics.map((t) => (
                    <span key={t} className="rounded-md bg-secondary/60 px-2 py-1 text-xs text-foreground/80">
                      {t}
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
          </div>
        </article>
      </div>

      {/* Info panel */}
      <aside className="hidden border-l border-[var(--kn-edge)] bg-[var(--kn-paper)] lg:block">
        <div className="sticky top-0 flex h-[57px] items-center gap-4 border-b border-[var(--kn-edge)] px-6">
          <TabButton active={tab === "info"} onClick={() => setTab("info")}>
            Info
          </TabButton>
          <TabButton active={tab === "notebook"} onClick={() => setTab("notebook")}>
            Notebook
          </TabButton>
        </div>

        <div className="p-6">
          {tab === "info" ? (
            <>
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-6 flex items-center justify-center gap-2 rounded-full border border-[var(--kn-edge)] bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-foreground/25"
              >
                <ExternalLink className="size-4" /> Open original
              </a>
              <dl className="space-y-4 text-sm">
                <Meta label="Source" value={doc.source} />
                {doc.author ? <Meta label="Author" value={doc.author} /> : null}
                {doc.domain ? <Meta label="Origin" value={doc.domain} /> : null}
                <Meta label="Type" value={KIND_META[doc.kind].label} />
                {doc.wordCount ? <Meta label="Words" value={doc.wordCount.toLocaleString()} /> : null}
                <Meta label="Saved" value={savedAgo(doc.savedAt)} />
                {doc.publishedAt ? (
                  <Meta label="Published" value={new Date(doc.publishedAt).toLocaleDateString()} />
                ) : null}
                {doc.topics.length > 0 ? (
                  <div>
                    <dt className="text-[12px] font-medium text-muted-foreground">Topics</dt>
                    <dd className="mt-2 flex flex-wrap gap-1.5">
                      {doc.topics.map((t) => (
                        <span key={t} className="rounded-md bg-secondary/60 px-2 py-1 text-xs text-foreground/80">
                          {t}
                        </span>
                      ))}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-[12px] font-medium text-muted-foreground">Highlights</p>
              <p className="max-w-[220px] text-sm leading-relaxed text-muted-foreground">
                Highlighting isn&apos;t available yet. When it ships, the passages you mark will collect here.
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

/* ── Header pieces ──────────────────────────────────────────────── */

function SourceLine({ doc }: { doc: KnowledgeDocument }) {
  const [iconFailed, setIconFailed] = useState(false)
  const Kind = KIND_META[doc.kind].icon
  return (
    <div className="flex items-center gap-2 text-[13px] font-medium text-primary">
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
        <Kind className="size-4 shrink-0" />
      )}
      <span className="truncate">{doc.domain ?? doc.source}</span>
    </div>
  )
}

function MetaRow({ doc }: { doc: KnowledgeDocument }) {
  const duration = durationLabel(doc.kind, doc.durationMin)
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-y border-[var(--kn-edge)] py-3 text-[13px] text-muted-foreground">
      <span className="font-medium text-foreground/70">{KIND_META[doc.kind].label}</span>
      {duration ? (
        <>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5" /> {duration}
          </span>
        </>
      ) : null}
      <span aria-hidden className="text-muted-foreground/40">·</span>
      <span>{savedAgo(doc.savedAt)}</span>
    </div>
  )
}

/* ── Body surfaces ──────────────────────────────────────────────── */

function ArticleBody({ body, cover, title }: { body: string[]; cover?: string; title: string }) {
  const [coverFailed, setCoverFailed] = useState(false)
  return (
    <>
      {cover && !coverFailed ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={cover || "/placeholder.svg"}
          alt={`Lead image for ${title}`}
          crossOrigin="anonymous"
          onError={() => setCoverFailed(true)}
          className="mt-8 aspect-[16/9] w-full rounded-2xl object-cover"
        />
      ) : null}

      <div className="mt-8 space-y-6 text-[1.15rem] leading-[1.75] text-foreground/85 [word-break:break-word] selection:bg-[var(--kn-ai)]/25">
        {body.map((p, i) => (
          <p
            key={i}
            className={cn(
              i === 0 &&
                "first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:text-6xl first-letter:font-semibold first-letter:leading-[0.8] first-letter:text-[var(--kn-ai)]",
            )}
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
  const [coverFailed, setCoverFailed] = useState(false)
  return (
    <>
      {cover && !coverFailed ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={cover || "/placeholder.svg"}
          alt={`Lead image for ${title}`}
          crossOrigin="anonymous"
          onError={() => setCoverFailed(true)}
          className="mt-8 aspect-[16/9] w-full rounded-2xl object-cover"
        />
      ) : null}

      <p className="mt-8 font-serif text-[1.35rem] leading-[1.6] text-foreground/90 [word-break:break-word]">
        {excerpt}
      </p>

      <div className="mt-8 flex flex-col items-start gap-3 border-t border-[var(--kn-edge)] pt-6">
        <p className="text-sm text-muted-foreground">
          This is the summary we could pull from the source. Open the original to read the full piece.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <ExternalLink className="size-4" /> Open original
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
              crossOrigin="anonymous"
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
  return (
    <div className="mt-8 flex flex-col items-center gap-5 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] px-6 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--kn-ai)]/10 text-[var(--kn-ai)]">
        <FileType2 className="size-7" />
      </span>
      <div>
        <p className="font-serif text-xl font-medium text-foreground">This is a PDF document.</p>
        <p className="mx-auto mt-1.5 max-w-sm text-pretty text-sm text-muted-foreground">
          PDFs open best in their own viewer. Open it in a new tab to read, search and download.
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
  return (
    <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] py-16 text-center">
      <Loader2 className="size-6 animate-spin text-[var(--kn-ai)]" />
      <p className="text-sm text-foreground">We&apos;re still fetching and extracting this.</p>
      <p className="text-xs text-muted-foreground">This page will fill in with the full text once it&apos;s ready.</p>
    </div>
  )
}

function FailedBlock({ url, error }: { url: string; error?: string }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--kn-edge)] bg-[var(--kn-paper)] py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-5" />
      </span>
      <p className="text-sm font-medium text-foreground">We couldn&apos;t extract this page.</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {error ? error : "The source may block automated reading. You can still open it at the source."}
      </p>
      <OpenOriginalPill url={url} />
    </div>
  )
}

function UnextractedBlock({ url }: { url: string }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <FileText className="size-5" />
      </span>
      <p className="text-sm font-medium text-foreground">There&apos;s no readable text for this one.</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        We saved the link, but this page didn&apos;t expose article text we could pull in.
      </p>
      <OpenOriginalPill url={url} />
    </div>
  )
}

function OpenOriginalPill({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--kn-edge)] bg-card px-4 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-foreground/25"
    >
      <ExternalLink className="size-3.5" /> Open original
    </a>
  )
}

/* ── Small shared UI ────────────────────────────────────────────── */

function TabButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative py-4 text-sm transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {active ? <span className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground" /> : null}
    </button>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground/85">{value}</dd>
    </div>
  )
}

function IconButton({
  children,
  label,
  active,
  onClick,
}: {
  children: React.ReactNode
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
