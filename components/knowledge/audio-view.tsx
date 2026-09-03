"use client"

/* ================================================================== *
 * LISTEN — the saved library, read aloud.
 *
 * This adds NO speech implementation. lib/knowledge/read-aloud.ts owns
 * the whole state machine (queue, pause/resume, next/previous, the
 * browser quirks) and use-read-aloud.ts wraps it for React; both were
 * already written against `(id, paragraphs)` rather than against the
 * Reader, so the surface reuses them unchanged. A second
 * speechSynthesis controller is exactly what this file exists not to
 * be — two of them would fight over one global speech queue.
 *
 * The player lives here, at the page level, rather than in each row:
 * one controller, one thing playing, and moving between items tears
 * down the previous utterance because the hook keys on the item id.
 * Playback does not survive navigating away from /knowledge/audio —
 * a persistent cross-page player would have to hoist this state into
 * the shell and is a larger change than this surface needs.
 * ================================================================== */

import { AlertCircle, ChevronLeft, ChevronRight, Headphones, Loader2, LogIn, Pause, Play, Square } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { AuthRequiredError } from "@/lib/knowledge/auth-state"
import { fetchDocument, fetchLibrary, KnowledgeApiError } from "@/lib/knowledge/client"
import { durationLabel } from "@/lib/knowledge/config"
import { toParagraphs } from "@/lib/knowledge/paragraphs"
import type { KnowledgeDocument, KnowledgeItem } from "@/lib/knowledge/types"
import { useReadAloud } from "@/lib/knowledge/use-read-aloud"
import { cn } from "@/lib/utils"
import { useKnowledgeAuth } from "./knowledge-auth"

type Status = "loading" | "ready" | "error" | "auth"

export function AudioView() {
  const auth = useKnowledgeAuth()
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [status, setStatus] = useState<Status>("loading")
  const [error, setError] = useState<string | null>(null)

  // The item currently loaded into the player, with its full text. Only
  // one is ever fetched: the body is the heavy field, and the list
  // endpoint deliberately does not carry it.
  const [current, setCurrent] = useState<KnowledgeDocument | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetchLibrary({ limit: 50 })
        if (cancelled) return
        setItems(res.items)
        setStatus("ready")
      } catch (err) {
        if (cancelled) return
        if (err instanceof AuthRequiredError || (err instanceof KnowledgeApiError && err.status === 401)) {
          setStatus("auth")
          return
        }
        setError(err instanceof Error ? err.message : "Couldn't load your library.")
        setStatus("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function load(item: KnowledgeItem) {
    if (loadingId) return
    setLoadingId(item.id)
    try {
      const doc = await fetchDocument(item.id)
      setCurrent(doc)
    } catch (err) {
      if (err instanceof AuthRequiredError || (err instanceof KnowledgeApiError && err.status === 401)) {
        setStatus("auth")
      } else {
        setError(err instanceof Error ? err.message : "Couldn't open that piece.")
      }
    } finally {
      setLoadingId(null)
    }
  }

  const playable = items.filter((item) => item.state !== "fetching")
  const index = current ? playable.findIndex((i) => i.id === current.id) : -1

  if (auth.state !== "authenticated" && status === "auth") {
    return <SignedOutState state={auth.state} onSignIn={auth.promptSignIn} />
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 pb-40 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Headphones className="size-4" />
          Audio
        </div>
        <h1 className="text-balance font-serif text-4xl font-medium leading-[1.05] tracking-tight text-foreground sm:text-[2.75rem]">
          Listen to your saves.
        </h1>
        <p className="text-pretty text-[15px] leading-relaxed text-muted-foreground">
          Your browser reads the extracted text aloud. Nothing is uploaded.
        </p>
      </header>

      {status === "loading" && (
        <div className="mt-10 flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin text-primary" />
          Loading your library…
        </div>
      )}

      {status === "error" && (
        <div className="mt-10 flex items-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-5 py-4 text-sm text-foreground">
          <AlertCircle className="size-4 text-destructive" />
          {error}
        </div>
      )}

      {status === "ready" && playable.length === 0 && (
        <div className="mt-10 rounded-3xl border border-dashed border-[var(--kn-edge)] bg-card px-6 py-16 text-center shadow-sm">
          <p className="font-serif text-xl font-medium text-foreground">Nothing to listen to yet.</p>
          <p className="mx-auto mt-1.5 max-w-xs text-pretty text-sm text-muted-foreground">
            Save an article and it will appear here once its text has been extracted.
          </p>
        </div>
      )}

      {status === "ready" && playable.length > 0 && (
        <ul className="mt-8 flex flex-col gap-2">
          {playable.map((item) => (
            <Row
              key={item.id}
              item={item}
              active={current?.id === item.id}
              loading={loadingId === item.id}
              onPlay={() => void load(item)}
            />
          ))}
        </ul>
      )}

      {current && (
        <Player
          doc={current}
          hasPrevious={index > 0}
          hasNext={index >= 0 && index < playable.length - 1}
          onPrevious={() => index > 0 && void load(playable[index - 1])}
          onNext={() => index >= 0 && index < playable.length - 1 && void load(playable[index + 1])}
          onClose={() => setCurrent(null)}
        />
      )}
    </div>
  )
}

function Row({
  item,
  active,
  loading,
  onPlay,
}: {
  item: KnowledgeItem
  active: boolean
  loading: boolean
  onPlay: () => void
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-4 rounded-2xl border bg-card px-4 py-3.5 shadow-sm transition-colors",
        active ? "border-primary/50" : "border-[var(--kn-edge)] hover:border-foreground/20",
      )}
    >
      <button
        onClick={onPlay}
        disabled={loading}
        aria-label={`Listen to ${item.title}`}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4 translate-x-px fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-foreground">{item.title}</p>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
          {[item.source, durationLabel(item.kind, item.durationMin)].filter(Boolean).join(" · ")}
        </p>
      </div>
      <Link
        href={`/knowledge/read/${item.id}`}
        className="shrink-0 rounded-full px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        Read
      </Link>
    </li>
  )
}

/** The player. `useReadAloud` keys on doc.id, so handing it a new
 *  document is what stops the previous one — no manual teardown here,
 *  and no second place that knows how to cancel speech. */
function Player({
  doc,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onClose,
}: {
  doc: KnowledgeDocument
  hasPrevious: boolean
  hasNext: boolean
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
}) {
  const body = doc.contentText ? toParagraphs(doc.contentText) : []
  const read = useReadAloud(doc.id, body)

  // Start on load: the user pressed Play on a row, so arriving here
  // already stopped would be a second click for no reason.
  useEffect(() => {
    if (body.length > 0) read.play()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id])

  const playing = read.state === "playing"
  const paused = read.state === "paused"

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--kn-edge)] bg-card/95 backdrop-blur-xl lg:left-64">
      <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{doc.title}</p>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {/* The honest failure: a piece whose text never extracted
                cannot be read, and saying "no text to read" beats
                narrating the title and calling it audio. */}
            {body.length === 0
              ? "No extracted text to read — open it at the source instead."
              : read.message ?? (playing ? "Playing" : paused ? "Paused" : "Ready")}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onPrevious}
            disabled={!hasPrevious}
            aria-label="Previous"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => (playing ? read.pause() : paused ? read.resume() : read.play())}
            disabled={body.length === 0 || read.state === "unsupported"}
            aria-label={playing ? "Pause" : "Play"}
            className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 translate-x-px fill-current" />}
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            aria-label="Next"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            onClick={() => {
              read.stop()
              onClose()
            }}
            aria-label="Stop"
            className="ml-1 flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        </div>
      </div>
    </div>
  )
}

function SignedOutState({ state, onSignIn }: { state: string; onSignIn: () => void }) {
  const expired = state === "auth_required"
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-dashed border-[var(--kn-edge)] bg-card px-6 py-14 text-center shadow-sm">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Headphones className="size-6" />
        </span>
        <p className="mt-4 font-serif text-xl font-medium text-foreground">
          {expired ? "Your session ended." : "Sign in to listen."}
        </p>
        <p className="mx-auto mt-2 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
          {expired
            ? "Sign in again to reach the library on your account."
            : "Listening reads the saved text on your account."}
        </p>
        <button
          onClick={onSignIn}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <LogIn className="size-4" />
          {expired ? "Sign in again" : "Sign in"}
        </button>
      </div>
    </div>
  )
}
