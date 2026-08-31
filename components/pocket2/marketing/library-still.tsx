import { Archive, Bookmark, Clock, Hash, Home, FolderClosed, Plus, Search, Star } from "lucide-react"
import { BrandLockup } from "@/components/pocket2/brand"

/* ================================================================== *
 * LIBRARY STILL — a static portrait of the interface, for the landing
 * page.
 *
 * Not a screenshot and not a live embed: it is built from the same
 * design tokens as the real application, so it cannot drift away from
 * how the product actually looks the way a captured image would.
 *
 * The content is invented sample material, chosen to be obviously
 * generic. It is never presented as anyone's real saved library, and
 * no real publisher's name, wording or artwork appears here.
 * ================================================================== */

const NAV = [
  { icon: Home, label: "All items", count: 248, active: true },
  { icon: Bookmark, label: "Unread", count: 31 },
  { icon: Star, label: "Favorites", count: 12 },
  { icon: Archive, label: "Archive", count: 96 },
]

const COLLECTIONS = ["AI research", "Startup ideas", "Reading list"]
const TAGS = ["ai", "design", "systems", "longform"]

interface Card {
  kind: string
  title: string
  source: string
  minutes: number
  tags: string[]
  favorite?: boolean
  /** two token-derived stops — an abstract cover, never a real image */
  cover: [string, string]
}

const CARDS: Card[] = [
  {
    kind: "Article", title: "The quiet architecture of things that last",
    source: "example-review.com", minutes: 12, tags: ["systems"], favorite: true,
    cover: ["oklch(0.62 0.10 168)", "oklch(0.48 0.09 210)"],
  },
  {
    kind: "Podcast", title: "On attention, and where it actually goes",
    source: "example-audio.fm", minutes: 47, tags: ["longform"],
    cover: ["oklch(0.68 0.11 75)", "oklch(0.55 0.12 30)"],
  },
  {
    kind: "News", title: "A field guide to reading on the internet in 2026",
    source: "example-daily.org", minutes: 6, tags: ["design"],
    cover: ["oklch(0.60 0.10 265)", "oklch(0.45 0.10 300)"],
  },
]

const LIST_ROWS = [
  { title: "Notes on building a second memory", source: "example-notes.dev", minutes: 9, kind: "Blog post" },
  { title: "Why your reading list stopped working", source: "example-review.com", minutes: 14, kind: "Article" },
]

function Cover({ from, to }: { from: string; to: string }) {
  return (
    <div
      className="aspect-[16/10] w-full"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})`, borderRadius: "calc(var(--p2-r-lg) - 1px)" }}
      aria-hidden="true"
    />
  )
}

function TagPill({ children }: { children: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
      style={{ background: "var(--p2-surface-sunk)", color: "var(--p2-muted)", fontSize: "0.6875rem", fontWeight: 500 }}
    >
      <Hash size={9} aria-hidden="true" />{children}
    </span>
  )
}

export function LibraryStill() {
  return (
    <div
      className="overflow-hidden"
      style={{
        borderRadius: "var(--p2-r-xl)",
        border: "1px solid var(--p2-line-strong)",
        background: "var(--p2-surface)",
        boxShadow: "var(--p2-shadow-lg)",
      }}
      role="img"
      aria-label="The Pocket2 library: a sidebar of saved views, a search bar, and a grid of saved article cards."
    >
      {/* ---- app top bar ---- */}
      <div
        className="flex items-center gap-4 px-4 py-3"
        style={{ borderBottom: "1px solid var(--p2-line)" }}
      >
        <BrandLockup size={18} />
        <div
          className="ml-2 hidden min-w-0 flex-1 items-center gap-2 rounded-[var(--p2-r-md)] px-3 py-1.5 sm:flex"
          style={{ background: "var(--p2-surface-sunk)", color: "var(--p2-faint)" }}
        >
          <Search size={13} aria-hidden="true" />
          <span style={{ fontSize: "0.8125rem" }}>Search your library</span>
          <kbd
            className="ml-auto rounded px-1.5 py-0.5"
            style={{ background: "var(--p2-surface)", fontSize: "0.625rem", color: "var(--p2-faint)", fontFamily: "var(--p2-font-mono)" }}
          >⌘K</kbd>
        </div>
        <span className="p2-btn p2-btn-primary p2-btn-sm ml-auto sm:ml-0">
          <Plus size={13} aria-hidden="true" /> Save
        </span>
      </div>

      <div className="flex">
        {/* ---- sidebar ---- */}
        <aside
          className="hidden w-52 shrink-0 flex-col gap-5 px-3 py-4 md:flex"
          style={{ borderRight: "1px solid var(--p2-line)" }}
        >
          <ul className="flex flex-col gap-0.5">
            {NAV.map(({ icon: Icon, label, count, active }) => (
              <li
                key={label}
                className="flex items-center gap-2.5 rounded-[var(--p2-r-md)] px-2.5 py-1.5"
                style={{
                  background: active ? "var(--p2-accent-soft)" : "transparent",
                  color: active ? "var(--p2-accent)" : "var(--p2-muted)",
                  fontSize: "0.8125rem",
                  fontWeight: active ? 540 : 460,
                }}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
                <span className="ml-auto" style={{ fontSize: "0.6875rem", color: "var(--p2-faint)", fontVariantNumeric: "tabular-nums" }}>
                  {count}
                </span>
              </li>
            ))}
          </ul>

          <div>
            <p className="p2-label px-2.5 pb-1.5">Collections</p>
            <ul className="flex flex-col gap-0.5">
              {COLLECTIONS.map((name) => (
                <li key={name} className="flex items-center gap-2.5 rounded-[var(--p2-r-md)] px-2.5 py-1.5"
                    style={{ color: "var(--p2-muted)", fontSize: "0.8125rem" }}>
                  <FolderClosed size={14} aria-hidden="true" />{name}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="p2-label px-2.5 pb-1.5">Tags</p>
            <div className="flex flex-wrap gap-1.5 px-2.5">
              {TAGS.map((t) => <TagPill key={t}>{t}</TagPill>)}
            </div>
          </div>
        </aside>

        {/* ---- main ---- */}
        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6" style={{ background: "var(--p2-paper)" }}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="p2-h2" style={{ color: "var(--p2-ink-strong)" }}>All items</h3>
            <div className="flex items-center gap-1.5">
              {["All", "Articles", "Videos", "Podcasts"].map((f, i) => (
                <span key={f} className="p2-chip" data-active={i === 0 ? "true" : "false"}>{f}</span>
              ))}
            </div>
          </div>

          {/* grid density */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CARDS.map((card) => (
              <article
                key={card.title}
                className="flex flex-col overflow-hidden"
                style={{ borderRadius: "var(--p2-r-lg)", border: "1px solid var(--p2-line)", background: "var(--p2-surface)" }}
              >
                <Cover from={card.cover[0]} to={card.cover[1]} />
                <div className="flex flex-1 flex-col gap-2 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="p2-badge">{card.kind}</span>
                    {card.favorite && <Star size={12} aria-hidden="true" style={{ color: "var(--p2-warn)", fill: "var(--p2-warn)" }} />}
                  </div>
                  <h4 style={{ fontSize: "0.9375rem", fontWeight: 545, lineHeight: 1.35, letterSpacing: "-0.011em", color: "var(--p2-ink-strong)" }}>
                    {card.title}
                  </h4>
                  <p className="p2-meta mt-auto flex items-center gap-1.5 pt-1">
                    <span style={{ height: 12, width: 12, borderRadius: 3, background: "var(--p2-surface-sunk)", display: "inline-block" }} aria-hidden="true" />
                    {card.source}
                    <span aria-hidden="true">·</span>
                    <Clock size={10} aria-hidden="true" />{card.minutes} min
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {card.tags.map((t) => <TagPill key={t}>{t}</TagPill>)}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* list density, to show the same card in another mode */}
          <ul className="mt-4 flex flex-col">
            {LIST_ROWS.map((row) => (
              <li
                key={row.title}
                className="flex items-center gap-3 py-3"
                style={{ borderTop: "1px solid var(--p2-line)" }}
              >
                <span
                  className="hidden h-11 w-16 shrink-0 sm:block"
                  style={{ borderRadius: "var(--p2-r-sm)", background: "linear-gradient(135deg, var(--p2-surface-sunk), var(--p2-line))" }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate" style={{ fontSize: "0.875rem", fontWeight: 520, color: "var(--p2-ink-strong)", letterSpacing: "-0.008em" }}>
                    {row.title}
                  </p>
                  <p className="p2-meta truncate">{row.source} · {row.minutes} min</p>
                </div>
                <span className="p2-badge hidden sm:inline-flex">{row.kind}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
