import { describe, expect, it } from "vitest"
import { classifyContent, extractMetadata } from "@/lib/pocket2/ingest/metadata"
import { parseRobots, isAllowedByRules } from "@/lib/pocket2/ingest/robots"
import { suggestTags } from "@/lib/pocket2/ingest/tags"

const page = (head: string, body = "<p>body</p>") =>
  `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`

describe("extractMetadata", () => {
  it("prefers OpenGraph, which a human curated for sharing", () => {
    const meta = extractMetadata(
      page(`<title>Raw title | Site</title>
            <meta property="og:title" content="Curated title">
            <meta property="og:description" content="A description.">
            <meta property="og:site_name" content="Example Review">`),
      "https://example.com/a",
    )
    expect(meta.title).toBe("Curated title")
    expect(meta.description).toBe("A description.")
    expect(meta.siteName).toBe("Example Review")
  })

  it("falls back through twitter, JSON-LD and <title>", () => {
    expect(extractMetadata(page(`<meta name="twitter:title" content="Tw">`), "https://e.com/").title).toBe("Tw")
    expect(extractMetadata(page(`<script type="application/ld+json">{"headline":"LD"}</script>`), "https://e.com/").title).toBe("LD")
    expect(extractMetadata(page(`<title>Plain</title>`), "https://e.com/").title).toBe("Plain")
  })

  it("reads an author given as a JSON-LD object, not just a string", () => {
    const meta = extractMetadata(
      page(`<script type="application/ld+json">{"author":{"@type":"Person","name":"A. Writer"}}</script>`),
      "https://e.com/",
    )
    expect(meta.author).toBe("A. Writer")
  })

  it("survives malformed JSON-LD without losing the rest of the metadata", () => {
    const meta = extractMetadata(
      page(`<script type="application/ld+json">{ this is not json </script>
            <meta property="og:title" content="Still here">`),
      "https://e.com/",
    )
    expect(meta.title).toBe("Still here")
  })

  it("resolves relative image URLs against the page", () => {
    const meta = extractMetadata(page(`<meta property="og:image" content="/img/cover.png">`), "https://example.com/posts/a")
    expect(meta.imageUrl).toBe("https://example.com/img/cover.png")
  })

  it("refuses a non-http scheme in og:image — it becomes a rendered src", () => {
    for (const hostile of ["javascript:alert(1)", "data:image/svg+xml,<svg onload=alert(1)>", "file:///etc/passwd"]) {
      const meta = extractMetadata(page(`<meta property="og:image" content="${hostile}">`), "https://e.com/")
      expect(meta.imageUrl, hostile).toBeNull()
    }
  })

  it("drops implausible dates rather than guessing", () => {
    expect(extractMetadata(page(`<meta property="article:published_time" content="not a date">`), "https://e.com/").publishedAt).toBeNull()
    expect(extractMetadata(page(`<meta property="article:published_time" content="1912-01-01">`), "https://e.com/").publishedAt).toBeNull()
    expect(extractMetadata(page(`<meta property="article:published_time" content="2099-01-01">`), "https://e.com/").publishedAt).toBeNull()
    expect(extractMetadata(page(`<meta property="article:published_time" content="2026-03-15T10:00:00Z">`), "https://e.com/").publishedAt)
      .toBe(Date.parse("2026-03-15T10:00:00Z"))
  })

  it("caps absurdly long values instead of storing them", () => {
    const meta = extractMetadata(page(`<meta property="og:title" content="${"x".repeat(5000)}">`), "https://e.com/")
    expect(meta.title!.length).toBeLessThanOrEqual(300)
  })

  it("notices a noarchive request", () => {
    expect(extractMetadata(page(`<meta name="robots" content="noindex, noarchive">`), "https://e.com/").noArchive).toBe(true)
    expect(extractMetadata(page(`<meta name="robots" content="index, follow">`), "https://e.com/").noArchive).toBe(false)
  })
})

describe("classifyContent", () => {
  const bare = { title: null, description: null, author: null, imageUrl: null, faviconUrl: null,
                 publishedAt: null, siteName: null, declaredType: null, language: null, noArchive: false }
  const none = { hasArticleText: false, wordCount: 0 }
  const prose = { hasArticleText: true, wordCount: 900 }

  it("trusts the host over the page's own claims", () => {
    // A YouTube page declaring og:type=article is still a video.
    expect(classifyContent("https://www.youtube.com/watch?v=x", { ...bare, declaredType: "article" }, prose)).toBe("video")
    expect(classifyContent("https://open.spotify.com/episode/x", bare, none)).toBe("podcast")
    expect(classifyContent("https://x.com/user/status/1", bare, none)).toBe("social_post")
  })

  it("uses schema.org and OpenGraph types when the host is neutral", () => {
    expect(classifyContent("https://e.com/x", { ...bare, declaredType: "NewsArticle" }, prose)).toBe("news")
    expect(classifyContent("https://e.com/x", { ...bare, declaredType: "BlogPosting" }, prose)).toBe("blog_post")
    expect(classifyContent("https://e.com/x", { ...bare, declaredType: "product" }, none)).toBe("product")
  })

  it("reads URL shape when there is no declared type", () => {
    expect(classifyContent("https://e.com/2026/03/15/headline", bare, prose)).toBe("news")
    expect(classifyContent("https://e.com/blog/thing", bare, prose)).toBe("blog_post")
    expect(classifyContent("https://e.com/report.pdf", bare, none)).toBe("document")
  })

  it("says 'website', not 'article', when nothing indicates prose", () => {
    // Confidently mislabelling an unknown page as a readable article
    // is what makes a Reader look broken.
    expect(classifyContent("https://e.com/", bare, none)).toBe("website")
    expect(classifyContent("https://e.com/", bare, { hasArticleText: true, wordCount: 40 })).toBe("website")
    expect(classifyContent("https://e.com/", bare, prose)).toBe("article")
  })
})

describe("robots.txt", () => {
  const rules = (txt: string) => parseRobots(txt, "pocket2bot")

  it("applies the wildcard group when no agent matches", () => {
    const r = rules("User-agent: *\nDisallow: /private/")
    expect(isAllowedByRules(r, "/public/a")).toBe(true)
    expect(isAllowedByRules(r, "/private/a")).toBe(false)
  })

  it("prefers our own agent group over the wildcard", () => {
    const r = rules("User-agent: *\nDisallow: /\n\nUser-agent: Pocket2Bot\nDisallow: /admin/")
    expect(isAllowedByRules(r, "/anything")).toBe(true)
    expect(isAllowedByRules(r, "/admin/x")).toBe(false)
  })

  it("lets the longest match win, with Allow breaking a tie", () => {
    const r = rules("User-agent: *\nDisallow: /docs/\nAllow: /docs/public/")
    expect(isAllowedByRules(r, "/docs/secret")).toBe(false)
    expect(isAllowedByRules(r, "/docs/public/a")).toBe(true)
  })

  it("handles wildcards and end-anchors", () => {
    const r = rules("User-agent: *\nDisallow: /*.pdf$")
    expect(isAllowedByRules(r, "/files/a.pdf")).toBe(false)
    expect(isAllowedByRules(r, "/files/a.pdf?x=1")).toBe(true)
    expect(isAllowedByRules(r, "/files/a.html")).toBe(true)
  })

  it("treats an empty Disallow as permission, not prohibition", () => {
    expect(isAllowedByRules(rules("User-agent: *\nDisallow:"), "/anything")).toBe(true)
  })

  it("ignores comments and unknown directives", () => {
    const r = rules("# a comment\nUser-agent: *\nCrawl-delay: 10\nSitemap: https://e.com/s.xml\nDisallow: /x/")
    expect(isAllowedByRules(r, "/x/a")).toBe(false)
    expect(isAllowedByRules(r, "/y/a")).toBe(true)
  })

  it("does not let regex metacharacters in a pattern change its meaning", () => {
    const r = rules("User-agent: *\nDisallow: /a.b/")
    expect(isAllowedByRules(r, "/a.b/x")).toBe(false)
    expect(isAllowedByRules(r, "/axb/x")).toBe(true) // "." is literal, not "any char"
  })

  it("permits everything when robots.txt is empty", () => {
    expect(isAllowedByRules(rules(""), "/anything")).toBe(true)
  })
})

describe("suggestTags", () => {
  it("suggests from a confident title match", () => {
    expect(suggestTags({ title: "A guide to large language model evaluation", domain: "e.com" })).toContain("ai")
  })

  it("stays quiet when there is no real signal", () => {
    // Better to suggest nothing than to fill someone's library with
    // tags they now have to delete.
    expect(suggestTags({ title: "Weekend notes", description: "Some thoughts.", domain: "e.com" })).toEqual([])
  })

  it("ignores a single passing mention in the body", () => {
    expect(suggestTags({ title: "Bread recipes", articleText: "I once read a machine learning paper.", domain: "e.com" }))
      .not.toContain("ai")
  })

  it("adds a domain tag for sources that are reliably one thing", () => {
    expect(suggestTags({ title: "Some paper", domain: "arxiv.org" })).toContain("research")
    expect(suggestTags({ title: "A repo", domain: "github.com" })).toContain("code")
  })

  it("never returns more than a handful", () => {
    const busy = "artificial intelligence design system startup vulnerability revenue clinical trial nutrition productivity climate change interest rate"
    expect(suggestTags({ title: busy, description: busy, domain: "arxiv.org" }).length).toBeLessThanOrEqual(4)
  })

  it("is deterministic — the same input always gives the same tags", () => {
    const input = { title: "Machine learning for design systems", domain: "e.com" }
    expect(suggestTags(input)).toEqual(suggestTags(input))
  })
})
