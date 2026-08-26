/* ================================================================== *
 * PUBLIC PAGE RENDERING (§23, ADR-016/ADR-007) — the smallest real
 * architecture that proves Opportunity -> Page -> URL -> Next.js
 * render. Resolves through lib/pages/repo.ts's resolvePublishedPage()
 * ONLY — never queries the database directly here — so a future
 * RouteTemplate engine replaces that one function, not this route.
 *
 * Unauthenticated by design: a PUBLISHED page is, by definition,
 * meant to be public. resolvePublishedPage() only ever returns a page
 * whose status is exactly 'published' — draft/quality_rejected/ready
 * pages are never reachable here.
 * ================================================================== */

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { resolvePublishedPage } from "@/lib/pages/repo"

type Params = { params: Promise<{ projectId: string; slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { projectId, slug } = await params
  const resolved = await resolvePublishedPage(projectId, slug)
  if (!resolved) return {}
  return {
    title: resolved.version.content.title,
    description: resolved.version.content.metaDescription,
    alternates: resolved.page.canonicalUrl ? { canonical: resolved.page.canonicalUrl } : undefined,
  }
}

export default async function PublicPage({ params }: Params) {
  const { projectId, slug } = await params
  const resolved = await resolvePublishedPage(projectId, slug)
  if (!resolved) notFound()
  const { version } = resolved

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <article>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">{version.content.title}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{version.content.metaDescription}</p>
        <div className="mt-10 flex flex-col gap-8">
          {version.content.sections.map((section, i) => (
            <section key={i}>
              <h2 className="text-2xl font-semibold text-foreground">{section.heading}</h2>
              <p className="mt-3 leading-relaxed text-foreground/90">{section.body}</p>
            </section>
          ))}
        </div>
      </article>
      {Array.isArray(version.schema) && version.schema.length > 0 && (
        <script
          type="application/ld+json"
          // Real, previously-validated JSON-LD generated at publish time
          // (lib/pages/json-ld.ts) — never fabricated at render time.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(version.schema) }}
        />
      )}
    </main>
  )
}
