/* ================================================================== *
 * SECURITY HEADERS — Knowledge only, not Workforce.
 *
 * Every directive here is the result of reading the real code, not a
 * guess. Specifically (see the commit that introduced this file for
 * the full audit trail):
 *
 *   script-src 'unsafe-inline'
 *     Proven necessary, not assumed. A real production build's HTML
 *     was inspected directly: every page ships two framework-authored
 *     inline <script> tags — `(self.__next_f=...).push(...)` — which
 *     are Next.js App Router's own RSC/hydration payload. There is no
 *     src-file alternative for these; without 'unsafe-inline' (and per
 *     an explicit standing decision — D4 — not to introduce a nonce or
 *     a CSP hash here) the page would never hydrate. No Knowledge
 *     component contains an inline <script> or a dangerouslySetInnerHTML
 *     script of its own — grepped, zero matches.
 *
 *   script-src 'unsafe-eval' — DEVELOPMENT ONLY, proven, not guessed
 *     Loading a real `next dev` page in a real Chromium against a
 *     policy WITHOUT 'unsafe-eval' produces this exact, unambiguous
 *     console error: "eval() is not supported in this environment. If
 *     this page was served with a Content-Security-Policy header, make
 *     sure that unsafe-eval is included. React requires eval() in
 *     development mode for various debugging features like
 *     reconstructing callstacks from a different environment. React
 *     will never use eval() in production mode." That is React's own
 *     dev-mode debugging machinery, not app code — and it was
 *     confirmed to be a genuine consequence of this policy, not a
 *     pre-existing environment quirk, by an A/B check: the identical
 *     `next dev` server with NO Content-Security-Policy header at all
 *     never logs that message; this policy without 'unsafe-eval' does,
 *     every time. Matched by a real production server showing zero
 *     eval-related console output under the exact same, eval-less
 *     policy — confirming React's own claim that production never
 *     needs it. So this is the one directive that genuinely differs
 *     between environments, and only this one: see
 *     knowledgeSecurityHeaders() below.
 *
 *   style-src 'unsafe-inline'
 *     Proven necessary by an earlier mistake, corrected before this
 *     shipped: the first pass here checked only for inline <style>
 *     TAGS (zero in the real production HTML — Tailwind v4 compiles to
 *     external, same-origin /_next/static/chunks/*.css loaded via
 *     <link>) and dangerouslySetInnerHTML, and concluded no allowance
 *     was needed. Loading the real pages in a real, unmocked Chromium
 *     against that policy immediately produced CSP violations: React's
 *     `style={{...}}` prop renders as an inline `style="..."`
 *     attribute, which CSP's style-src governs identically to a
 *     <style> tag, and this codebase uses it — genuinely dynamically,
 *     not as a Tailwind-class substitute — in components/knowledge/
 *     {knowledge-home,library-view,knowledge-card,reader-view,guest-
 *     topics}.tsx and app/knowledge/topics/page.tsx: a per-card stagger
 *     animation delay computed from list index, the reading-progress
 *     bar's width computed from scroll position, a skeleton's computed
 *     height. None of those are expressible as a static class, and per
 *     the standing decision not to introduce a nonce or hash (D4), the
 *     only remaining honest option is 'unsafe-inline' here — the same
 *     category of unavoidable requirement as script-src above, just
 *     caught only by actually loading the page rather than by reading
 *     source. (components/ui/chart.tsx's own inline <style> tag is a
 *     separate, Workforce-only mechanism this header set never reaches
 *     anyway — scoped to Knowledge's routes only, see next.config.mjs
 *     — but it was never what made this directive necessary.)
 *
 *   img-src 'self' https:
 *     Knowledge's whole point is rendering covers/favicons pulled from
 *     whatever page a user saves — the set of origins is unbounded by
 *     design, so a finite host allowlist is impossible here (see the
 *     commit message for the fuller reasoning). `https:` is a SCHEME
 *     source, not a wildcard host — it still refuses http:, data: and
 *     blob:. That refusal is real, not just tighter-on-paper: lib/
 *     knowledge/extract.ts's resolveUrl() already explicitly rejects
 *     any data: URI and any non-http(s) scheme before a cover/favicon
 *     URL is ever persisted (read directly, not assumed), so nothing
 *     legitimate needs those schemes anyway.
 *
 *   font-src 'self'
 *     next/font/google (app/layout.tsx: Geist, Geist_Mono, Fraunces)
 *     self-hosts at build time by design. Verified directly against a
 *     real production build: the served CSS contains zero external
 *     url(...) references and the rendered HTML contains no
 *     fonts.googleapis.com/fonts.gstatic.com link at all.
 *
 *   connect-src 'self'
 *     Every fetch() in lib/knowledge/{client,guest-store}.ts targets a
 *     relative /api/knowledge/* path — grepped, no exceptions. Auth.js
 *     (useSession/signOut, used from components/knowledge/{knowledge-
 *     sidebar,settings-view,knowledge-home}.tsx) only ever calls its
 *     own same-origin /api/auth/* routes. @vercel/analytics (rendered
 *     globally, so present on Knowledge pages too, production only —
 *     see app/layout.tsx) resolves its own script/beacon URLs to
 *     same-origin /_vercel/insights/* paths in production (read
 *     directly out of node_modules/@vercel/analytics — its only
 *     external URL, https://va.vercel-scripts.com/v1/script.debug.js,
 *     is reachable exclusively through its own isDevelopment() branch,
 *     which this app never exercises because app/layout.tsx only
 *     mounts <Analytics/> when NODE_ENV === 'production').
 *
 *   frame-src — YouTube and Vimeo, and ONLY the hosts actually used
 *     Read directly out of components/knowledge/reader-view.tsx's own
 *     videoEmbed(): it emits exactly https://www.youtube.com/embed/*
 *     (never youtube-nocookie.com — not implemented, so not listed)
 *     and https://player.vimeo.com/video/* (never bare vimeo.com — the
 *     video ID is parsed out of a vimeo.com/<id> URL, but the iframe
 *     itself is only ever pointed at player.vimeo.com). That single
 *     <iframe> in VideoBlock() is the only frame Knowledge ever opens.
 *
 *   media-src 'self', worker-src 'self'
 *     No <video>/<audio>/Worker/Blob/createObjectURL/WebAssembly
 *     anywhere under app/knowledge, components/knowledge or lib/
 *     knowledge — grepped, zero matches. Set to the same restrictive
 *     default as everything else rather than left to inherit from
 *     default-src, so the policy is explicit about having considered
 *     them (per the brief) rather than silently relying on a fallback.
 *
 * Zero use of eval/new Function was found or is needed by Knowledge's
 * OWN code (grepped). The one 'unsafe-eval' allowance that does exist
 * is scoped to non-production and is React's, not Knowledge's — see
 * script-src above. Turbopack's HMR websocket failing in this sandbox
 * (`next dev`'s /_next/hmr connection) was checked and is unrelated:
 * the identical failure reproduces with no Content-Security-Policy
 * header at all, so it is a property of this sandboxed network, not
 * of this policy, and connect-src needs no dev-only widening for it.
 * ================================================================== */

export interface SecurityHeader {
  key: string
  value: string
}

/** The only two frame hosts any Knowledge code ever points an <iframe>
 * at — see components/knowledge/reader-view.tsx's videoEmbed(). Named
 * constants so the CSP and any test asserting on it read from the same
 * single source of truth. */
export const YOUTUBE_EMBED_ORIGIN = "https://www.youtube.com"
export const VIMEO_EMBED_ORIGIN = "https://player.vimeo.com"

/** Powerful features Knowledge never requests, denied outright, even
 * to same-origin. Features the YouTube/Vimeo <iframe>'s own `allow`
 * attribute (reader-view.tsx's VideoBlock) requests — autoplay,
 * fullscreen, picture-in-picture, encrypted-media, clipboard-write,
 * accelerometer, gyroscope — are deliberately left OUT of this list,
 * so this header never overrides what that attribute already,
 * correctly, allows. */
const DENIED_PERMISSIONS = ["camera", "geolocation", "payment", "usb", "midi", "magnetometer"]

/** Features Knowledge DOES use, allowed to this origin and no other.
 *
 * microphone: the Library's voice search (lib/knowledge/voice-search.ts,
 * used by components/knowledge/library-view.tsx) drives the Web Speech
 * API's SpeechRecognition, and SpeechRecognition is gated on microphone
 * permission. It was on the denied list because the audit behind this
 * header grepped for `navigator.mediaDevices` — which SpeechRecognition
 * does not use — and voice search landed after that header did, so the
 * grep was accurate when it was written and stale by the time the
 * feature shipped. Denied, the feature fails with `not-allowed`, which
 * reads as the user having refused the microphone rather than as a
 * response header.
 *
 * `(self)` rather than `*`: the page's own origin may ask, and a framed
 * third party (the YouTube/Vimeo players) still may not. */
const SELF_PERMISSIONS = ["microphone"]

function permissionsPolicyValue(): string {
  return [
    ...DENIED_PERMISSIONS.map((feature) => `${feature}=()`),
    ...SELF_PERMISSIONS.map((feature) => `${feature}=(self)`),
  ].join(", ")
}

/**
 * Builds the exact Content-Security-Policy value for Knowledge's own
 * routes (pages and API routes alike — see next.config.mjs for the
 * source patterns this is applied to). One string, one place, so a
 * test can assert on it directly instead of re-deriving it.
 *
 * `isProduction` changes exactly one source, in one directive:
 * script-src only gets 'unsafe-eval' when NOT production — see the
 * header comment above for the empirical proof this is React's own
 * dev-mode requirement, never Knowledge's, and never needed once
 * NODE_ENV=production.
 */
export function buildKnowledgeCsp(isProduction: boolean): string {
  const scriptSrc = isProduction ? ["'self'", "'unsafe-inline'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "https:"]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'"]],
    ["frame-src", [YOUTUBE_EMBED_ORIGIN, VIMEO_EMBED_ORIGIN]],
    ["media-src", ["'self'"]],
    ["worker-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'self'"]],
  ]
  return directives.map(([directive, sources]) => `${directive} ${sources.join(" ")}`).join("; ")
}

/**
 * The full header set applied to Knowledge's routes. `isProduction`
 * changes exactly two things, both proven necessary, nothing else:
 *
 *   1. script-src drops 'unsafe-eval' in production (see
 *      buildKnowledgeCsp() above) — production is the strictly
 *      tighter policy, never the looser one.
 *   2. Strict-Transport-Security is present only in production —
 *      HSTS instructs the browser to force HTTPS for this origin for
 *      the given duration, which is real production behavior with no
 *      correct meaning against a local `next dev` origin.
 *
 * Every other header is byte-identical in both environments.
 */
export function knowledgeSecurityHeaders(isProduction: boolean): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: "Content-Security-Policy", value: buildKnowledgeCsp(isProduction) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: permissionsPolicyValue() },
    // Defense-in-depth for browsers that predate CSP frame-ancestors.
    // SAMEORIGIN matches frame-ancestors 'self' above exactly — it does
    // not additionally restrict anything, and does not touch Knowledge
    // framing YouTube/Vimeo (that's the opposite direction: frame-src).
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
  ]
  if (isProduction) {
    // 2 years, this host only. Gated to production: sent over a
    // plain-HTTP `next dev` origin it would be ignored by every
    // browser anyway (the header has no effect on a non-secure
    // context), but scoping it here keeps that reasoning explicit
    // rather than relying on browsers to discard it silently.
    //
    // WITHOUT includeSubDomains. That directive binds every subdomain
    // of the serving host to HTTPS for the full max-age, including
    // subdomains this repository cannot see and does not serve, and it
    // cannot be taken back faster than the max-age it already
    // published. The protection it adds applies to hosts this app does
    // not control; the risk it adds lands on them too.
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000" })
  }
  return headers
}
