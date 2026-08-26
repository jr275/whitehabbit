import { describe, expect, it } from "vitest"
import { extractPage } from "@/lib/crawler/html"

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Acme Corp — Home</title>
  <meta name="description" content="Acme Corp real content." />
  <link rel="canonical" href="/canonical-home" />
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme Corp"}</script>
  <script type="application/ld+json">not valid json</script>
</head>
<body>
  <nav><a href="/about">About</a><a href="/contact" rel="nofollow">Contact</a><a href="https://external.example.com">External</a></nav>
  <h1>Welcome</h1>
  <p>What services does Acme Corp offer?</p>
</body>
</html>`

describe("extractPage", () => {
  const result = extractPage(SAMPLE_HTML, "https://acme.example.com/")

  it("extracts title, description, canonical (resolved to absolute), and html lang", () => {
    expect(result.title).toBe("Acme Corp — Home")
    expect(result.description).toBe("Acme Corp real content.")
    expect(result.canonicalUrl).toBe("https://acme.example.com/canonical-home")
    expect(result.htmlLang).toBe("en")
  })

  it("extracts only valid JSON-LD blocks, skipping malformed ones", () => {
    expect(result.jsonLd).toHaveLength(1)
    expect(result.jsonLd[0]).toMatchObject({ "@type": "Organization", name: "Acme Corp" })
  })

  it("resolves links to absolute URLs and captures anchor text/rel", () => {
    const about = result.links.find((l) => l.href === "https://acme.example.com/about")
    expect(about?.text).toBe("About")
    const contact = result.links.find((l) => l.href === "https://acme.example.com/contact")
    expect(contact?.rel).toBe("nofollow")
    expect(result.links.some((l) => l.href === "https://external.example.com/")).toBe(true)
  })

  it("strips tags from the extracted text and keeps real content", () => {
    expect(result.text).toContain("What services does Acme Corp offer?")
    expect(result.text).not.toContain("<p>")
  })
})
