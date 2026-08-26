/* ================================================================== *
 * DETERMINISTIC FIXTURE WEBSITE (§33) — a small, entirely generic
 * ("Fixture Test Co", a consulting/support business — no real-estate-
 * specific vocabulary anywhere) site used only by the E2E test.
 * Proves vertical independence (§33/§77): the same extraction/scoring
 * code that would run against a real estate site runs against this
 * unrelated vertical with no code change.
 *
 * Contents: 1 Organization, 2 locations (Place, via areaServed), 2
 * services (Service), 3 questions (FAQPage), real internal links, and
 * real JSON-LD throughout — exactly §33's shape.
 * ================================================================== */

export const FIXTURE_ORIGIN = "https://fixture.example.test"

const HOME = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Fixture Test Co — Home</title>
  <meta name="description" content="Fixture Test Co provides real consulting and support services." />
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Fixture Test Co",
    description: "A deterministic fixture business used to prove the platform works across verticals.",
    areaServed: [
      { "@type": "Place", name: "Rivertown" },
      { "@type": "Place", name: "Laketown" },
    ],
  })}</script>
</head>
<body>
  <nav><a href="/services">Services</a><a href="/faq">FAQ</a><a href="/about">About</a></nav>
  <h1>Welcome to Fixture Test Co</h1>
  <p>We serve Rivertown and Laketown with real consulting and support services.</p>
</body>
</html>`

const SERVICES = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Services — Fixture Test Co</title>
  <meta name="description" content="Our consulting and support services." />
  <script type="application/ld+json">${JSON.stringify([
    { "@context": "https://schema.org", "@type": "Service", name: "Consulting Service", description: "Strategic consulting for real businesses." },
    { "@context": "https://schema.org", "@type": "Service", name: "Support Plan", description: "Ongoing operational support." },
  ])}</script>
</head>
<body>
  <nav><a href="/">Home</a></nav>
  <h1>Our Services</h1>
  <p>Fixture Test Co offers Consulting Service and Support Plan to Rivertown and Laketown businesses.</p>
</body>
</html>`

const FAQ = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>FAQ — Fixture Test Co</title>
  <meta name="description" content="Frequently asked questions about Fixture Test Co." />
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: "What services does Fixture Test Co offer?", acceptedAnswer: { "@type": "Answer", text: "Fixture Test Co offers Consulting Service and Support Plan." } },
      { "@type": "Question", name: "Where does Fixture Test Co operate?", acceptedAnswer: { "@type": "Answer", text: "Fixture Test Co operates in Rivertown and Laketown." } },
      { "@type": "Question", name: "How do I contact Fixture Test Co?", acceptedAnswer: { "@type": "Answer", text: "Contact Fixture Test Co through this website." } },
    ],
  })}</script>
</head>
<body>
  <nav><a href="/">Home</a></nav>
  <h1>Frequently Asked Questions</h1>
  <p>What services does Fixture Test Co offer? Fixture Test Co offers Consulting Service and Support Plan.</p>
</body>
</html>`

const ABOUT = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>About — Fixture Test Co</title>
  <meta name="description" content="About Fixture Test Co, a deterministic fixture business." />
</head>
<body>
  <nav><a href="/">Home</a></nav>
  <h1>About Fixture Test Co</h1>
  <p>Fixture Test Co is a deterministic test fixture used to prove the platform's vertical slice. What makes Fixture Test Co different? Real, first-party structured data and honest, evidence-backed content.</p>
</body>
</html>`

export const FIXTURE_PAGES: Record<string, { status: number; contentType: string; body: string }> = {
  "/robots.txt": { status: 404, contentType: "text/plain", body: "not found" },
  "/sitemap.xml": { status: 404, contentType: "text/plain", body: "not found" },
  "/": { status: 200, contentType: "text/html", body: HOME },
  "/services": { status: 200, contentType: "text/html", body: SERVICES },
  "/faq": { status: 200, contentType: "text/html", body: FAQ },
  "/about": { status: 200, contentType: "text/html", body: ABOUT },
}
