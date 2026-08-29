import { Bookmark, Inbox, Plus, Star } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/pocket2/app-shell"
import { EmptyState } from "@/components/pocket2/empty-state"
import { UnauthenticatedError, UnauthorizedOrgError } from "@/lib/session"
import { requireTenant } from "@/lib/pocket2/tenancy"
import { getLibraryPage, getShellData } from "@/lib/pocket2/services/library-service"
import { parseLibraryQuery } from "@/lib/pocket2/domain/validate"
import { POCKET2_LOGIN, POCKET2_ROUTES } from "@/lib/pocket2/routes"

/* ================================================================== *
 * LIBRARY — the signed-in home.
 *
 * A Server Component that resolves its own tenant context and reads
 * through the service layer. There is no client-side fetch of the
 * library and no organization id in the URL: what a person sees is
 * determined entirely by the session the server verified.
 *
 * PHASE 1 SCOPE: the shell, the real counts, and honest empty states.
 * Cards, filters and the ⌘K palette are Phase 3 — this page renders
 * what genuinely exists today rather than a mock of what is coming.
 * ================================================================== */

// Every render depends on the caller's session, so this route is
// request-time by definition and must never be prerendered or shared.
export const dynamic = "force-dynamic"

const VIEWS = {
  favorite: { active: "favorites", heading: "Favorites", empty: { icon: <Star size={22} />, title: "No favorites yet", body: "Star the saves you want to find again without searching. They'll gather here." } },
  archived: { active: "archive", heading: "Archive", empty: { icon: <Inbox size={22} />, title: "Nothing archived", body: "Archiving clears something from your library without deleting it. Everything you archive stays here." } },
  unread:   { active: "unread", heading: "Unread", empty: { icon: <Bookmark size={22} />, title: "You're all caught up", body: "Everything you've saved has been read. Save something new and it'll appear here first." } },
  read:     { active: "all", heading: "Read", empty: { icon: <Inbox size={22} />, title: "Nothing read yet", body: "Items you finish reading will be listed here." } },
} as const

export default async function LibraryPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  let ctx
  try {
    ctx = await requireTenant()
  } catch (error) {
    // The proxy/middleware redirect is a convenience; this is the
    // check that actually decides. A request that reaches here without
    // a valid session — or whose session names an organization it no
    // longer belongs to — goes to sign-in, never to someone's library.
    if (error instanceof UnauthenticatedError || error instanceof UnauthorizedOrgError) {
      redirect(`${POCKET2_LOGIN}?callbackUrl=${encodeURIComponent(POCKET2_ROUTES.library)}`)
    }
    throw error
  }

  const searchParams = await props.searchParams
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    for (const one of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      params.append(key, one)
    }
  }

  const query = parseLibraryQuery(params)
  const [shell, page] = await Promise.all([getShellData(ctx), getLibraryPage(ctx, query)])

  const view = query.status ? VIEWS[query.status] : undefined
  const heading = view?.heading ?? "All items"

  return (
    <AppShell
      counts={shell.counts}
      labels={shell.labels}
      active={view?.active ?? "all"}
      email={ctx.email}
      workspaceName={ctx.organizationName}
    >
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-7 sm:py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="p2-h1" style={{ color: "var(--p2-ink-strong)" }}>{heading}</h1>
          {page.items.length > 0 && (
            <p className="p2-meta">
              {page.items.length}
              {page.hasMore ? "+" : ""} {page.items.length === 1 ? "item" : "items"}
            </p>
          )}
        </div>

        {page.items.length === 0 ? (
          query.search ? (
            <EmptyState
              icon={<Inbox size={22} />}
              title={`No results for "${query.search}"`}
              body="Try fewer words, or search by the site it came from."
              action={<Link href={POCKET2_ROUTES.library} className="p2-btn p2-btn-secondary">Clear search</Link>}
            />
          ) : view ? (
            <EmptyState {...view.empty} />
          ) : (
            <EmptyState
              icon={<Plus size={22} />}
              title="Your library starts here"
              body="Paste any link and Pocket2 will fetch the title, description and image, work out what it is, and file it for you."
              action={
                <Link href={`${POCKET2_ROUTES.library}?save=1`} className="p2-btn p2-btn-primary p2-btn-lg">
                  <Plus size={16} aria-hidden="true" /> Save your first link
                </Link>
              }
            />
          )
        ) : (
          /* Cards land in Phase 3. Until then this lists what is really
           * in the database rather than pretending the grid exists. */
          <ul className="mt-6 flex flex-col">
            {page.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3" style={{ borderTop: "1px solid var(--p2-line)" }}>
                <div className="min-w-0 flex-1">
                  <p className="truncate" style={{ fontSize: "0.9375rem", fontWeight: 530, color: "var(--p2-ink-strong)" }}>
                    {item.title ?? item.canonicalUrl}
                  </p>
                  <p className="p2-meta truncate">
                    {item.domain}
                    {item.ingestStatus !== "ready" && <> · <span style={{ color: "var(--p2-warn)" }}>fetching details…</span></>}
                  </p>
                </div>
                <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="p2-btn p2-btn-ghost p2-btn-sm">
                  Open original
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  )
}
