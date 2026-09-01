/* /knowledge/read/[id] — the reader.
 *
 * Never blank: a failed item shows the real reason and a link to the
 * original; an item with metadata but no body says so rather than
 * rendering an empty article. */

import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { requireScope } from "@/lib/knowledge/access/scope"
import { getObjectWithContent, recordOpened } from "@/lib/knowledge/content/repo"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

export default async function ReaderPage({ params }: Params) {
  let scope
  try {
    scope = await requireScope()
  } catch {
    redirect("/login?callbackUrl=/knowledge")
  }

  const { id } = await params
  const result = await getObjectWithContent(scope, id)
  // A cross-tenant id is indistinguishable from one that does not exist.
  if (!result) notFound()

  const { object, content } = result
  await recordOpened(scope, id)

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <Link href="/knowledge" className="text-sm text-muted-foreground hover:underline">
        ← Library
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold leading-tight text-balance">{object.title ?? object.domain}</h1>
        <p className="text-sm text-muted-foreground">
          {object.siteName ?? object.domain}
          {object.authors.length > 0 ? ` · ${object.authors.join(", ")}` : ""}
          {object.publishedAt ? ` · ${new Date(object.publishedAt).toLocaleDateString()}` : ""}
          {object.readingTimeSeconds ? ` · ${Math.max(1, Math.round(object.readingTimeSeconds / 60))} min` : ""}
        </p>
        <a
          href={object.resolvedUrl ?? object.submittedUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-sm underline"
        >
          {object.resolvedUrl ?? object.submittedUrl}
        </a>
      </header>

      {object.status === "failed" ? (
        <div className="rounded-lg border border-destructive/40 p-4">
          <p className="text-sm font-medium">We couldn't read this page</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {object.failureMessage ?? "Something went wrong while saving it."}
          </p>
        </div>
      ) : object.status !== "completed" ? (
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Still processing. Refresh in a moment.</p>
        </div>
      ) : content?.contentHtml ? (
        /* Sanitized on WRITE (lib/knowledge/ingestion/extraction/
           sanitize.ts), so nothing unsafe was ever stored. */
        <div
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: content.contentHtml }}
        />
      ) : content?.contentText ? (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{content.contentText}</div>
      ) : (
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm font-medium">No readable article body</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {object.excerpt ?? "We saved this link and its details, but couldn't extract the article text."}
          </p>
        </div>
      )}
    </main>
  )
}
