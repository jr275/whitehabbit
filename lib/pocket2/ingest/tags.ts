import "server-only"

/* ================================================================== *
 * TAG SUGGESTION — deterministic v1.
 *
 * No model, no API call, no cost, no latency: a small vocabulary
 * matched against the title, description and opening of the article.
 * That is a real, useful feature today, and it is the ONE function
 * Phase 7's AI tagging replaces — everything around it (the
 * saved_item_tags.source column that distinguishes 'auto' from
 * 'user', the tag upsert, the UI) already works and does not change.
 *
 * Suggestions are always written with source='auto' so a machine
 * guess is never indistinguishable from a label the person chose,
 * and so a future re-run can revise its own suggestions without
 * touching theirs.
 * ================================================================== */

/** Deliberately small and general. A vocabulary that tries to cover
 * everything produces noise on every save; these are the categories a
 * personal library actually sorts by. Each entry is
 * canonical tag -> the phrases that imply it. */
const VOCABULARY: Record<string, string[]> = {
  ai: ["artificial intelligence", "machine learning", "neural network", "llm", "large language model", "deep learning", "generative ai", "transformer model"],
  design: ["design system", "typography", "user interface", "ux ", "usability", "figma", "visual design"],
  engineering: ["software engineering", "codebase", "refactor", "compiler", "distributed system", "database", "kubernetes", "api design"],
  security: ["vulnerability", "exploit", "encryption", "authentication", "zero-day", "phishing", "ransomware", "cybersecurity"],
  startups: ["startup", "founder", "venture capital", "seed round", "product market fit", "bootstrapped"],
  business: ["revenue", "profit margin", "acquisition", "quarterly earnings", "market share", "b2b", "saas"],
  science: ["research paper", "study found", "peer review", "clinical trial", "experiment", "physics", "biology"],
  health: ["nutrition", "exercise", "sleep", "mental health", "medicine", "diet"],
  productivity: ["productivity", "workflow", "note-taking", "time management", "focus", "habit"],
  climate: ["climate change", "emissions", "renewable energy", "carbon", "sustainability"],
  finance: ["interest rate", "inflation", "investment", "portfolio", "stock market", "economy"],
  culture: ["film", "novel", "museum", "album", "literature", "art history"],
  politics: ["election", "parliament", "legislation", "policy", "senate", "government"],
}

/** Domains whose every save is reliably one thing. Kept short for the
 * same reason as the host classifier: a long hardcoded list ages badly. */
const DOMAIN_TAGS: { pattern: RegExp; tag: string }[] = [
  { pattern: /(^|\.)arxiv\.org$/i, tag: "research" },
  { pattern: /(^|\.)github\.com$/i, tag: "code" },
  { pattern: /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/i, tag: "video" },
  { pattern: /(^|\.)(substack\.com|medium\.com)$/i, tag: "newsletter" },
  { pattern: /(^|\.)(wikipedia\.org)$/i, tag: "reference" },
]

const MAX_SUGGESTIONS = 4

export interface TagSuggestionInput {
  title?: string | null
  description?: string | null
  articleText?: string | null
  domain: string
}

/**
 * Suggest tags for a saved item.
 *
 * Conservative by design: it would rather return nothing than fill
 * someone's library with tags they did not ask for and now have to
 * delete. A single incidental mention is not evidence — a phrase must
 * appear in the title/description, or at least twice in the body.
 */
export function suggestTags(input: TagSuggestionInput): string[] {
  const headline = `${input.title ?? ""} ${input.description ?? ""}`.toLowerCase()
  // Bounded: scoring is linear in this length, and it runs inside a
  // job that should stay predictable on a 5 MB page.
  const body = (input.articleText ?? "").slice(0, 20_000).toLowerCase()

  const scored: { tag: string; score: number }[] = []

  for (const [tag, phrases] of Object.entries(VOCABULARY)) {
    let score = 0
    for (const phrase of phrases) {
      if (headline.includes(phrase)) score += 3
      else {
        // count, capped — a page that repeats a phrase 400 times is
        // not 400 times more about it
        let count = 0
        let index = body.indexOf(phrase)
        while (index !== -1 && count < 3) {
          count++
          index = body.indexOf(phrase, index + phrase.length)
        }
        if (count >= 2) score += 2
      }
    }
    if (score >= 3) scored.push({ tag, score })
  }

  scored.sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
  const tags = scored.slice(0, MAX_SUGGESTIONS).map((entry) => entry.tag)

  for (const { pattern, tag } of DOMAIN_TAGS) {
    if (pattern.test(input.domain) && !tags.includes(tag)) tags.push(tag)
  }

  return tags.slice(0, MAX_SUGGESTIONS)
}
