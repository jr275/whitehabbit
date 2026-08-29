import { describe, expect, it } from "vitest"
import { FieldError, parseLibraryQuery, parseTagNames, requireSlug, requireString, resolveDateFloor, toSlug } from "@/lib/pocket2/domain/validate"
import { requireRole, ForbiddenError, type TenantContext } from "@/lib/pocket2/domain/authz"

describe("parseLibraryQuery", () => {
  const parse = (qs: string) => parseLibraryQuery(new URLSearchParams(qs))

  it("combines filters, which is the whole point of the filter model", () => {
    const q = parse("type=article&status=unread&tag=ai&sort=oldest")
    expect(q).toMatchObject({ contentTypes: ["article"], status: "unread", tagSlugs: ["ai"], sort: "oldest" })
  })

  it("accepts a repeated parameter and a comma list identically", () => {
    expect(parse("tag=ai&tag=saas").tagSlugs).toEqual(["ai", "saas"])
    expect(parse("tag=ai,saas").tagSlugs).toEqual(["ai", "saas"])
  })

  it("drops unknown filter values instead of failing the page", () => {
    // A stale bookmark naming a filter we have since renamed should
    // still load the library, just without that filter applied.
    expect(parse("type=nonsense").contentTypes).toBeUndefined()
    expect(parse("type=nonsense,article").contentTypes).toEqual(["article"])
    expect(parse("sort=by_vibes").sort).toBe("newest")
    expect(parse("status=hacked").status).toBeUndefined()
  })

  it("returns undefined — not an empty array — for absent filters", () => {
    // `[]` would reach the repository as "match nothing" and silently
    // render an empty library.
    const q = parse("")
    expect(q.tagSlugs).toBeUndefined()
    expect(q.domains).toBeUndefined()
    expect(q.contentTypes).toBeUndefined()
  })

  it("clamps the page size so a crafted limit cannot ask for everything", () => {
    expect(parse("limit=100000").limit).toBe(100)
    expect(parse("limit=-5").limit).toBe(30)
    expect(parse("limit=abc").limit).toBe(30)
    expect(parse("limit=12").limit).toBe(12)
  })

  it("caps and de-duplicates list filters", () => {
    const many = Array.from({ length: 60 }, (_, i) => `tag=t${i}`).join("&")
    expect(parse(many).tagSlugs).toHaveLength(20)
    expect(parse("tag=ai&tag=ai&tag=AI").tagSlugs).toEqual(["ai"])
  })

  it("truncates an over-long search rather than passing it through", () => {
    expect(parse(`q=${"x".repeat(500)}`).search).toHaveLength(200)
  })
})

describe("toSlug", () => {
  it("produces url-safe slugs and strips path characters", () => {
    expect(toSlug("AI Research")).toBe("ai-research")
    expect(toSlug("  Spaced   Out  ")).toBe("spaced-out")
    expect(toSlug("../../etc/passwd")).toBe("etc-passwd")
    // Accents decompose under NFKD; letters that are their own
    // codepoint (ø, ß, æ) need explicit folding, or a tag named
    // "Søren" would slug to "s-ren".
    expect(toSlug("Ünïcødé Tàgs")).toBe("unicode-tags")
    expect(toSlug("Søren")).toBe("soren")
    expect(toSlug("Weiß")).toBe("weiss")
    expect(toSlug("Æsthetics")).toBe("aesthetics")
    expect(toSlug("#hash?query=1")).toBe("hash-query-1")
  })

  it("rejects a name that slugifies to nothing", () => {
    expect(() => requireSlug("!!!", "name")).toThrow(FieldError)
  })
})

describe("requireString", () => {
  it("trims, and enforces presence and length", () => {
    expect(requireString("  hello  ", "title")).toBe("hello")
    expect(() => requireString("   ", "title")).toThrow(/required/i)
    expect(() => requireString(42, "title")).toThrow(/must be text/i)
    expect(() => requireString("x".repeat(50), "title", { max: 10 })).toThrow(/10 characters or fewer/)
  })
})

describe("parseTagNames", () => {
  it("de-duplicates and caps, so one item cannot carry unbounded tags", () => {
    expect(parseTagNames(["ai", "ai", " ai "])).toEqual(["ai"])
    expect(parseTagNames(Array.from({ length: 100 }, (_, i) => `t${i}`))).toHaveLength(25)
    expect(parseTagNames(["ok", "x".repeat(100)])).toEqual(["ok"])
  })
})

describe("resolveDateFloor", () => {
  const now = new Date("2026-03-15T14:30:00Z").getTime()
  it("resolves named ranges to absolute bounds", () => {
    expect(resolveDateFloor("all", now)).toBeUndefined()
    expect(resolveDateFloor("week", now)).toBe(now - 7 * 86_400_000)
    expect(resolveDateFloor("month", now)).toBe(now - 30 * 86_400_000)
    expect(resolveDateFloor("today", now)).toBeLessThan(now)
  })
})

describe("requireRole", () => {
  const ctx = (role: TenantContext["role"]): TenantContext => ({
    orgId: "org_1", userId: "user_1", email: "a@b.test", organizationName: "Workspace", role,
  })

  it("permits a role at or above the requirement", () => {
    expect(() => requireRole(ctx("owner"), "member")).not.toThrow()
    expect(() => requireRole(ctx("owner"), "owner")).not.toThrow()
    expect(() => requireRole(ctx("admin"), "member")).not.toThrow()
    expect(() => requireRole(ctx("member"), "member")).not.toThrow()
  })

  it("refuses a role below the requirement", () => {
    expect(() => requireRole(ctx("member"), "admin")).toThrow(ForbiddenError)
    expect(() => requireRole(ctx("member"), "owner")).toThrow(ForbiddenError)
    expect(() => requireRole(ctx("admin"), "owner")).toThrow(ForbiddenError)
  })

  it("says which role is needed and which the caller holds", () => {
    expect(() => requireRole(ctx("member"), "owner")).toThrow(/requires the owner role.*your role.*is member/i)
  })
})
