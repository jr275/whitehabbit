"use client"

/* ================================================================== *
 * HOME — a composition, not a dashboard.
 *
 * What was here: three stat tiles, two horizontal carousels, a topics
 * strip, a favourites carousel and a "Coming soon" panel. With four
 * saved items the two carousels showed the same four items twice, the
 * tiles read 4 / 4 / 0, and the largest element on the page was an
 * announcement that a feature did not exist yet. Eight blocks
 * competing at one volume is what makes a product read as an admin
 * panel — none of them is allowed to matter more than the others.
 *
 * What is here now is a sequence with one thing at the top:
 *   greeting → the two doors (search, ask) → what you saved recently
 *   → the themes across it → where it connects
 *
 * Every number and every row is real. The counts come from the same
 * library totals as before; nothing was invented to fill the page, and
 * the sections that have nothing to show say so in one line instead of
 * in a panel.
 * ================================================================== */

import Link from "next/link"
import { useSession } from "next-auth/react"
import { ArrowRight, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { fetchLibrary } from "@/lib/knowledge/client"
import { openCommandPalette, openSaveDialog } from "@/lib/knowledge/config"
import { useKnowledgeLibrary } from "@/lib/knowledge/use-knowledge"
import { EmptyLibrary } from "./empty-state"
import { ItemRow, ItemRows } from "./item-row"
import { useLocale, useT } from "./i18n"

function greeting(t: ReturnType<typeof useT>, now = new Date()): string {
  const h = now.getHours()
  if (h < 12) return t.home.goodMorning
  if (h < 18) return t.home.goodAfternoon
  return t.home.goodEvening
}

/** Time-of-day depends on the *viewer's* local clock, which differs from
 * the server's. Computing it during render causes an SSR/client hydration
 * mismatch, so we render a stable neutral greeting on the server + first
 * paint, then swap to the localized one after mount. */
function useGreeting(): string {
  const t = useT()
  const [text, setText] = useState(t.home.welcomeBack)
  useEffect(() => {
    setText(greeting(t))
  }, [t])
  return text
}

function firstName(email?: string | null): string | null {
  if (!email) return null
  const handle = email.split("@")[0]?.replace(/[._-]+/g, " ").trim()
  if (!handle) return null
  return handle.charAt(0).toUpperCase() + handle.slice(1)
}

export function KnowledgeHome() {
  const t = useT()
  const { n } = useLocale()
  const { items, status, total, toggleFavorite, retry } = useKnowledgeLibrary({ filter: "all" })
  const { data: session } = useSession()
  const name = firstName(session?.user?.email)
  const hello = useGreeting()

  const ready = items.filter((i) => i.state === "ready")
  const recent = items.slice(0, 6)

  /* The three totals the old stat tiles spent a bordered, three-column
   * grid on. They are worth one line of mono, not a third of the
   * viewport: they answer "how big is this", which is context, not the
   * reason anyone opened the page. Unread and Favorites are still the
   * real global totals, fetched with a 1-row request purely for the
   * count — never derived from the loaded page, which would
   * under-report, and never guessed. */
  const [unreadTotal, setUnreadTotal] = useState<number | null>(null)
  const [favoritesTotal, setFavoritesTotal] = useState<number | null>(null)

  useEffect(() => {
    if (status !== "ready" || total === 0) return
    const ac = new AbortController()
    fetchLibrary({ filter: "unread", limit: 1 }, ac.signal)
      .then((r) => setUnreadTotal(r.total))
      .catch(() => {})
    fetchLibrary({ filter: "favorites", limit: 1 }, ac.signal)
      .then((r) => setFavoritesTotal(r.total))
      .catch(() => {})
    return () => ac.abort()
  }, [status, total])

  const topics = useMemo(() => {
    const freq = new Map<string, number>()
    for (const it of ready) for (const t of it.topics) freq.set(t, (freq.get(t) ?? 0) + 1)
    return [...freq.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 10)
  }, [ready])

  return (
    <div className="pk-page pb-24">
      {/* ── The masthead ───────────────────────────────────────────
          Greeting, then the two doors. Nothing between them: on a
          knowledge product the first question is always "what am I
          looking for", and anything placed above that answer is
          furniture. */}
      <header className="pt-14 sm:pt-20">
        <p className="pk-label">
          {hello}
          {name ? ` · ${name}` : ""}
        </p>
        <h1 className="pk-display mt-4 max-w-[13ch] text-[var(--pk-ink)]">{t.home.yourKnowledge}</h1>

        <div className="mt-9 max-w-[38rem]">
          <button type="button" onClick={openCommandPalette} className="pk-field text-left">
            <Search className="size-[18px] shrink-0 text-[var(--pk-ink-4)]" strokeWidth={1.8} />
            <span className="flex-1 truncate text-[15px] text-[var(--pk-ink-4)]">
              {t.home.searchEverything}
            </span>
            <kbd className="pk-label shrink-0">⌘K</kbd>
          </button>

          <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              href="/knowledge/ai"
              className="group inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--pk-ink)]"
            >
              {t.home.askYourKnowledge}
              <ArrowRight
                className="size-3.5 transition-transform duration-[var(--pk-fast)] group-hover:translate-x-0.5"
                strokeWidth={2}
              />
            </Link>
            <button
              onClick={openSaveDialog}
              className="text-[14px] text-[var(--pk-ink-3)] underline decoration-[var(--pk-rule-2)] underline-offset-4 transition-colors hover:text-[var(--pk-ink)]"
            >
              {t.home.saveSomethingNew}
            </button>
          </div>

          {status === "ready" && total > 0 && (
            <p className="pk-meta mt-7">
              {t.home.saved(n(total))}
              {unreadTotal !== null && ` · ${t.home.unread(n(unreadTotal))}`}
              {favoritesTotal !== null && ` · ${t.home.favourites(favoritesTotal, n(favoritesTotal))}`}
            </p>
          )}
        </div>
      </header>

      {status === "loading" ? (
        <HomeSkeleton />
      ) : total === 0 ? (
        <div className="pt-16">
          <EmptyLibrary onSave={openSaveDialog} />
        </div>
      ) : (
        <>
          <Section label={t.home.recentlySaved} href="/knowledge/library" hrefLabel={t.home.browseLibrary}>
            <ItemRows>
              {recent.map((item) => (
                <ItemRow key={item.id} item={item} onToggleFavorite={toggleFavorite} onRetry={retry} />
              ))}
            </ItemRows>
          </Section>

          <Section label={t.home.yourKnowledge} href="/knowledge/topics" hrefLabel={t.home.allTopics}>
            {topics.length > 0 ? (
              /* A topic is a word and a count. It used to be a card with
                 a progress bar that was always full — a bar whose only
                 possible value is 100% encodes nothing and still costs
                 a card. */
              <ul className="flex flex-col">
                {topics.map((t) => (
                  <li key={t.label}>
                    <Link
                      href={`/knowledge/library?q=${encodeURIComponent(t.label)}`}
                      className="flex items-baseline gap-4 border-b border-[var(--pk-rule)] py-3 transition-colors hover:bg-[var(--pk-sunken)]"
                    >
                      <span className="flex-1 truncate text-[15px] text-[var(--pk-ink)]">{t.label}</span>
                      <span className="pk-meta pk-num">
                        {t.count} {t.count === 1 ? "piece" : "pieces"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Quiet>{t.home.topicsPending}</Quiet>
            )}
          </Section>

          {/* Discover used to be the biggest block on the page and it
              was an announcement that the feature did not exist. The
              feature does exist — on /knowledge, built from real
              co-occurrence — so this is a door to it, one line tall. */}
          <Section label={t.home.discover} href="/knowledge" hrefLabel={t.home.openConnections}>
            <Quiet>
              {t.home.discoverBody}
            </Quiet>
          </Section>
        </>
      )}
    </div>
  )
}

/** A section is announced by a mono label and a rule. No card, no
 *  heading-plus-subtitle pair, no chevron button group. */
function Section({
  label,
  href,
  hrefLabel,
  children,
}: {
  label: string
  href: string
  hrefLabel: string
  children: React.ReactNode
}) {
  return (
    <section className="pk-section">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="pk-label">{label}</h2>
        <Link href={href} className="pk-meta shrink-0 transition-colors hover:text-[var(--pk-ink)]">
          {hrefLabel} →
        </Link>
      </div>
      {children}
    </section>
  )
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[54ch] text-[14px] leading-[1.65] text-[var(--pk-ink-3)]">{children}</p>
}

function HomeSkeleton() {
  return (
    <div className="pk-section" aria-hidden>
      <div className="pk-rows">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border-b border-[var(--pk-rule)] py-[1.125rem]">
            <div className="h-2.5 w-24 rounded-full bg-[var(--pk-sunken)]" />
            <div className="mt-3 h-4 w-2/3 rounded-full bg-[var(--pk-sunken)]" />
            <div className="mt-2.5 h-3 w-1/3 rounded-full bg-[var(--pk-sunken)]" />
          </div>
        ))}
      </div>
    </div>
  )
}
