"use client"

/* ================================================================== *
 * ITEM ROW — what replaced the card grid.
 *
 * A card is a claim that its contents are a separate object. A saved
 * library is not a set of separate objects; it is one collection with
 * many entries, and a hairline says that at a fraction of the cost.
 *
 * THE COVER. The old card reserved ~200px for a lead image and, when
 * the item had none — which is most of them — filled that space with a
 * grey block and a generic document glyph. Two thirds of every card
 * was a picture of nothing. Here an item with no image renders with no
 * image, and the row simply gets shorter. That single rule is most of
 * why these screens stopped looking like a dashboard.
 *
 * Nothing on this row is fabricated: source, author, duration, topics
 * and the excerpt each render only when the item actually carries them.
 * ================================================================== */

import Link from "next/link"
import { useState } from "react"
import { Heart } from "lucide-react"
import { KIND_META, savedAgo, durationLabel } from "@/lib/knowledge/config"
import type { KnowledgeItem } from "@/lib/knowledge/types"
import { cn } from "@/lib/utils"
import { useLocale, useT } from "./i18n"

export interface ItemRowProps {
  item: KnowledgeItem
  /** Rendered under the title instead of the excerpt — the passage that
   *  matched a search. Evidence, so it carries the evidence rule. */
  evidence?: React.ReactNode
  onToggleFavorite?: (item: KnowledgeItem) => void
  onRetry?: (item: KnowledgeItem) => void
}

export function ItemRow({ item, evidence, onToggleFavorite, onRetry }: ItemRowProps) {
  const t = useT()
  const { locale } = useLocale()
  const [coverFailed, setCoverFailed] = useState(false)
  const kind = KIND_META[item.kind]
  const kindName = t.kinds[item.kind]
  const processing = item.state !== "ready" && item.state !== "failed"
  const failed = item.state === "failed"
  const duration = durationLabel(t, item.kind, item.durationMin)
  const showCover = Boolean(item.cover) && !coverFailed && !failed

  return (
    <article className="pk-row group relative flex gap-5">
      <div className="min-w-0 flex-1">
        {/* SOURCE — mono, quiet, above the title. The instrument layer
            doing the job a coloured badge used to do. */}
        <div className="pk-label flex items-center gap-2">
          <span className="truncate">{item.source || item.domain || kindName}</span>
          <span aria-hidden className="text-[var(--pk-rule-2)]">/</span>
          <span className="shrink-0">{kindName}</span>
        </div>

        <h3 className="mt-2 text-pretty text-[17px] font-medium leading-[1.28] tracking-[-0.011em] text-[var(--pk-ink)]">
          <Link href={`/knowledge/read/${item.id}`} className="after:absolute after:inset-0">
            {item.title}
          </Link>
        </h3>

        {evidence ? (
          <div className="pk-evidence mt-2.5 text-[13.5px] leading-[1.6]">{evidence}</div>
        ) : item.excerpt ? (
          <p className="mt-1.5 line-clamp-2 max-w-[62ch] text-[13.5px] leading-[1.6] text-[var(--pk-ink-3)]">
            {item.excerpt}
          </p>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="pk-meta">{savedAgo(t, locale, item.savedAt)}</span>
          {item.author && <span className="pk-meta">· {item.author}</span>}
          {duration && <span className="pk-meta">· {duration}</span>}

          {item.topics.slice(0, 3).map((topic) => (
            <Link
              key={topic}
              href={`/knowledge/library?q=${encodeURIComponent(topic)}`}
              className="pk-meta relative z-10 text-[var(--pk-ink-4)] underline decoration-[var(--pk-rule-2)] underline-offset-[3px] transition-colors hover:text-[var(--pk-ink-2)]"
            >
              {topic}
            </Link>
          ))}

          {/* State is stated, never implied by colour alone. */}
          {processing && <span className="pk-label text-[var(--pk-signal)]">{t.item.reading}</span>}
          {failed && <span className="pk-label text-[var(--pk-danger)]">{t.item.couldNotFetch}</span>}
          {failed && onRetry && (
            <button
              onClick={() => onRetry(item)}
              className="pk-label relative z-10 text-[var(--pk-ink-2)] underline underline-offset-[3px]"
            >
              {t.item.retry}
            </button>
          )}
        </div>
      </div>

      {showCover && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={item.cover}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setCoverFailed(true)}
          className="hidden size-[72px] shrink-0 rounded-[var(--pk-r)] object-cover sm:block"
        />
      )}

      {onToggleFavorite && (
        <button
          onClick={() => onToggleFavorite(item)}
          aria-label={item.favorite ? t.item.removeFromFavorites : t.item.addToFavorites}
          aria-pressed={item.favorite}
          className={cn(
            "relative z-10 mt-5 flex size-8 shrink-0 items-center justify-center self-start rounded-full transition-opacity",
            item.favorite
              ? "text-[var(--pk-ink)] opacity-100"
              : "text-[var(--pk-ink-4)] opacity-0 hover:text-[var(--pk-ink)] focus-visible:opacity-100 group-hover:opacity-100",
          )}
        >
          <Heart className="size-4" fill={item.favorite ? "currentColor" : "none"} strokeWidth={1.8} />
        </button>
      )}
    </article>
  )
}

/** The list wrapper. Exists so a caller never has to remember that the
 *  rules live on the container's top edge and each row's bottom edge. */
export function ItemRows({ children }: { children: React.ReactNode }) {
  return <div className="pk-rows">{children}</div>
}
