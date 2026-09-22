"use client"

/* ================================================================== *
 * HEADER — a knowledge query surface, not a search box.
 *
 * The field is wide, serif-set and prompts with whole questions,
 * because what it accepts is a question about a library rather than a
 * keyword. Placeholder rotates through real examples so the affordance
 * is taught by the control itself.
 *
 * The chapter nav is the page's table of contents. It reflects reading
 * position via IntersectionObserver rather than scroll math — one
 * observer for all sections, nothing running between intersections.
 * ================================================================== */

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export interface ChapterLink {
  id: string
  label: string
}

/** The rest of the product.
 *
 * This route replaces the app shell with its own header, which means
 * the sidebar and the mobile bottom nav are not rendered here. Without
 * these links a person landing on /knowledge could not reach their
 * Library, Ask or Settings at all — so they are part of the header,
 * not an optional nicety. Kept to the four surfaces that are real
 * destinations rather than mirroring the whole sidebar. */
const APP_LINKS: { href: string; label: string }[] = [
  { href: "/knowledge/library", label: "Library" },
  { href: "/knowledge/ai", label: "Ask" },
  { href: "/knowledge/research", label: "Research" },
  { href: "/knowledge/settings", label: "Settings" },
]

const PROMPTS = [
  "What do I know about AI agents?",
  "Find what I saved about MCP",
  "What did I save this week?",
  "Where does my library disagree with itself?",
]

export function KnowledgeHeader({
  chapters,
  onAsk,
  onVoice,
  voiceActive,
}: {
  chapters: ChapterLink[]
  onAsk: (question: string) => void
  onVoice: () => void
  voiceActive: boolean
}) {
  const [value, setValue] = useState("")
  const [promptIndex, setPromptIndex] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(chapters[0]?.id ?? null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Rotate the placeholder only while the field is empty and unfocused —
  // text changing under a cursor is hostile.
  useEffect(() => {
    if (value) return
    const t = window.setInterval(() => setPromptIndex((i) => (i + 1) % PROMPTS.length), 4200)
    return () => window.clearInterval(t)
  }, [value])

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
    <header className="sticky top-0 z-40 border-b border-[var(--kp-rule)] bg-[color-mix(in_oklab,var(--kp-paper)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[var(--kp-page)] items-center gap-4 px-[var(--kp-gutter)] py-3.5">
        <Link
          href="/knowledge/home"
          className="shrink-0 font-[family-name:var(--font-fraunces)] text-[17px] font-semibold tracking-[-0.02em]"
        >
          KEEP<span className="text-[var(--kp-accent)]">ly</span>
        </Link>

        <form
          className="relative min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim()) onAsk(value.trim())
          }}
        >
          <label htmlFor="kp-query" className="sr-only">
            Ask a question about your knowledge
          </label>
          <input
            id="kp-query"
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={PROMPTS[promptIndex]}
            autoComplete="off"
            className="w-full rounded-full border border-[var(--kp-rule)] bg-[var(--kp-paper-raised)] px-5 py-2.5 font-[family-name:var(--font-fraunces)] text-[15px] leading-none text-[var(--kp-ink)] transition-colors duration-[var(--kp-fast)] placeholder:text-[var(--kp-ink-faint)] hover:border-[var(--kp-rule-strong)] focus:border-[var(--kp-accent)] focus:outline-none"
          />
        </form>

        <button
          type="button"
          onClick={onVoice}
          aria-pressed={voiceActive}
          aria-label={voiceActive ? "Close voice" : "Ask with your voice"}
          className={cn(
            "shrink-0 rounded-full border px-3.5 py-2 text-[12px] font-medium transition-colors duration-[var(--kp-fast)]",
            voiceActive
              ? "border-[var(--kp-accent)] bg-[var(--kp-accent)] text-[var(--kp-paper)]"
              : "border-[var(--kp-rule)] text-[var(--kp-ink-soft)] hover:border-[var(--kp-rule-strong)] hover:text-[var(--kp-ink)]",
          )}
        >
          Voice
        </button>
      </div>

      <div className="kp-scroll-x border-t border-[var(--kp-rule)]">
        <div className="mx-auto flex w-full max-w-[var(--kp-page)] items-center gap-1 px-[var(--kp-gutter)]">
          <nav aria-label="Sections of this page" className="flex items-center gap-1">
            <ul className="flex items-center gap-1">
              {chapters.map((c) => (
                <li key={c.id}>
                  <a
                    href={`#${c.id}`}
                    aria-current={activeId === c.id ? "true" : undefined}
                    className={cn(
                      "block whitespace-nowrap border-b-2 px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.1em] transition-colors duration-[var(--kp-fast)]",
                      activeId === c.id
                        ? "border-[var(--kp-accent)] text-[var(--kp-ink)]"
                        : "border-transparent text-[var(--kp-ink-faint)] hover:text-[var(--kp-ink-soft)]",
                    )}
                  >
                    {c.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <span aria-hidden className="mx-2 h-4 w-px shrink-0 bg-[var(--kp-rule)]" />

          <nav aria-label="Keeply" className="flex items-center gap-1">
            <ul className="flex items-center gap-1">
              {APP_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="block whitespace-nowrap px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--kp-ink-faint)] transition-colors duration-[var(--kp-fast)] hover:text-[var(--kp-accent)]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </header>
  )
}
