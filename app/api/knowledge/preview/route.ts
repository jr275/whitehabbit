import "server-only"

/* GET /api/knowledge/preview?url=<page>
 *
 * PUBLIC, read-only page-metadata lookup. Returns just the
 * presentational metadata a Library card needs (title, excerpt,
 * domain, site name, author, cover image, favicon, kind) for an
 * arbitrary user-supplied public URL.
 *
 * Why it's unauthenticated: guest mode saves to the browser's local
 * library and cannot scrape pages itself (CORS + it would be unsafe).
 * This route lets a guest show a REAL thumbnail without any insecure
 * browser workaround — the fetch happens server-side behind the same
 * SSRF guard, timeout and size cap as the authenticated pipeline.
 *
 * Safety: SSRF-guarded (assertSafeUrl resolves DNS and blocks
 * localhost/private/link-local/metadata addresses), rate-limited per
 * client IP, and it only ever reflects metadata already present in the
 * target page. It never touches the database and never returns any
 * project secret or environment value.
 */

import { NextResponse } from "next/server"
import { ValidationError, withApiHandler } from "@/lib/api-error"
import { clientIpFrom } from "@/lib/auth-features"
import { fetchPageMetadata, SaveValidationError } from "@/lib/knowledge/service"
import { enforceRateLimit } from "@/lib/rate-limit"

export async function GET(req: Request) {
  return withApiHandler("knowledge.preview", async () => {
    await enforceRateLimit("knowledge_preview", clientIpFrom(req))

    const url = new URL(req.url).searchParams.get("url")
    if (!url || typeof url !== "string") throw new ValidationError("A url query parameter is required.")

    let metadata
    try {
      metadata = await fetchPageMetadata(url)
    } catch (err) {
      // Unsafe/invalid/unreachable URLs surface as an honest 400 — the
      // caller keeps the item and falls back to the editorial cover.
      if (err instanceof SaveValidationError) throw new ValidationError(err.message)
      throw err
    }

    return NextResponse.json(
      { metadata },
      // Small shared cache: identical URLs previewed within the window
      // reuse the result instead of re-fetching the page.
      { headers: { "cache-control": "public, max-age=0, s-maxage=3600" } },
    )
  })
}
