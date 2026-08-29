"use client"

import { AlertCircle, Clock, ExternalLink, Loader2, RotateCw, Star } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { CONTENT_TYPE_LABEL, type SavedItemView } from "@/lib/pocket2/domain/types"
import { ItemThumbnail } from "./item-thumbnail"

/* ================================================================== *
 * ITEM ROW — Phase 2's honest list.
 *
 * The full card system (grid / list / compact, hover actions, overflow
 * menu) is Phase 3. This renders what genuinely exists after Phase 2:
 * a saved item, its real ingestion state, and the two actions that
 * state makes available. It is deliberately not a mock of the card
 * that is coming.
 * ================================================================== */

function relativeDay(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function ItemRow({ item }: { item: SavedItemView }) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)

  const pending = item.ingestStatus === "pending" || item.ingestStatus === "processing"
  const failed = item.ingestStatus === "failed"
  const minutes = item.readingTimeSeconds ? Math.max(1, Math.round(item.readingTimeSeconds / 60)) : null

  async function retry() {
    setRetrying(true)
    try {
      await fetch(`/api/pocket2/items/${item.id}/reingest`, { method: "POST" })
      // Give the queue a moment to pick the job up before re-reading.
      setTimeout(() => { router.refresh(); setRetrying(false) }, 1500)
    } catch {
      setRetrying(false)
    }
  }

  return (
    <li
      className="group flex items-start gap-3 py-3.5"
      style={{ borderTop: "1px solid var(--p2-line)" }}
    >
      <ItemThumbnail src={item.imageUrl} className="hidden h-14 w-20 shrink-0 sm:block" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1" style={{ fontSize: "0.9375rem", fontWeight: 535, lineHeight: 1.4, letterSpacing: "-0.009em", color: "var(--p2-ink-strong)" }}>
            {item.title ?? item.canonicalUrl}
          </h3>
          {item.state?.isFavorite && (
            <Star size={13} aria-label="Favorite" style={{ color: "var(--p2-warn)", fill: "var(--p2-warn)" }} className="mt-1 shrink-0" />
          )}
        </div>

        {item.description && (
          <p className="mt-1 line-clamp-2 p2-small" style={{ color: "var(--p2-muted)" }}>{item.description}</p>
        )}

        <p className="p2-meta mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="truncate">{item.domain}</span>
          {item.author && <><span aria-hidden="true">·</span><span className="truncate">{item.author}</span></>}
          {item.ingestStatus === "ready" && item.contentType !== "unknown" && (
            <><span aria-hidden="true">·</span><span>{CONTENT_TYPE_LABEL[item.contentType]}</span></>
          )}
          {minutes !== null && (
            <><span aria-hidden="true">·</span><Clock size={10} aria-hidden="true" />{minutes} min</>
          )}
          <span aria-hidden="true">·</span>
          <span>{relativeDay(item.savedAt)}</span>
        </p>

        {/* Ingestion state is stated plainly, never dressed up as a
          * loading skeleton that implies data is on its way when the
          * fetch has in fact already failed. */}
        {pending && (
          <p className="p2-meta mt-1.5 inline-flex items-center gap-1.5" style={{ color: "var(--p2-warn)" }}>
            <Loader2 size={11} className="animate-spin" aria-hidden="true" /> Fetching details…
          </p>
        )}
        {failed && (
          <p className="p2-meta mt-1.5 inline-flex items-start gap-1.5">
            <AlertCircle size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{item.ingestError ?? "Saved, but the preview couldn't be fetched."}</span>
          </p>
        )}

        {item.tags.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <li key={tag.id}
                  className="rounded-full px-2 py-0.5"
                  style={{ background: "var(--p2-surface-sunk)", color: "var(--p2-muted)", fontSize: "0.6875rem", fontWeight: 500 }}>
                #{tag.slug}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {failed && (
          <button type="button" onClick={() => void retry()} disabled={retrying} className="p2-btn p2-btn-ghost p2-btn-sm" title="Try fetching the details again">
            {retrying ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <RotateCw size={13} aria-hidden="true" />}
            <span className="hidden sm:inline">Retry</span>
          </button>
        )}
        {/* Always available, whatever ingestion did. The original
          * source stays one click away by design. */}
        <a
          href={item.url} target="_blank" rel="noopener noreferrer nofollow"
          className="p2-btn p2-btn-ghost p2-btn-sm" title="Open the original page"
        >
          <ExternalLink size={13} aria-hidden="true" />
          <span className="hidden sm:inline">Open</span>
        </a>
      </div>
    </li>
  )
}
