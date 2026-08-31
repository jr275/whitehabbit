import Link from "next/link"
import { ArrowRight, Archive, Bookmark, Headphones, Search, Star, Tags } from "lucide-react"
import { BrandLockup } from "@/components/pocket2/brand"
import { ThemeToggle } from "@/components/pocket2/theme-toggle"
import { LibraryStill } from "@/components/pocket2/marketing/library-still"

/* ================================================================== *
 * LANDING — the product is the hero.
 *
 * Deliberately short. One promise, one picture of the real interface,
 * six capabilities named in the user's own words, one call to action.
 * A saving app that needs three screens of copy to explain itself has
 * already lost the argument.
 * ================================================================== */

const CAPABILITIES = [
  { icon: Bookmark, title: "Save in one motion", body: "Paste a link. Pocket2 fetches the title, description, image and source, and works out what kind of thing it is — while you carry on reading." },
  { icon: Search,   title: "Find it again",      body: "Search titles, descriptions, tags, authors, domains and the full article text. Instant, from anywhere, with ⌘K." },
  { icon: Tags,     title: "Tags and collections", body: "Tags are labels that go anywhere. Collections are the shelves you build on purpose. Both, because they are not the same thing." },
  { icon: Archive,  title: "A calm library",     body: "Unread, favourites, archive. Nothing is deleted because you finished it, and nothing shouts at you because you haven't." },
  { icon: Headphones, title: "Read or listen",   body: "A distraction-free reader for when you have the attention, narration for when you don't. Both resume exactly where you stopped." },
  { icon: Star,     title: "Yours, and private", body: "Your library belongs to your workspace alone, enforced in the database rather than in the interface." },
]

export default function Pocket2LandingPage() {
  return (
    <div className="min-h-dvh" style={{ background: "var(--p2-paper)" }}>
      {/* ---- top bar ---- */}
      <header
        className="sticky top-0 z-30 backdrop-blur-md"
        style={{ borderBottom: "1px solid var(--p2-line)", background: "color-mix(in oklch, var(--p2-paper) 82%, transparent)" }}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/pocket2" className="p2-focusable rounded-md" style={{ color: "var(--p2-ink)" }}>
            <BrandLockup />
          </Link>
          <nav className="flex items-center gap-1.5">
            <ThemeToggle />
            <Link href="/pocket2/login" className="p2-btn p2-btn-ghost">Sign in</Link>
            <Link href="/pocket2/signup" className="p2-btn p2-btn-primary">Start saving</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ---- hero ---- */}
        <section className="mx-auto max-w-6xl px-5 pb-4 pt-16 sm:px-8 sm:pt-24">
          <div className="max-w-3xl">
            <p className="p2-label">Your personal internet library</p>
            <h1 className="p2-display p2-balance mt-4" style={{ color: "var(--p2-ink-strong)" }}>
              Save the internet.
              <br />
              Keep what matters.
            </h1>
            <p className="p2-lead p2-pretty mt-6 max-w-xl">
              One beautiful place to save, organize, search and revisit everything worth
              keeping from the web — and to actually read it when you get there.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/pocket2/signup" className="p2-btn p2-btn-primary p2-btn-lg">
                Start saving <ArrowRight aria-hidden="true" />
              </Link>
              <a href="#how" className="p2-btn p2-btn-secondary p2-btn-lg">See how it works</a>
            </div>
          </div>
        </section>

        {/* ---- the product itself ---- */}
        <section className="mx-auto max-w-6xl px-5 pb-24 pt-12 sm:px-8">
          <LibraryStill />
        </section>

        {/* ---- capabilities ---- */}
        <section
          id="how"
          className="scroll-mt-20"
          style={{ borderTop: "1px solid var(--p2-line)", background: "var(--p2-surface-sunk)" }}
        >
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <h2 className="p2-h1 p2-balance max-w-2xl" style={{ color: "var(--p2-ink-strong)" }}>
              Save, understand, organize, search, read, revisit.
            </h2>
            <p className="p2-lead mt-4 max-w-xl">
              The six things a library has to do well. Everything else is decoration.
            </p>
            <ul className="mt-14 grid gap-x-12 gap-y-11 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map(({ icon: Icon, title, body }) => (
                <li key={title}>
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-[var(--p2-r-md)]"
                    style={{ background: "var(--p2-accent-soft)", color: "var(--p2-accent)" }}
                  >
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <h3 className="p2-h3 mt-4" style={{ color: "var(--p2-ink-strong)" }}>{title}</h3>
                  <p className="p2-body p2-pretty mt-1.5" style={{ color: "var(--p2-muted)" }}>{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---- close ---- */}
        <section className="mx-auto max-w-6xl px-5 py-24 text-center sm:px-8 sm:py-32">
          <h2 className="p2-h1 p2-balance mx-auto max-w-xl" style={{ color: "var(--p2-ink-strong)" }}>
            Everything you meant to come back to.
          </h2>
          <p className="p2-lead mx-auto mt-4 max-w-md">
            Start with one link. Your library builds itself from there.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/pocket2/signup" className="p2-btn p2-btn-primary p2-btn-lg">
              Start saving <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: "1px solid var(--p2-line)" }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <BrandLockup size={18} />
          <p className="p2-meta">
            Pocket2 saves links you choose and always links back to the original source.
          </p>
        </div>
      </footer>
    </div>
  )
}
