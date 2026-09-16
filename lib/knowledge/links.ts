/* ================================================================== *
 * KNOWLEDGE LINKS — the URLs one surface uses to reach another.
 *
 * Plain string builders with no imports, deliberately. They used to
 * live in config.ts alongside the navigation, which pulls in icon
 * components — so the one part of that file worth unit-testing could
 * not be imported by a test at all. Kept here, they are provable.
 *
 * ONE BUILDER PER DESTINATION. A concept is shown in the Reader, in
 * the Explorer's rail, on its rows and in its drawer; a question can
 * be asked from a topic, a card, an insight and the home page. Every
 * one of those is a chance for a query key or a hash to drift, and
 * that failure is silent: the filter applies, the page never scrolls
 * to it, and the feature looks broken while working.
 *
 * config.ts re-exports these, so callers that already import from
 * there keep working.
 * ================================================================== */

/** The one Ask surface, reached from many places, with the question
 *  already in it. */
export function askAboutHref(question: string): string {
  return `/knowledge/ai?q=${encodeURIComponent(question)}`
}

/**
 * Where a concept leads: the Explorer, filtered to it.
 *
 * The hash matters as much as the query. /knowledge opens on an
 * editorial intro, so a link that filtered the Explorer without
 * scrolling to it would land someone on a page that looks unchanged.
 *
 * Takes the PERSISTED concept id, never a name. Names are not unique,
 * do not survive a re-extraction, and would make the URL a lookup
 * rather than a reference. The id is also not authorization: the page
 * validates it against the viewer's own concepts and drops anything
 * else — see app/knowledge/page.tsx.
 */
export function conceptHref(conceptId: string): string {
  return `/knowledge?concept=${encodeURIComponent(conceptId)}#explorer`
}

/** The question a concept asks of the library. Deterministic, phrased
 *  from the stored name — no model is consulted to turn a concept into
 *  a question. */
export function askAboutConceptHref(conceptLabel: string): string {
  return askAboutHref(`What do I know about “${conceptLabel}”?`)
}

/** A topic's own name is the query that finds its items: searchItems
 *  already matches an item's tags, so this needs no tag-filter
 *  endpoint and no second retrieval path. */
export function topicItemsHref(topicLabel: string): string {
  return `/knowledge/library?q=${encodeURIComponent(topicLabel)}`
}
