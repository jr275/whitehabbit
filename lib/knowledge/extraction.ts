/* ================================================================== *
 * ENTITY EXTRACTION — deterministic, evidence-first (§6, §9). No LLM
 * call: every candidate comes from either (a) real structured data
 * (schema.org JSON-LD the page itself declares) or (b) a real,
 * explainable text heuristic (a literal question-shaped sentence).
 * Nothing here is an LLM's opinion about what the page "probably"
 * means — that keeps extraction reproducible, evidence-first, and
 * usable with zero LLM credential configured (this pipeline's own
 * design goal — see lib/knowledge-profile/builder.ts's identical
 * reasoning).
 *
 * Uses generic schema.org vocabulary only (Organization, Product,
 * Service, Place, Person, Event, FAQPage) — never a vertical-specific
 * ontology (§6: "do NOT hard-code RE/MAX ontology into the core").
 * ================================================================== */

import type { CrawlPage } from "@/lib/crawler/model"

export interface EntityCandidate {
  name: string
  type: string
  description: string | null
  sourceUrl: string
  crawlPageId: string
  confidence: number
  evidence: string
}

type JsonLdNode = Record<string, unknown>

function flattenJsonLd(blocks: unknown[]): JsonLdNode[] {
  const nodes: JsonLdNode[] = []
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue
    const graph = (block as JsonLdNode)["@graph"]
    if (Array.isArray(graph)) {
      nodes.push(...graph.filter((n): n is JsonLdNode => !!n && typeof n === "object"))
    } else {
      nodes.push(block as JsonLdNode)
    }
  }
  return nodes
}

function typeOf(node: JsonLdNode): string[] {
  const t = node["@type"]
  if (typeof t === "string") return [t]
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string")
  return []
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

const QUESTION_WORDS = /^(what|how|why|when|where|who|which|can|does|do|is|are|will|should)\b/i

function extractHeuristicQuestions(page: CrawlPage): EntityCandidate[] {
  if (!page.extractedText) return []
  const sentences = page.extractedText.split(/(?<=\?)\s+/).filter((s) => s.trim().endsWith("?"))
  const candidates: EntityCandidate[] = []
  const seen = new Set<string>()
  for (const raw of sentences) {
    const sentence = raw.trim()
    if (sentence.length < 8 || sentence.length > 200) continue
    if (!QUESTION_WORDS.test(sentence)) continue
    const key = sentence.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({
      name: sentence,
      type: "Question",
      description: null,
      sourceUrl: page.url,
      crawlPageId: page.id,
      confidence: 0.5,
      evidence: `Literal question-shaped sentence found in the page's own text: "${sentence}"`,
    })
    if (candidates.length >= 5) break
  }
  return candidates
}

const STRUCTURED_TYPE_MAP: Record<string, string> = {
  organization: "Organization",
  localbusiness: "Organization",
  corporation: "Organization",
  product: "Product",
  service: "Service",
  person: "Person",
  event: "Event",
}

function extractStructuredCandidates(page: CrawlPage): EntityCandidate[] {
  if (!Array.isArray(page.structuredData) || page.structuredData.length === 0) return []
  const nodes = flattenJsonLd(page.structuredData)
  const candidates: EntityCandidate[] = []

  for (const node of nodes) {
    const types = typeOf(node).map((t) => t.toLowerCase())
    const name = asString(node.name)

    for (const rawType of types) {
      const mapped = STRUCTURED_TYPE_MAP[rawType]
      if (mapped && name) {
        candidates.push({
          name,
          type: mapped,
          description: asString(node.description),
          sourceUrl: page.url,
          crawlPageId: page.id,
          confidence: 0.9,
          evidence: `Structured data (schema.org ${typeOf(node)[0]}) on this page declares "${name}".`,
        })
      }
      if (rawType === "organization" || rawType === "localbusiness") {
        // areaServed -> Place candidates (§8 example: Organization located_in/serves Market)
        const areaServed = node.areaServed
        const areas = Array.isArray(areaServed) ? areaServed : areaServed ? [areaServed] : []
        for (const area of areas) {
          const areaName = typeof area === "string" ? area : asString((area as JsonLdNode)?.name)
          if (areaName) {
            candidates.push({
              name: areaName,
              type: "Place",
              description: null,
              sourceUrl: page.url,
              crawlPageId: page.id,
              confidence: 0.85,
              evidence: `Structured data areaServed on this page declares that "${name ?? "this organization"}" serves "${areaName}".`,
            })
          }
        }
        const address = node.address as JsonLdNode | undefined
        if (address && typeof address === "object") {
          const locality = asString(address.addressLocality)
          const region = asString(address.addressRegion)
          if (locality) {
            candidates.push({
              name: locality,
              type: "Place",
              description: null,
              sourceUrl: page.url,
              crawlPageId: page.id,
              confidence: 0.85,
              evidence: `Structured data address on this page declares addressLocality "${locality}".`,
            })
          }
          if (region) {
            candidates.push({
              name: region,
              type: "Market",
              description: null,
              sourceUrl: page.url,
              crawlPageId: page.id,
              confidence: 0.8,
              evidence: `Structured data address on this page declares addressRegion "${region}".`,
            })
          }
        }
      }
    }

    if (types.includes("faqpage")) {
      const mainEntity = node.mainEntity
      const questions = Array.isArray(mainEntity) ? mainEntity : mainEntity ? [mainEntity] : []
      for (const q of questions) {
        const qNode = q as JsonLdNode
        if (typeOf(qNode).map((t) => t.toLowerCase()).includes("question")) {
          const questionText = asString(qNode.name)
          const answer = qNode.acceptedAnswer as JsonLdNode | undefined
          const answerText = answer ? asString(answer.text) : null
          if (questionText) {
            candidates.push({
              name: questionText,
              type: "Question",
              description: answerText,
              sourceUrl: page.url,
              crawlPageId: page.id,
              confidence: 0.9,
              evidence: `FAQPage structured data on this page poses and answers: "${questionText}"${answerText ? ` — "${answerText}"` : ""}`,
            })
          }
        }
      }
    }
  }
  return candidates
}

/** Per-page grouped candidates — grouping is what lets the ingestion
 * step (lib/knowledge/ingest-from-crawl.ts) infer real relationships
 * (an Organization and a Product declared on the SAME page are a real
 * OFFERS signal; two entities that merely exist on the same site are
 * not). */
export function extractEntityCandidatesByPage(pages: CrawlPage[]): Map<string, EntityCandidate[]> {
  const byPage = new Map<string, EntityCandidate[]>()
  for (const page of pages) {
    if (!page.crawledAt) continue
    const candidates = [...extractStructuredCandidates(page), ...extractHeuristicQuestions(page)]
    if (candidates.length > 0) byPage.set(page.id, candidates)
  }
  return byPage
}
