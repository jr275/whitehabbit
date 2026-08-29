"use client"

import { useState } from "react"

/* ================================================================== *
 * ITEM THUMBNAIL — a cover image from someone else's server.
 *
 * These fail constantly in the real world: hotlink protection, an
 * expired CDN URL, a corporate proxy, a publisher who moved their
 * assets. The browser's default response is a broken-image glyph,
 * which looks like OUR bug in the middle of OUR card.
 *
 * So a failed load degrades to the same neutral placeholder an item
 * with no image at all gets. The card looks deliberate either way, and
 * nothing about the item's real state is misrepresented — the image
 * was never the information.
 *
 * `referrerPolicy="no-referrer"` keeps the reader's browsing out of
 * the publisher's logs; `decoding="async"` and `loading="lazy"` keep a
 * long library from blocking on images it may never scroll to.
 * ================================================================== */

export function ItemThumbnail({
  src, className, rounded = "var(--p2-r-md)",
}: {
  src: string | null
  className?: string
  rounded?: string
}) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div
        className={className}
        style={{ borderRadius: rounded, background: "var(--p2-surface-sunk)" }}
        aria-hidden="true"
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a cover from an
    // arbitrary third-party domain, not a local asset next/image can optimize
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover ${className ?? ""}`}
      style={{ borderRadius: rounded, background: "var(--p2-surface-sunk)" }}
    />
  )
}
