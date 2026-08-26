/* ================================================================== *
 * WEBSITE KNOWLEDGE PROFILE BUILDER — a deterministic, explainable
 * heuristic analysis of a completed crawl. No LLM call: every field is
 * computed from real, observable signals (crawled text, URLs, JSON-LD,
 * headers), so the same crawl always produces the same profile and the
 * pipeline never depends on an LLM credential being configured (§5:
 * "do not make unsupported assumptions" — a low-confidence heuristic
 * is more honest here than an unverifiable LLM opinion).
 * ================================================================== */

import type { CrawlPage } from "@/lib/crawler/model"
import type { WebsiteKnowledgeProfileConfidence, WebsiteKnowledgeProfileFields } from "./model"

interface VerticalSignature {
  vertical: string
  keywords: string[]
}

/* Small, intentionally generic keyword sets — enough to distinguish a
 * handful of common verticals for the vertical-slice proof (§77 requires
 * the platform work across verticals, not that this heuristic recognize
 * every one). A real deployment can extend this list; it is not an
 * ontology definition (§3's entity_type stays free text regardless). */
const VERTICAL_SIGNATURES: VerticalSignature[] = [
  { vertical: "real_estate", keywords: ["property", "properties", "listing", "real estate", "condominium", "square feet", "bedroom", "for sale", "realtor", "neighborhood"] },
  { vertical: "travel", keywords: ["hotel", "flight", "booking", "itinerary", "destination", "resort", "vacation", "travel", "tour", "accommodation"] },
  { vertical: "saas", keywords: ["pricing", "api", "dashboard", "integration", "subscription", "free trial", "workspace", "onboarding", "sign up", "features"] },
  { vertical: "education", keywords: ["course", "curriculum", "student", "enrollment", "tuition", "degree", "campus", "faculty", "syllabus", "lecture"] },
  { vertical: "local_business", keywords: ["hours", "menu", "appointment", "location", "contact us", "reviews", "directions", "services", "walk-in", "family owned"] },
  { vertical: "finance", keywords: ["investment", "portfolio", "interest rate", "loan", "credit", "retirement", "insurance", "mortgage", "financial advisor"] },
  { vertical: "healthcare", keywords: ["patient", "clinic", "diagnosis", "treatment", "physician", "appointment", "insurance accepted", "symptoms", "healthcare"] },
]

function countKeywordHits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase()
  let hits = 0
  for (const kw of keywords) {
    if (lower.includes(kw)) hits += 1
  }
  return hits
}

function classifyArchetype(url: string, title: string | null, wordCount: number | null): string {
  let path: string
  try {
    path = new URL(url).pathname.toLowerCase()
  } catch {
    path = ""
  }
  if (path === "" || path === "/") return "home"
  if (/\b(faq|frequently-asked)/i.test(path) || (title ?? "").toLowerCase().includes("faq")) return "faq"
  if (/\/(contact)/i.test(path)) return "contact"
  if (/\/(about)/i.test(path)) return "about"
  if (/\/(blog|articles?|news|guides?)\//i.test(path) || /\/(blog|articles?|news)$/i.test(path)) return "article"
  if ((wordCount ?? 0) < 80) return "thin"
  return "other"
}

function firstPathSegment(url: string): string | null {
  try {
    const path = new URL(url).pathname.split("/").filter(Boolean)
    return path[0] ?? null
  } catch {
    return null
  }
}

function mostCommonLanguage(pages: CrawlPage[]): { language: string | null; confidence: number } {
  const counts = new Map<string, number>()
  for (const p of pages) {
    if (p.language) counts.set(p.language, (counts.get(p.language) ?? 0) + 1)
  }
  if (counts.size === 0) return { language: null, confidence: 0 }
  const [best, bestCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return { language: best, confidence: bestCount / pages.length }
}

const COUNTRY_TLDS: Record<string, string> = {
  br: "Brazil", uk: "United Kingdom", de: "Germany", fr: "France", ca: "Canada",
  au: "Australia", in: "India", jp: "Japan", mx: "Mexico", es: "Spain", it: "Italy",
  pt: "Portugal", nl: "Netherlands",
}

export function buildKnowledgeProfile(input: {
  hostname: string
  pages: CrawlPage[]
  entityCandidates: { type: string; name: string; confidence: number }[]
  hasRobotsTxt: boolean
  hasSitemap: boolean
  /** anchor text of the homepage's own outbound internal links — a real
   * proxy for primary navigation labels, approximated from the crawl
   * graph rather than the rendered nav DOM (no browser rendering here). */
  homepageAnchorTexts: string[]
}): { profile: WebsiteKnowledgeProfileFields; confidence: WebsiteKnowledgeProfileConfidence } {
  const { hostname, pages, entityCandidates, hasRobotsTxt, hasSitemap, homepageAnchorTexts } = input
  const crawledPages = pages.filter((p) => p.crawledAt)
  const aggregatedText = crawledPages.map((p) => `${p.title ?? ""} ${p.description ?? ""} ${p.extractedText ?? ""}`).join(" ")

  // vertical detection
  let bestVertical: VerticalSignature | null = null
  let bestScore = 0
  for (const sig of VERTICAL_SIGNATURES) {
    const score = countKeywordHits(aggregatedText, sig.keywords)
    if (score > bestScore) {
      bestScore = score
      bestVertical = sig
    }
  }
  const verticalConfidence = bestVertical ? Math.min(1, bestScore / 4) : 0

  // business model — very coarse heuristic: presence of pricing/subscription
  // language suggests B2B SaaS-like; presence of "add to cart"/"buy now"
  // suggests ecommerce; presence of "contact us for a quote" suggests
  // service business. Kept intentionally coarse and low-confidence.
  const lower = aggregatedText.toLowerCase()
  let businessModel: string | null = null
  let businessModelConfidence = 0
  if (lower.includes("add to cart") || lower.includes("buy now") || lower.includes("checkout")) {
    businessModel = "ecommerce"
    businessModelConfidence = 0.5
  } else if (lower.includes("subscription") || lower.includes("free trial") || lower.includes("pricing")) {
    businessModel = "subscription"
    businessModelConfidence = 0.4
  } else if (lower.includes("request a quote") || lower.includes("contact us") || lower.includes("get a quote")) {
    businessModel = "service"
    businessModelConfidence = 0.3
  }

  const entityTypes = [...new Set(entityCandidates.map((e) => e.type))]
  const byType = (type: string) => entityCandidates.filter((e) => e.type === type).map((e) => e.name)
  const markets = [...new Set(byType("Market").concat(byType("Place")))]
  const roles = [...new Set(byType("Role").concat(byType("Person")))]
  const products = [...new Set(byType("Product").concat(byType("Service")))]

  const archetypeCounts: Record<string, number> = {}
  for (const p of crawledPages) {
    const archetype = classifyArchetype(p.url, p.title, p.wordCount)
    archetypeCounts[archetype] = (archetypeCounts[archetype] ?? 0) + 1
  }
  const contentTypes = Object.keys(archetypeCounts).filter((k) => k !== "thin" && k !== "other")

  const taxonomy = [...new Set(crawledPages.map((p) => firstPathSegment(p.url)).filter((s): s is string => !!s))].slice(0, 20)

  const navigationLabels = [...new Set(homepageAnchorTexts.map((t) => t.trim()).filter((t) => t.length > 0 && t.length <= 40))].slice(0, 15)

  const schemaTypes = [
    ...new Set(
      crawledPages.flatMap((p) => (Array.isArray(p.structuredData) ? p.structuredData : []).map((block) => (block as { "@type"?: string })?.["@type"]).filter((t): t is string => !!t)),
    ),
  ]

  const { language, confidence: languageConfidence } = mostCommonLanguage(crawledPages)
  const tld = hostname.split(".").pop() ?? ""
  const country = COUNTRY_TLDS[tld] ?? null

  const withTitle = crawledPages.filter((p) => p.title).length
  const withDescription = crawledPages.filter((p) => p.description).length
  const withCanonical = crawledPages.filter((p) => p.canonicalUrl).length
  const withStructuredData = crawledPages.filter((p) => Array.isArray(p.structuredData) && p.structuredData.length > 0).length
  const totalWords = crawledPages.reduce((sum, p) => sum + (p.wordCount ?? 0), 0)

  const profile: WebsiteKnowledgeProfileFields = {
    sitePurpose: bestVertical ? `Appears to operate in the ${bestVertical.vertical.replace("_", " ")} space, based on ${bestScore} matched real content signals.` : null,
    detectedVertical: bestVertical?.vertical ?? null,
    detectedBusinessModel: businessModel,
    primaryEntityTypes: entityTypes,
    markets,
    roles,
    productsOrServices: products,
    contentTypes,
    pageArchetypes: archetypeCounts,
    taxonomy,
    navigationLabels,
    schemaTypes,
    language,
    country,
    domainSignals: {
      hostname,
      hasRobotsTxt,
      hasSitemap,
      pagesCrawled: crawledPages.length,
      httpsUsed: crawledPages.some((p) => p.url.startsWith("https://")),
    },
    existingSeoStructure: {
      pagesWithTitle: withTitle,
      pagesWithDescription: withDescription,
      pagesWithCanonical: withCanonical,
      pagesWithStructuredData: withStructuredData,
      averageWordCount: crawledPages.length ? Math.round(totalWords / crawledPages.length) : 0,
    },
  }

  const confidence: WebsiteKnowledgeProfileConfidence = {
    sitePurpose: verticalConfidence,
    detectedVertical: verticalConfidence,
    detectedBusinessModel: businessModelConfidence,
    primaryEntityTypes: entityCandidates.length ? 0.7 : 0,
    markets: markets.length ? 0.6 : 0,
    roles: roles.length ? 0.5 : 0,
    productsOrServices: products.length ? 0.6 : 0,
    contentTypes: 0.7,
    pageArchetypes: 1,
    taxonomy: 0.6,
    navigationLabels: navigationLabels.length ? 0.5 : 0,
    schemaTypes: 1,
    language: languageConfidence,
    country: country ? 0.5 : 0,
    domainSignals: 1,
    existingSeoStructure: 1,
  }

  return { profile, confidence }
}
