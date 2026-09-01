"use client"

/* ================================================================== *
 * ITEM CARD
 *
 * Four visually distinct states, because this is where read-later
 * products quietly lie to their users:
 *
 *   processing  skeleton, but the REAL domain is already shown
 *   completed   the article
 *   failed      the real reason in plain language, plus Retry and the
 *               original link — never a blank card, never a spinner
 *               that resolves to nothing
 *
 * Every optional field is genuinely optional: title, excerpt, author,
 * reading time and cover may all be null and the card must still
 * render without shifting. That is a data contract, not a preference.
 * ================================================================== */

import Link from "next/link"
import type { KnowledgeItemDto } from "@/lib/knowledge/api/contracts"

const PROCESSING: KnowledgeItemDto["status"][] = ["pending", "fetching", "extracting"]

const PROCESSING_LABEL: Record<string, string> = {
  pending: "Queued",
  fetching: "Fetching…",
  extracting: "Reading…",
}

function readingTime(seconds: number | null): string | null {
  if (!seconds) return null
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} min`
}

interface ItemCardProps {
  item: KnowledgeItemDto
  onRetry?: (id: string) => void
  retrying?: boolean
}

export function ItemCard({ item, onRetry, retrying }: ItemCardProps) {
  const isProcessing = PROCESSING.includes(item.status)
  const isFailed = item.status === "failed"

  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {/* The real domain is shown even while processing, so a
            skeleton is never contentless. */}
        <span className="font-medium">{item.domain}</span>
        {readingTime(item.readingTimeSeconds) ? <span>· {readingTime(item.readingTimeSeconds)}</span> : null}
        {item.authors.length > 0 ? <span className="truncate">· {item.authors.join(", ")}</span> : null}
      </div>

      {isProcessing ? (
        <>
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          <p className="text-xs text-muted-foreground">{PROCESSING_LABEL[item.status] ?? "Processing…"}</p>
        </>
      ) : isFailed ? (
        <>
          <h3 className="text-sm font-medium">{item.title ?? item.domain}</h3>
          <p className="text-sm text-destructive">
            {item.failureMessage ?? "We couldn't save this page."}
          </p>
          <div className="flex items-center gap-3 text-xs">
            {onRetry ? (
              <button
                type="button"
                onClick={() => onRetry(item.id)}
                disabled={retrying}
                className="rounded border border-border px-2 py-1 disabled:opacity-50"
              >
                {retrying ? "Retrying…" : "Retry"}
              </button>
            ) : null}
            <a href={item.submittedUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">
              Open original
            </a>
          </div>
        </>
      ) : (
        <>
          <h3 className="text-sm font-medium leading-snug">
            <Link href={`/knowledge/read/${item.id}`} className="hover:underline">
              {item.title ?? item.domain}
            </Link>
          </h3>
          {item.excerpt ? <p className="line-clamp-3 text-sm text-muted-foreground">{item.excerpt}</p> : null}
        </>
      )}
    </article>
  )
}
