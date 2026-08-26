/* ================================================================== *
 * INTENT CLASSIFIER (§17, ADR-024) — real, deterministic heuristic
 * classification, the same discipline as lib/content-pipeline/risk.ts's
 * regex-based classifier: never claims to be an ML model, never
 * fabricates a confident answer when the query doesn't match any real
 * pattern (falls back to "informational" at low confidence rather than
 * guessing a specific label).
 * ================================================================== */

export type IntentLabel =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational"
  | "local"
  | "comparison"
  | "problem"
  | "how_to"
  | "definition"
  | "research"
  | "investment"

export interface IntentClassification {
  intent: IntentLabel
  confidence: number
  matchedPattern: string | null
}

/* Ordered most-specific-first — a query matching an earlier pattern
 * short-circuits, since e.g. "how to invest in X" should classify as
 * investment, not how_to, if the investment pattern is checked first. */
const PATTERNS: { intent: IntentLabel; pattern: RegExp; confidence: number }[] = [
  { intent: "investment", pattern: /\b(invest(ing|ment)?|roi|rental yield|cap rate|return on investment)\b/i, confidence: 0.85 },
  { intent: "comparison", pattern: /\b(vs\.?|versus|compared? to|which is better|difference between)\b/i, confidence: 0.85 },
  { intent: "how_to", pattern: /^how (do|can|to)\b/i, confidence: 0.8 },
  { intent: "definition", pattern: /^what (is|are|does)\b|\bdefinition of\b|\bmeaning of\b/i, confidence: 0.8 },
  { intent: "problem", pattern: /\b(fix|broken|not working|issue|problem with|troubleshoot|error)\b/i, confidence: 0.75 },
  { intent: "transactional", pattern: /\b(buy|purchase|price of|cost of|order|book now|hire|for sale|rent)\b/i, confidence: 0.75 },
  { intent: "local", pattern: /\b(near me|in [A-Z][a-z]+|nearby|local)\b/, confidence: 0.7 },
  { intent: "commercial", pattern: /\b(best|top \d+|review(s)?|recommend(ed)?)\b/i, confidence: 0.7 },
  { intent: "research", pattern: /\b(guide|overview|report|statistics|data on|research)\b/i, confidence: 0.6 },
  { intent: "navigational", pattern: /\b(login|sign in|official (site|website)|homepage)\b/i, confidence: 0.8 },
]

export function classifyIntent(queryText: string): IntentClassification {
  for (const { intent, pattern, confidence } of PATTERNS) {
    if (pattern.test(queryText)) return { intent, confidence, matchedPattern: pattern.source }
  }
  // no real pattern matched — the honest default is "informational" at
  // low confidence, never a fabricated specific label (§17, §40).
  return { intent: "informational", confidence: 0.35, matchedPattern: null }
}
