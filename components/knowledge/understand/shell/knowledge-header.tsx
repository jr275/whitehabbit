"use client"

/* ================================================================== *
 * CHAPTER NAV — this page's table of contents, and nothing else.
 *
 * It used to be a second application header: a second wordmark, a
 * second question field, and a second set of links to Library / Ask /
 * Settings. That existed because this route replaced the app shell, so
 * without those links you could not leave the page. The route now
 * renders inside the same rail as every other Keeply screen, so all
 * three duplicates are gone and what remains is the one thing only
 * this page needs — where you are in a long read.
 *
 * Reading position comes from one IntersectionObserver over all
 * sections rather than scroll math, so nothing runs between
 * intersections.
 * ================================================================== */

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export interface ChapterLink {
  id: string
  label: string
}

export function KnowledgeHeader({ chapters }: { chapters: ChapterLink[] }) {
  const [activeId, setActiveId] = useState<string | null>(chapters[0]?.id ?? null)

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        // The topmost intersecting section wins, so scrolling up and
        // down both land on the section actually being read.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActiveId(visible.target.id)
      },
      { rootMargin: "-45% 0px -45% 0px" },
    )
    for (const c of chapters) {
      const el = document.getElementById(c.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [chapters])

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--pk-rule)] bg-[color-mix(in_oklab,var(--pk-ground)_88%,transparent)] backdrop-blur-md">
      <div className="kp-scroll-x">
        <div className="mx-auto flex w-full max-w-[var(--kp-page)] items-center px-[var(--kp-gutter)]">
          <nav aria-label="Sections of this page">
            <ul className="flex items-center gap-1">
              {chapters.map((c) => (
                <li key={c.id}>
                  <a
                    href={`#${c.id}`}
                    aria-current={activeId === c.id ? "true" : undefined}
                    className={cn(
                      "pk-label block whitespace-nowrap border-b px-2.5 py-3 transition-colors duration-[var(--pk-fast)]",
                      activeId === c.id
                        ? "border-[var(--pk-ink)] text-[var(--pk-ink)]"
                        : "border-transparent hover:text-[var(--pk-ink-2)]",
                    )}
                  >
                    {c.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </header>
  )
}
