import { describe, expect, it } from "vitest"
import { isAllowedByRobots, parseRobots } from "@/lib/crawler/robots"

describe("parseRobots", () => {
  it("parses Disallow/Allow rules for the wildcard user-agent", () => {
    const rules = parseRobots(`User-agent: *\nDisallow: /admin\nAllow: /admin/public\nSitemap: https://example.com/sitemap.xml`)
    expect(rules.disallow).toEqual(["/admin"])
    expect(rules.allow).toEqual(["/admin/public"])
    expect(rules.sitemaps).toEqual(["https://example.com/sitemap.xml"])
  })

  it("ignores rules scoped to a different, non-wildcard user-agent", () => {
    const rules = parseRobots(`User-agent: SomeOtherBot\nDisallow: /everything\nUser-agent: *\nDisallow: /admin`)
    expect(rules.disallow).toEqual(["/admin"])
  })

  it("treats a missing robots.txt content as allow-everything", () => {
    const rules = parseRobots("")
    expect(isAllowedByRobots(rules, "/anything")).toBe(true)
  })
})

describe("isAllowedByRobots", () => {
  it("blocks a disallowed path", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /admin")
    expect(isAllowedByRobots(rules, "/admin/settings")).toBe(false)
    expect(isAllowedByRobots(rules, "/public")).toBe(true)
  })

  it("lets a more specific Allow rule override a broader Disallow", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /admin\nAllow: /admin/public")
    expect(isAllowedByRobots(rules, "/admin/public/page")).toBe(true)
    expect(isAllowedByRobots(rules, "/admin/private")).toBe(false)
  })
})
