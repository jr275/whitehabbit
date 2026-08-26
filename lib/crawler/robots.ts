/* ================================================================== *
 * ROBOTS.TXT — a minimal, real parser. Supports the "User-agent: *"
 * group's Allow/Disallow rules (longest-match-wins, the de facto
 * standard every major crawler uses) and Sitemap: directives. No
 * per-bot-name group matching beyond "*" — this crawler identifies
 * itself as one real, honest user agent (see crawl.ts's USER_AGENT),
 * so a site-specific block for a different named bot is irrelevant to
 * it, same as any other single named crawler.
 * ================================================================== */

export interface RobotsRules {
  disallow: string[]
  allow: string[]
  sitemaps: string[]
}

export function parseRobots(text: string): RobotsRules {
  const lines = text.split(/\r?\n/)
  const disallow: string[] = []
  const allow: string[] = []
  const sitemaps: string[] = []
  let inWildcardGroup = false
  let sawAnyUserAgent = false

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim()
    if (!line) continue
    const [rawKey, ...rest] = line.split(":")
    if (!rawKey || rest.length === 0) continue
    const key = rawKey.trim().toLowerCase()
    const value = rest.join(":").trim()

    if (key === "user-agent") {
      sawAnyUserAgent = true
      inWildcardGroup = value === "*"
      continue
    }
    if (key === "sitemap" && value) {
      sitemaps.push(value)
      continue
    }
    // a rule line before any User-agent line is malformed robots.txt;
    // treat it as applying to everyone, matching common crawler leniency
    if ((key === "disallow" || key === "allow") && (!sawAnyUserAgent || inWildcardGroup)) {
      if (key === "disallow" && value) disallow.push(value)
      if (key === "allow" && value) allow.push(value)
    }
  }
  return { disallow, allow, sitemaps }
}

/** Longest-matching-rule-wins, per the de facto robots.txt standard —
 * an Allow rule more specific than a Disallow rule overrides it. */
export function isAllowedByRobots(rules: RobotsRules, path: string): boolean {
  let bestMatchLength = -1
  let allowed = true
  for (const rule of rules.disallow) {
    if (rule === "") continue // empty Disallow means "allow everything"
    if (path.startsWith(rule) && rule.length > bestMatchLength) {
      bestMatchLength = rule.length
      allowed = false
    }
  }
  for (const rule of rules.allow) {
    if (path.startsWith(rule) && rule.length > bestMatchLength) {
      bestMatchLength = rule.length
      allowed = true
    }
  }
  return allowed
}
