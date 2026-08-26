import "server-only"

/* ================================================================== *
 * CANONICAL URL SERVICE (§18) — one place that decides the canonical
 * host/path/protocol for a page. Prefers a verified custom/subdomain
 * (real DNS-proven ownership); falls back to the existing in-app
 * /sites/:projectId/:slug route (ADR-016) when no verified domain
 * exists yet — the fallback is never a dead end, just a different
 * canonical host for the exact same page.
 * ================================================================== */

import { getPrimaryVerifiedDomain } from "./repo"

/** The app's own base URL, for the ADR-016 fallback route. Real,
 * environment-derived — never hardcoded to one deployment. Vercel sets
 * VERCEL_URL automatically (host only, no protocol); NEXT_PUBLIC_APP_URL
 * is an explicit override for a stable production domain; localhost is
 * the last, honest fallback for local development. */
export function resolveAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

/** Trailing-slash policy: never a trailing slash except the bare root —
 * applied consistently so the same page never has two "canonical"
 * spellings (§18: "prevent duplicate indexing"). */
function normalizePath(path: string): string {
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, "") : withLeadingSlash
}

export async function resolveCanonicalUrl(orgId: string, projectId: string, slug: string): Promise<string> {
  const domain = await getPrimaryVerifiedDomain(orgId, projectId)
  if (domain) {
    return `https://${domain.hostname}${normalizePath(`/${slug}`)}`
  }
  return `${resolveAppBaseUrl()}${normalizePath(`/sites/${projectId}/${slug}`)}`
}
