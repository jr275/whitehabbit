"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Heart,
  ExternalLink,
  Loader2,
  AlertCircle,
  Archive,
  Clock,
  FileText,
} from "lucide-react"
import type { KnowledgeDocument } from "@/lib/knowledge/types"
import { KIND_META, durationLabel } from "@/lib/knowledge/config"
import { patchItem } from "@/lib/knowledge/client"
import { cn } from "@/lib/utils"

/** Split the extracted plain text into readable paragraphs. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

export function ReaderView({ doc }: { doc: KnowledgeDocument }) {
  const [favorite, setFavorite] = useState(doc.favorite)
  const [tab, setTab] = useState<"notebook" | "info">("info")
  const Kind = KIND_META[doc.kind].icon

  const processing = doc.state === "saved" || doc.state === "fetching" || doc.state === "extracting"
  const failed = doc.state === "failed"
  const body = doc.contentText ? paragraphs(doc.contentText) : []

  async function toggleFavorite() {
    const next = !favorite
    setFavorite(next)
    try {
      await patchItem(doc.id, { favorite: next })
    } catch {
      setFavorite(!next)
    }
  }

  return (
    <div className="grid min-h-[calc(100dvh-0px)] lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Reading column */}
      <div className="relative">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--kn-edge)] bg-background/80 px-4 py-3 backdrop-blur sm:px-8">
          <Link
            href="/knowledge/library"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Library
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
              aria-label="Open original"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        <article className="mx-auto max-w-2xl px-4 py-10 sm:px-8 sm:py-14">
          <div className="flex items-center gap-2 text-[13px] font-medium text-primary">
            <Kind className="h-3.5 w-3.5" />
            {doc.source}
            {doc.durationMin ? (
              <span className="flex items-center gap-1.5 font-normal text-muted-foreground">
                <span aria-hidden>·</span>
                <Clock className="h-3 w-3" />
                {durationLabel(doc.kind, doc.durationMin)}
              </span>
            ) : null}
          </div>

          <h1 className="mt-4 text-balance font-serif text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">
            {doc.title}
          </h1>
          {doc.author ? <p className="mt-4 text-sm text-muted-foreground">By {doc.author}</p> : null}

          {doc.cover ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={doc.cover || "/placeholder.svg"}
              alt=""
              crossOrigin="anonymous"
              className="mt-8 aspect-[16/9] w-full rounded-2xl object-cover"
            />
          ) : null}

          {/* Body — real extracted content, or an honest state */}
          {processing ? (
            <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] py-16 text-center">
              <Loader2 className="size-6 animate-spin text-[var(--kn-ai)]" />
              <p className="text-sm text-foreground">We&apos;re still fetching and extracting this.</p>
              <p className="text-xs text-muted-foreground">This page will have the full text once it&apos;s ready.</p>
            </div>
          ) : failed ? (
            <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 py-16 text-center">
              <AlertCircle className="size-6 text-destructive" />
              <p className="text-sm text-foreground">We couldn&apos;t extract this one.</p>
              {doc.error ? <p className="max-w-sm text-xs text-muted-foreground">{doc.error}</p> : null}
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center gap-1.5 text-xs text-[var(--kn-ai)] hover:underline"
              >
                <ExternalLink className="size-3" /> Read it at the source
              </a>
            </div>
          ) : body.length > 0 ? (
            <div className="mt-8 space-y-6 text-lg leading-relaxed text-foreground/85">
              {body.map((p, i) => (
                <p
                  key={i}
                  className={cn(
                    i === 0 &&
                      "first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:font-serif first-letter:text-6xl first-letter:leading-[0.8] first-letter:text-foreground",
                  )}
                >
                  {p}
                </p>
              ))}
            </div>
          ) : (
            <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] py-16 text-center">
              <FileText className="size-6 text-muted-foreground" />
              <p className="text-sm text-foreground">No readable text was extracted from this page.</p>
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[var(--kn-ai)] hover:underline"
              >
                <ExternalLink className="size-3" /> Open the original
              </a>
            </div>
          )}
        </article>
      </div>

      {/* Notebook / Info panel */}
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
            <dl className="space-y-4 text-sm">
              <Meta label="Source" value={doc.source} />
              {doc.author ? <Meta label="Author" value={doc.author} /> : null}
              {doc.domain ? <Meta label="Origin" value={doc.domain} /> : null}
              {doc.wordCount ? <Meta label="Words" value={doc.wordCount.toLocaleString()} /> : null}
              {doc.publishedAt ? (
                <Meta label="Published" value={new Date(doc.publishedAt).toLocaleDateString()} />
              ) : null}
              {doc.topics.length > 0 ? (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Topics</dt>
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
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Highlights</p>
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
      <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</dt>
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
