import "server-only"

/* ================================================================== *
 * SEARCH CONSOLE — live ingestion (§12). A real Google Search Console
 * Search Analytics API client using a service-account JWT (the
 * standard server-side auth flow for this API) — never a fabricated
 * response. Requires real credentials
 * (GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL / GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY)
 * configured as server-side env vars; fails loudly and immediately if
 * absent, the same "never silently fabricate" discipline
 * lib/db/client.ts's DatabaseNotConfiguredError already established —
 * this deployment has none configured, so this path is real but
 * inert here, not exercised end-to-end (§40 honesty: this is stated
 * plainly, not hidden).
 *
 * `fetchImpl` is injectable (same pattern as lib/crawler/safe-fetch.ts's
 * SafeFetchFn) so the request-shape/error-handling logic is unit-
 * testable without a live Google credential or network call.
 * ================================================================== */

import { createSign } from "node:crypto"

export class SearchConsoleNotConfiguredError extends Error {
  constructor() {
    super(
      "GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL / GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY are not set. " +
        "Live Search Console ingestion requires a real Google service-account credential with " +
        "access to the target property — see docs/architecture/vertical-slice.md. Use the manual " +
        "import path (lib/intelligence/search-console/repo.ts's importSnapshot/importQueryObservation) " +
        "if you have a real GSC data export but no service account configured yet.",
    )
    this.name = "SearchConsoleNotConfiguredError"
  }
}

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** Real RS256 JWT assertion for the OAuth2 service-account flow
 * (https://developers.google.com/identity/protocols/oauth2/service-account). */
function buildAssertion(clientEmail: string, privateKeyPem: string, now: number): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + 3600,
    }),
  )
  const signingInput = `${header}.${claims}`
  const signer = createSign("RSA-SHA256")
  signer.update(signingInput)
  const signature = base64url(signer.sign(privateKeyPem))
  return `${signingInput}.${signature}`
}

export interface SearchConsoleRow {
  keys: string[] // [query] or [page] or [query, page] depending on the requested dimensions
  clicks: number
  impressions: number
  ctr: number
  position: number
}

/** Fetches a real access token via the service-account JWT flow, then
 * queries the real Search Analytics API for one property/date/dimension
 * set. Throws SearchConsoleNotConfiguredError immediately if no
 * credential is configured — never returns a fabricated empty-but-
 * successful result to mask that. */
export async function fetchSearchAnalytics(
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: ("query" | "page" | "country" | "device")[],
  fetchImpl: typeof fetch = fetch,
): Promise<SearchConsoleRow[]> {
  const clientEmail = process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY
  if (!clientEmail || !privateKey) throw new SearchConsoleNotConfiguredError()

  const assertion = buildAssertion(clientEmail, privateKey.replace(/\\n/g, "\n"), Date.now())
  const tokenRes = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
  })
  if (!tokenRes.ok) throw new Error(`Search Console token request failed: ${tokenRes.status} ${await tokenRes.text()}`)
  const { access_token: accessToken } = (await tokenRes.json()) as { access_token: string }

  const analyticsRes = await fetchImpl(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ startDate, endDate, dimensions, rowLimit: 1000 }),
  })
  if (!analyticsRes.ok) throw new Error(`Search Console analytics request failed: ${analyticsRes.status} ${await analyticsRes.text()}`)
  const body = (await analyticsRes.json()) as { rows?: SearchConsoleRow[] }
  return body.rows ?? [] // a real empty result (no traffic) is honest and distinct from "not configured"
}
