import "server-only"

/* ================================================================== *
 * Small server-side auth helpers that don't need the full Auth.js /
 * database import graph. Kept separate from lib/auth.ts so lightweight
 * routes (rate-limit subjects, feature flags) don't pull in NextAuth.
 * ================================================================== */

/* ---- feature flags ------------------------------------------------ *
 *
 * WHY THIS IS A FUNCTION AND WHY THE PAGES MUST BE DYNAMIC.
 *
 * The Google button should appear when Google OAuth will actually
 * work, which is a question about the running deployment. It used to
 * be answered by a module-level `const` in lib/auth.ts, evaluated once
 * — and since /login and /signup are prerendered, "once" meant AT
 * BUILD TIME. The answer was baked into login.rsc as
 * `"googleEnabled":false` and no amount of setting GOOGLE_CLIENT_ID in
 * production could change it. Measured, not theorised: with both
 * variables set, the served page still had no Google button.
 *
 * A function alone does not fix that — a prerendered page would just
 * call it at build time instead. The pages carry
 * `export const dynamic = "force-dynamic"` for the same reason, and
 * that is the part that actually does the work. The cost is one server
 * render per visit to a login page, which is the right trade for a
 * setting that can otherwise silently do nothing.
 *
 * It lives here rather than in lib/auth.ts so the two pages stop
 * dragging the whole Auth.js and database import graph into their own
 * — which is exactly what this module's header says it is for.
 * ------------------------------------------------------------------ */

/** True when real Google OAuth credentials are configured. Read fresh
 *  on every call: a deployment that sets the credentials must be able
 *  to show the button without a rebuild. */
export type GoogleAuthEnv = {
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  /* Present so ProcessEnv is assignable. Without it TypeScript's
   * weak-type check rejects the real process.env, whose declared
   * properties do not overlap these two. */
  [key: string]: string | undefined
}

export function googleAuthConfigured(env: GoogleAuthEnv = process.env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}

/* ---- OAuth identity trust ------------------------------------------ *
 *
 * lib/auth.ts registers the Google provider with
 * `allowDangerousEmailAccountLinking: true`, which means a Google
 * sign-in is matched to an EXISTING Whitehabbit account purely by
 * email address. That setting is what lets someone who signed up with
 * a password later use the Google button on the same account, which
 * is the behaviour we want — but it also makes the email claim the
 * entire proof of identity.
 *
 * So the claim has to be one Google actually stands behind. An OIDC
 * `email` is only an assertion that the provider knows the address;
 * `email_verified` is the assertion that the provider CHECKED it.
 * Google normally sets it true, but not always — some Workspace and
 * directory-provisioned accounts carry an address the tenant asserted
 * rather than one Google confirmed. Linking on an unverified address
 * turns "can obtain a Google account naming this address" into "can
 * sign in as this person", including into an account whose real owner
 * has a password and has never used Google at all.
 *
 * Hence: verified, or no link. This deliberately requires an explicit
 * true. A missing claim is not treated as consent — an identity
 * provider that will not say the address is verified has not verified
 * it, and this is the one decision where guessing in the permissive
 * direction hands over someone's account. */
export function isVerifiedOAuthEmail(profile: { email?: unknown; email_verified?: unknown } | null | undefined): boolean {
  if (!profile) return false
  const email = typeof profile.email === "string" ? profile.email.trim() : ""
  if (!email) return false
  // Google sends a real JSON boolean; some providers stringify it.
  return profile.email_verified === true || profile.email_verified === "true"
}

/* ---- trusted client IP -------------------------------------------- *
 *
 * This value is the SUBJECT of every pre-session rate limit — password
 * reset, password forgot, and the unauthenticated /api/knowledge/
 * preview fetcher. If a client can choose it, those limits do not
 * exist.
 *
 * THE PROBLEM WITH X-FORWARDED-FOR. It is a list, appended to by each
 * proxy a request passes through. Anything a client sends arrives
 * intact at the LEFT of that list — so the leftmost entry is, by
 * construction, the one value in the header the client fully controls.
 * Next.js does not fix this for you: base-server.js sets the header
 * with `??=`, i.e. only when it is absent, so a client-supplied header
 * is passed through untouched rather than appended to.
 *
 * THE MODEL USED HERE. Count TRUSTED_PROXY_HOPS entries from the
 * RIGHT. The rightmost entry was written by the proxy closest to this
 * application — the last one a client could not reach past. This is
 * correct whether the platform APPENDS to the header (the client's
 * forgery sits to the left, ignored) or REPLACES it (there is one
 * entry, and it is the right one). The leftmost is only ever correct
 * in the replace case, which is why it is the wrong default.
 *
 * THE ASSUMPTION, STATED PLAINLY. Exactly ONE trusted proxy sits in
 * front of this application. That is true on Vercel, whose edge
 * terminates the connection and forwards, and true of the ordinary
 * single-reverse-proxy deployment. It is configurable because it is an
 * assumption about infrastructure, and infrastructure changes:
 *
 *   TRUSTED_PROXY_HOPS=2   an additional CDN or load balancer in front
 *   TRUSTED_PROXY_HOPS=0   nothing in front is trusted
 *
 * Setting it to 0 is the honest configuration for a deployment reached
 * directly (a bare `next start` with no proxy). There, EVERY entry in
 * the header is client-supplied, so the header is ignored entirely and
 * every caller shares one bucket. That degrades the limit rather than
 * removing it, which is the right way round: a shared bucket throttles
 * an attacker along with everyone else, while a forgeable bucket
 * throttles nobody.
 *
 * WHAT IS RETURNED IS ALWAYS A VALIDATED IP, never arbitrary header
 * text. That matters as much as the position: without it a client
 * sends a different nonsense string on every request and mints a fresh
 * rate-limit bucket each time, which is not "bypassing" the limit so
 * much as the limit never having applied.
 * ------------------------------------------------------------------ */

/** Long enough for any real chain, short enough to never be a payload. */
const MAX_HEADER_LENGTH = 1024
/** A single address, before any port or brackets are stripped. */
const MAX_ADDRESS_LENGTH = 64

const IPV4 =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

/** Validated by the URL parser rather than a hand-written expression:
 * IPv6 has zone ids, compression and embedded IPv4, and a regex for it
 * is a well-known way to be subtly wrong. */
function isIpv6(value: string): boolean {
  try {
    new URL(`http://[${value}]/`)
    return true
  } catch {
    return false
  }
}

/**
 * Normalise one entry of an X-Forwarded-For chain to a bare address,
 * or null when it is not one.
 *
 * Ports are stripped because they are not identity: without that,
 * 1.2.3.4:1 and 1.2.3.4:2 are two buckets, which hands an attacker
 * the same free-bucket trick the validation is there to close.
 */
export function normalizeIp(raw: string): string | null {
  let value = raw.trim()
  if (value.length === 0 || value.length > MAX_ADDRESS_LENGTH) return null

  // "[2001:db8::1]:443" and "[2001:db8::1]"
  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(value)
  if (bracketed) {
    const inner = bracketed[1].toLowerCase()
    return isIpv6(inner) ? inner : null
  }

  // "203.0.113.10:1234" — a single colon can only be an IPv4 port,
  // since a bare IPv6 address always has at least two.
  if ((value.match(/:/g) ?? []).length === 1) {
    value = value.slice(0, value.indexOf(":"))
  }

  if (IPV4.test(value)) return value
  const lowered = value.toLowerCase()
  return isIpv6(lowered) ? lowered : null
}

/** How many proxies in front of this app are trusted to have appended
 * to X-Forwarded-For. Anything unparseable is treated as the default
 * rather than as 0, so a typo cannot silently collapse every caller
 * into one bucket. */
export function trustedProxyHops(): number {
  const raw = (process.env.TRUSTED_PROXY_HOPS ?? "").trim()
  if (raw === "") return 1
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 8) return 1
  return parsed
}

/**
 * The rate-limit subject for a request with no session.
 *
 * Falls back to a constant when no address can be trusted, so the
 * limiter still functions globally rather than silently doing nothing.
 */
export function clientIpFrom(req: Request, hops: number = trustedProxyHops()): string {
  // Nothing in front is trusted, so nothing in the request can be
  // believed. One shared bucket is the conservative answer.
  if (hops < 1) return "unknown"

  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded && forwarded.length <= MAX_HEADER_LENGTH) {
    const chain = forwarded
      .split(",")
      .map((entry) => normalizeIp(entry))
      .filter((entry): entry is string => entry !== null)

    // Count from the right: chain[length - hops] is the address the
    // outermost trusted proxy observed. A chain shorter than the
    // configured hop count means fewer proxies ran than expected, so
    // the leftmost surviving entry is the furthest we can trust.
    if (chain.length > 0) {
      return chain[Math.max(0, chain.length - hops)]
    }
  }

  // Only reached when X-Forwarded-For is absent or contained no
  // address at all. Weaker than the chain above — a single value with
  // no position to reason about — so it is a fallback, not a
  // preference.
  const realIp = req.headers.get("x-real-ip")
  if (realIp) {
    const normalized = normalizeIp(realIp)
    if (normalized) return normalized
  }

  return "unknown"
}

/* ================================================================== *
 * DEPLOYMENT READINESS.
 *
 * Auth.js collapses every authorize() failure into one
 * `CredentialsSignin` error, so the sign-in form cannot tell a wrong
 * password from a server that has no database to check it against. It
 * guessed, and it guessed in the direction that blames the person:
 * sign-UP on the same deployment correctly said "The database is not
 * configured", while sign-IN said "Incorrect email or password."
 *
 * These report what a sign-in needs, as booleans only — never a value,
 * never a length. A diagnosis must not become a disclosure.
 * ================================================================== */

export interface AuthReadiness {
  database: boolean
  sessionSecret: boolean
}

/** Reads the environment under every name a platform may have set it:
 *  Vercel/Neon write NEON_DATABASE_URL or POSTGRES_URL, and NextAuth v4
 *  deployments carry NEXTAUTH_SECRET. Missing one of those is a
 *  configured deployment, not a broken one. */
export function authReadiness(): AuthReadiness {
  return {
    database: Boolean(
      process.env.DATABASE_URL ||
        process.env.NEON_DATABASE_URL ||
        process.env.POSTGRES_URL ||
        process.env.NEON_DATABASE_URL_UNPOOLED,
    ),
    sessionSecret: Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET),
  }
}

export function canAuthenticate(readiness: AuthReadiness = authReadiness()): boolean {
  return readiness.database && readiness.sessionSecret
}

/** The message to show INSTEAD of "incorrect password" when the
 *  deployment cannot authenticate anyone. Null when it can, so the
 *  caller falls through to the ordinary credentials message. */
export function notConfiguredMessage(readiness: AuthReadiness = authReadiness()): string | null {
  if (!readiness.database && !readiness.sessionSecret) {
    return "This deployment isn’t finished setting up: it has no database and no session secret. Sign-in can’t work until DATABASE_URL and AUTH_SECRET are set on the server."
  }
  if (!readiness.database) {
    return "This deployment has no database configured, so accounts can’t be read. Set DATABASE_URL on the server and try again."
  }
  if (!readiness.sessionSecret) {
    return "This deployment has no session secret, so a sign-in can’t be kept. Set AUTH_SECRET on the server and try again."
  }
  return null
}
