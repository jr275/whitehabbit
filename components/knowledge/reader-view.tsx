"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowLeft,
  Heart,
  Highlighter,
  Sparkles,
  Share2,
  Archive,
  Clock,
} from "lucide-react"
import type { KnowledgeItem } from "@/lib/knowledge/types"
import { KIND_META, durationLabel } from "@/lib/knowledge/config"
import { cn } from "@/lib/utils"

/** Representative article body — the real reader renders parsed content. */
const PARAGRAPHS = [
  "We call someone who is not in control of their mind insane. What do we call someone who is not in control of their attention, which is the gateway to the mind?",
  "The tools we use to save what we read are quietly shaping how we think. A link tossed into a folder is forgotten by morning. A piece we sit with, mark up, and return to becomes part of how we reason.",
  "Your job as a note-taker is to preserve the ideas you discover in such a way that they can survive the journey into the future. That way your excitement and enthusiasm for your knowledge builds over time instead of fading away.",
  "The third category of information we want to keep is resources — a catchall for anything that doesn't belong to a project or an area, and could include any topic you're interested in gathering information about.",
  "Over time, a library like this stops being a pile of saved links and starts behaving like a second mind: one that remembers what you found interesting, notices the threads between ideas, and hands them back when they matter.",
]

const HIGHLIGHTS = [
  "We call someone who is not in control of their mind insane. What do we call someone who is not in control of their attention, which is the gateway to the mind?",
  "Your job as a note-taker is to preserve the ideas you discover in such a way that they can survive the journey into the future.",
  "Resources: things I want to reference in the future — a catchall for anything that doesn't belong to a project or an area.",
]

export function ReaderView({ item }: { item: KnowledgeItem }) {
  const [favorite, setFavorite] = useState(item.favorite)
  const [tab, setTab] = useState<"notebook" | "info">("notebook")
  const Kind = KIND_META[item.kind].icon

  return (
    <div className="grid min-h-[calc(100dvh-0px)] lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Reading column */}
      <div className="relative">
        {/* toolbar */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--kn-edge)] bg-background/80 px-4 py-3 backdrop-blur sm:px-8">
          <Link
            href="/knowledge/library"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Library
          </Link>
          <div className="flex items-center gap-1">
            <IconButton label="Highlight">
              <Highlighter className="h-4 w-4" />
            </IconButton>
            <IconButton
              label={favorite ? "Remove favorite" : "Add favorite"}
              active={favorite}
              onClick={() => setFavorite((f) => !f)}
            >
              <Heart className={cn("h-4 w-4", favorite && "fill-[var(--warn)] text-[var(--warn)]")} />
            </IconButton>
            <IconButton label="Share">
              <Share2 className="h-4 w-4" />
            </IconButton>
            <IconButton label="Archive">
              <Archive className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        <article className="mx-auto max-w-2xl px-4 py-10 sm:px-8 sm:py-14">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <Kind className="h-3.5 w-3.5" />
            {item.source}
            {item.durationMin ? (
              <>
                <span aria-hidden>·</span>
                <Clock className="h-3 w-3" />
                {durationLabel(item.kind, item.durationMin)}
              </>
            ) : null}
          </div>

          <h1 className="mt-4 text-balance font-serif text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">
            {item.title}
          </h1>
          {item.author ? (
            <p className="mt-4 text-sm text-muted-foreground">By {item.author}</p>
          ) : null}

          {item.cover ? (
            <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-2xl">
              <Image
                src={item.cover || "/placeholder.svg"}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 672px"
                className="object-cover"
                priority
              />
            </div>
          ) : null}

          {/* AI summary callout */}
          {item.aiSummary ? (
            <aside className="mt-8 rounded-2xl border border-[var(--kn-ai)]/25 bg-gradient-to-br from-[var(--kn-ai)]/[0.07] to-transparent p-5">
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--kn-ai)]">
                <Sparkles className="h-3.5 w-3.5" /> Summary
              </span>
              <p className="mt-2 text-pretty leading-relaxed text-foreground/85">{item.aiSummary}</p>
            </aside>
          ) : null}

          <div className="mt-8 space-y-6 text-lg leading-relaxed text-foreground/85">
            {PARAGRAPHS.map((p, i) => (
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
        </article>
      </div>

      {/* Notebook panel */}
      <aside className="hidden border-l border-[var(--kn-edge)] bg-[var(--kn-paper)] lg:block">
        <div className="sticky top-0 flex h-[57px] items-center gap-4 border-b border-[var(--kn-edge)] px-6">
          <button
            type="button"
            onClick={() => setTab("notebook")}
            className={cn(
              "relative py-4 text-sm transition-colors",
              tab === "notebook" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Notebook
            <span className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">
              {HIGHLIGHTS.length}
            </span>
            {tab === "notebook" ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setTab("info")}
            className={cn(
              "relative py-4 text-sm transition-colors",
              tab === "info" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Info
            {tab === "info" ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground" />
            ) : null}
          </button>
        </div>

        <div className="p-6">
          {tab === "notebook" ? (
            <div className="space-y-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Highlights
              </p>
              {HIGHLIGHTS.map((h, i) => (
                <blockquote
                  key={i}
                  className="border-l-2 border-[var(--warn)]/60 pl-3 text-sm leading-relaxed text-foreground/80"
                >
                  {h}
                </blockquote>
              ))}
            </div>
          ) : (
            <dl className="space-y-4 text-sm">
              <Meta label="Source" value={item.source} />
              {item.author ? <Meta label="Author" value={item.author} /> : null}
              {item.domain ? <Meta label="Origin" value={item.domain} /> : null}
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Topics
                </dt>
                <dd className="mt-2 flex flex-wrap gap-1.5">
                  {item.topics.map((t) => (
                    <span key={t} className="rounded-md bg-secondary/60 px-2 py-1 text-xs text-foreground/80">
                      {t}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </aside>
    </div>
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
        active ? "text-foreground" : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
