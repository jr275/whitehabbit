import "server-only"

/* ================================================================== *
 * ROBOTS.TXT — asked before fetching a page for extraction.
 *
 * A publisher's robots.txt is an instruction, not an obstacle. If it
 * disallows this path for our agent, Pocket2 saves the link and the
 * metadata the user themselves can see, and does NOT store a reader
 * copy. That is a product decision recorded in code, not an accident
 * of what happened to be easy.
 *
 * Implements the parts of the de-facto standard that actually decide
 * this question: User-agent grouping (exact match then *), Allow and
 * Disallow with the longest-match-wins rule, and * / $ wildcards.
 * Crawl-delay, Sitemap and Host are irrelevant to a single
 * user-initiated save and are ignored.
 * ================================================================== */

import { assertSafeUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard"
import { USER_AGENT } from "./fetch"

const ROBOTS_TIMEOUT_MS = 5_000
const ROBOTS_MAX_BYTES = 512 * 1024
const AGENT_TOKEN = "pocket2bot"

interface Rule {
  allow: boolean
  pattern: string
}

/** Converts a robots path pattern into a matcher. `*` is any run of
 * characters and `$` anchors the end; everything else is literal, so a
 * path containing regex metacharacters cannot change the meaning of
 * the rule. */
function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$")
  const body = anchored ? pattern.slice(0, -1) : pattern
  const source = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*")
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path)
}

export function parseRobots(text: string, agentToken: string): Rule[] {
  const groups = new Map<string, Rule[]>()
  let activeAgents: string[] = []
  let sawDirective = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim()
    if (!line) continue
    const separator = line.indexOf(":")
    if (separator === -1) continue

    const field = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()

    if (field === "user-agent") {
      // A new User-agent line after directives starts a new group;
      // consecutive User-agent lines share one group.
      if (sawDirective) { activeAgents = []; sawDirective = false }
      activeAgents.push(value.toLowerCase())
      continue
    }

    if (field !== "allow" && field !== "disallow") continue
    sawDirective = true
    for (const agent of activeAgents) {
      const rules = groups.get(agent) ?? []
      // "Disallow:" with an empty value means "nothing is disallowed"
      // and must not be treated as a rule matching everything.
      if (field === "disallow" && value === "") continue
      rules.push({ allow: field === "allow", pattern: value })
      groups.set(agent, rules)
    }
  }

  // Most specific first: our own token, then the wildcard group.
  return groups.get(agentToken) ?? groups.get("*") ?? []
}

/** Longest matching pattern wins; Allow beats Disallow at equal
 * length, which is the standard tie-break. */
export function isAllowedByRules(rules: Rule[], path: string): boolean {
  let best: Rule | null = null
  for (const rule of rules) {
    if (!matches(rule.pattern, path)) continue
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) {
      best = rule
    }
  }
  return best ? best.allow : true
}

export interface RobotsVerdict {
  allowed: boolean
  /** true when robots.txt could not be read at all. Absent or
   * unreachable robots.txt means "no restrictions stated", which is
   * the standard's own default — it is not treated as a denial. */
  unknown: boolean
}

export async function checkRobots(pageUrl: string): Promise<RobotsVerdict> {
  let target: URL
  try {
    target = new URL(pageUrl)
  } catch {
    return { allowed: false, unknown: false }
  }

  const robotsUrl = new URL("/robots.txt", target.origin).toString()
  try {
    // robots.txt is fetched from the same origin as the page, so it
    // gets the same SSRF check as any other outbound request.
    const safe = await assertSafeUrl(robotsUrl)
    const response = await fetch(safe, {
      redirect: "follow",
      signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT, accept: "text/plain" },
    })

    // 4xx (including 404) is the common "no robots.txt" case and means
    // unrestricted. 5xx means the site is unwell, not that it consents.
    if (response.status >= 500) return { allowed: false, unknown: true }
    if (!response.ok) return { allowed: true, unknown: false }

    const text = (await response.text()).slice(0, ROBOTS_MAX_BYTES)
    const rules = parseRobots(text, AGENT_TOKEN)
    return { allowed: isAllowedByRules(rules, target.pathname + target.search), unknown: false }
  } catch (error) {
    if (error instanceof UnsafeUrlError) return { allowed: false, unknown: false }
    return { allowed: false, unknown: true }
  }
}
