"use client"

import { AlertCircle, Clock, Loader2 } from "lucide-react"
import { CONTENT_TYPE_LABEL, type SavedItemView } from "@/lib/pocket2/domain/types"
import { ItemThumbnail } from "./item-thumbnail"

/* The card shown straight after saving.
 *
 * Its whole job is to be HONEST about what is known so far. A
 * just-saved item has a URL and nothing else, and this says so
 * ("Fetching details…") rather than showing a skeleton that implies
 * data is arriving when ingestion may in fact have failed. */
export function SavedPreview({ item }: { item: SavedItemView }) {
  const pending = item.ingestStatus === "pending" || item.ingestStatus === "processing"
  const failed = item.ingestStatus === "failed"
  const minutes = item.readingTimeSeconds ? Math.max(1, Math.round(item.readingTimeSeconds / 60)) : null

  return (
    <div
      className="flex gap-3 p-3"
      style={{ background: "var(--p2-surface)", border: "1px solid var(--p2-line)", borderRadius: "var(--p2-r-lg)" }}
    >
      <ItemThumbnail src={item.imageUrl} className="h-16 w-24 shrink-0" />

      <div className="min-w-0 flex-1">
        <p className="truncate" style={{ fontSize: "0.875rem", fontWeight: 540, color: "var(--p2-ink-strong)", letterSpacing: "-0.009em" }}>
          {item.title ?? item.canonicalUrl}
        </p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 p2-small" style={{ color: "var(--p2-muted)" }}>{item.description}</p>
        )}
        <p className="p2-meta mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="truncate">{item.domain}</span>
          {item.ingestStatus === "ready" && (
            <>
              <span aria-hidden="true">·</span>
              <span>{CONTENT_TYPE_LABEL[item.contentType]}</span>
            </>
          )}
          {minutes !== null && (
            <>
              <span aria-hidden="true">·</span>
              <Clock size={10} aria-hidden="true" />{minutes} min
            </>
          )}
          {pending && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1" style={{ color: "var(--p2-warn)" }}>
                <Loader2 size={10} className="animate-spin" aria-hidden="true" /> Fetching details…
              </span>
            </>
          )}
          {failed && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1" style={{ color: "var(--p2-muted)" }}>
                <AlertCircle size={10} aria-hidden="true" /> Saved, without a preview
              </span>
            </>
          )}
        </p>
        {failed && item.ingestError && (
          // The real reason, in the words the pipeline recorded — not a
          // generic "something went wrong".
          <p className="p2-meta mt-1">{item.ingestError}</p>
        )}
      </div>
    </div>
  )
}
