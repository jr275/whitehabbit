/* ================================================================== *
 * PARAGRAPHS — the one way extracted body text becomes readable (and
 * speakable) units.
 *
 * Lifted out of reader-view.tsx unchanged when the Audio surface began
 * reading the same text: two copies of this would let the Reader and
 * the player disagree about where a paragraph ends, which is exactly
 * the kind of drift that makes "resume where I left off" wrong.
 *
 * The stored body is flattened plain text — the extractor deliberately
 * drops markup — so newlines are the honest maximum structure there is.
 * ================================================================== */

export function toParagraphs(text: string): string[] {
  return text
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}
