import Link from "next/link"
import { Suspense, type ReactNode } from "react"
import { Archive, Bookmark, Home, FolderClosed, Search, Star, Tag } from "lucide-react"
import { BrandLockup } from "@/components/pocket2/brand"
import { ThemeToggle } from "@/components/pocket2/theme-toggle"
import { AccountMenu } from "@/components/pocket2/account-menu"
import { SaveLauncher } from "@/components/pocket2/save-launcher"
import { POCKET2_ROUTES } from "@/lib/pocket2/routes"

/* ================================================================== *
 * APP SHELL — the frame every signed-in Pocket2 screen renders inside.
 *
 * A Server Component: it receives the counts it displays as props from
 * a page that already resolved them in one org-scoped query, rather
 * than fetching anything itself. Keeping the shell dumb is what stops
 * every route from paying for a second round trip just to draw a
 * sidebar.
 * ================================================================== */

export interface ShellCounts {
  total: number
  unread: number
  favorites: number
  archived: number
}

export interface ShellNavLabels {
  collections: { name: string; slug: string }[]
  tags: { name: string; slug: string }[]
}

function NavRow({
  href, icon: Icon, label, count, active,
}: {
  href: string
  icon: typeof Home
  label: string
  count?: number
  active?: boolean
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className="p2-focusable flex items-center gap-2.5 rounded-[var(--p2-r-md)] px-2.5 py-[7px] transition-colors"
        style={{
          background: active ? "var(--p2-accent-soft)" : "transparent",
          color: active ? "var(--p2-accent)" : "var(--p2-muted)",
          fontSize: "0.84375rem",
          fontWeight: active ? 545 : 460,
        }}
      >
        <Icon size={15} aria-hidden="true" />
        <span className="truncate">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="ml-auto tabular-nums" style={{ fontSize: "0.6875rem", color: "var(--p2-faint)" }}>
            {count > 999 ? "999+" : count}
          </span>
        )}
      </Link>
    </li>
  )
}

export function AppShell({
  children, counts, labels, active, email, workspaceName,
}: {
  children: ReactNode
  counts: ShellCounts
  labels: ShellNavLabels
  active: "all" | "unread" | "favorites" | "archive" | "collections" | "tags" | "settings"
  email: string
  workspaceName: string
}) {
  return (
    <div className="min-h-dvh" style={{ background: "var(--p2-paper)" }}>
      {/* ---- top bar ---- */}
      <header
        className="sticky top-0 z-30 backdrop-blur-md"
        style={{ borderBottom: "1px solid var(--p2-line)", background: "color-mix(in oklch, var(--p2-paper) 85%, transparent)" }}
      >
        <div className="flex h-14 items-center gap-3 px-4 sm:px-5">
          <Link href={POCKET2_ROUTES.library} className="p2-focusable shrink-0 rounded-md" style={{ color: "var(--p2-ink)" }}>
            <BrandLockup size={19} />
          </Link>

          {/* Global search is a real link to the library's search state,
            * so it works before any JavaScript loads. The ⌘K palette
            * (Phase 3) enhances this; it does not replace it. */}
          <Link
            href={`${POCKET2_ROUTES.library}?focus=search`}
            className="p2-focusable ml-1 hidden min-w-0 max-w-md flex-1 items-center gap-2 rounded-[var(--p2-r-md)] px-3 py-1.5 transition-colors sm:flex"
            style={{ background: "var(--p2-surface-sunk)", color: "var(--p2-faint)" }}
          >
            <Search size={14} aria-hidden="true" />
            <span style={{ fontSize: "0.8125rem" }}>Search your library</span>
            <kbd
              className="ml-auto rounded px-1.5 py-0.5"
              style={{ background: "var(--p2-surface)", fontSize: "0.625rem", fontFamily: "var(--p2-font-mono)" }}
            >⌘K</kbd>
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            {/* The primary action is present on every screen, and is the
              * only accent-coloured control in the chrome. */}
            {/* useSearchParams inside SaveLauncher needs a boundary so
              * the rest of the shell can still be prerendered. */}
            <Suspense fallback={<span className="p2-btn p2-btn-primary p2-btn-sm" aria-hidden="true">Save</span>}>
              <SaveLauncher />
            </Suspense>
            <ThemeToggle />
            <AccountMenu email={email} workspaceName={workspaceName} />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* ---- sidebar (desktop) ---- */}
        <aside
          className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 flex-col gap-6 overflow-y-auto px-3 py-4 md:flex"
          style={{ borderRight: "1px solid var(--p2-line)" }}
          aria-label="Library"
        >
          <nav>
            <ul className="flex flex-col gap-0.5">
              <NavRow href={POCKET2_ROUTES.library}   icon={Home}     label="All items" count={counts.total}     active={active === "all"} />
              <NavRow href={POCKET2_ROUTES.unread}    icon={Bookmark} label="Unread"    count={counts.unread}    active={active === "unread"} />
              <NavRow href={POCKET2_ROUTES.favorites} icon={Star}     label="Favorites" count={counts.favorites} active={active === "favorites"} />
              <NavRow href={POCKET2_ROUTES.archive}   icon={Archive}  label="Archive"   count={counts.archived}  active={active === "archive"} />
            </ul>
          </nav>

          <nav>
            <div className="flex items-center justify-between px-2.5 pb-1.5">
              <p className="p2-label">Collections</p>
            </div>
            <ul className="flex flex-col gap-0.5">
              {labels.collections.length === 0 ? (
                <li className="px-2.5 py-1">
                  <p className="p2-meta">Group saves into collections as your library grows.</p>
                </li>
              ) : (
                labels.collections.map((c) => (
                  <NavRow key={c.slug} href={`${POCKET2_ROUTES.library}?collection=${c.slug}`} icon={FolderClosed} label={c.name} />
                ))
              )}
            </ul>
          </nav>

          <nav>
            <p className="p2-label px-2.5 pb-1.5">Tags</p>
            {labels.tags.length === 0 ? (
              <p className="p2-meta px-2.5">Tags you add will collect here.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {labels.tags.map((t) => (
                  <NavRow key={t.slug} href={`${POCKET2_ROUTES.library}?tag=${t.slug}`} icon={Tag} label={t.name} />
                ))}
              </ul>
            )}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-24 md:pb-0">{children}</main>
      </div>

      {/* ---- bottom navigation (mobile) — the same destinations, sized
        * for thumbs rather than a cursor. ---- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex md:hidden"
        style={{ borderTop: "1px solid var(--p2-line)", background: "var(--p2-surface)", paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Library"
      >
        {([
          { href: POCKET2_ROUTES.library, icon: Home, label: "All", key: "all" },
          { href: POCKET2_ROUTES.unread, icon: Bookmark, label: "Unread", key: "unread" },
          { href: POCKET2_ROUTES.favorites, icon: Star, label: "Saved", key: "favorites" },
          { href: POCKET2_ROUTES.archive, icon: Archive, label: "Archive", key: "archive" },
        ] as const).map(({ href, icon: Icon, label, key }) => (
          <Link
            key={key}
            href={href}
            aria-current={active === key ? "page" : undefined}
            className="p2-focusable flex flex-1 flex-col items-center gap-1 py-2.5"
            style={{ color: active === key ? "var(--p2-accent)" : "var(--p2-muted)", fontSize: "0.625rem", fontWeight: 520 }}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
