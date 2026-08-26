import "server-only"

/* GET /sitemap.xml (§26) — every real PUBLISHED page, with a real
 * lastmod from its published version's creation time. A global
 * sitemap (no per-tenant domain binding yet — ADR-010 is still
 * deferred); sharding/partitioning is explicitly out of scope until
 * real page volume exists (§38, docs/architecture/roadmap.md Phase 6).
 */

import { listPublishedPages } from "@/lib/pages/repo"

// Always dynamic — the published-page set changes whenever a page is
// published, and this must never be frozen at build time (there is no
// real database available then anyway).
export const dynamic = "force-dynamic"

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export async function GET() {
  const entries = await listPublishedPages()
  const urls = entries
    .filter((e) => e.page.canonicalUrl)
    .map((e) => {
      const lastmod = new Date(e.version.createdAt).toISOString()
      return `  <url>\n    <loc>${escapeXml(e.page.canonicalUrl!)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
    })
    .join("\n")

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } })
}
