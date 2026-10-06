"use client"

/* ================================================================== *
 * DISCOVERY PANEL — the Reader's "Key ideas" and "Related knowledge",
 * filled with real rows for the first time.
 *
 * Both used to be dashed "Soon" placeholders, which was the honest
 * thing to render while the concepts pipeline did not exist. It does
 * now (migration 0010, lib/knowledge/concepts/*), so the slots are
 * replaced rather than decorated — a "Soon" badge over data that has
 * arrived is its own kind of lie.
 *
 * EVERY EMPTY STATE SAYS WHICH EMPTY IT IS. "We have not read this
 * one yet", "nothing else in your library shares these ideas" and
 * "local saves are not analyzed" are three different facts, and
 * collapsing them into one grey sentence would make a working feature
 * look broken (or a broken one look finished). The three states come
 * from the server as `status`; nothing here guesses.
 *
 * The relationship is always shown WITH its reason. `why` is assembled
 * server-side from the shared concept names — never generated — so the
 * sentence under a related item can be checked against the chips
 * beside it.
 * ================================================================== */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { conceptHref } from "@/lib/knowledge/links"
import { fetchRelatedKnowledge } from "@/lib/knowledge/client"
import type { DiscoveryResult, ItemConcept, RelatedKnowledgeItem } from "@/lib/knowledge/discovery-contract"

type Phase = "loading" | "ready" | "error"

/** Host only, for the one line of provenance under a related title.
 *  A related item the reader has not opened yet is easier to place by
 *  where it came from than by its id. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

export function DiscoveryPanel({ itemId }: { itemId: string }) {
  const [result, setResult] = useState<DiscoveryResult | null>(null)
  const [phase, setPhase] = useState<Phase>("loading")
  // Bumped by Retry. Re-running the effect is the whole retry — there
  // is no second code path that could drift from the first.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setPhase("loading")

    fetchRelatedKnowledge(itemId, controller.signal)
      .then((data) => {
        if (!active) return
        setResult(data)
        setPhase("ready")
      })
      .catch((err: unknown) => {
        if (!active) return
        if (err instanceof DOMException && err.name === "AbortError") return
        setPhase("error")
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [itemId, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  if (phase === "loading") {
    return (
      <Block label="Key ideas">
        <p className="flex items-center gap-2">
          <Loader2 className="size-3.5 animate-spin text-[var(--pk-signal)]" aria-hidden /> Reading what this is about…
        </p>
      </Block>
    )
  }

  if (phase === "error" || !result) {
    return (
      <Block label="Key ideas">
        <p>Couldn&apos;t load what we know about this piece.</p>
        <button
          type="button"
          onClick={retry}
          className="mt-2 text-[14px] text-[var(--pk-ink)] underline decoration-[var(--pk-rule-2)] underline-offset-4"
        >
          Try again
        </button>
      </Block>
    )
  }

  if (result.status === "unavailable") {
    return (
      <Block label="Key ideas">
        <p>Saves kept only in this browser aren&apos;t analyzed. Sign in to have Keeply read them.</p>
      </Block>
    )
  }

  if (result.status === "not_analyzed") {
    return (
      <Block label="Key ideas">
        <p>Key ideas will appear here after Keeply reads this one.</p>
      </Block>
    )
  }

  return (
    <>
      <KeyIdeas concepts={result.concepts} />
      <RelatedKnowledge related={result.related} />
    </>
  )
}

/* ── Key ideas ──────────────────────────────────────────────────── */

/* The extractor has always typed what it finds — TOPIC, CONCEPT,
 * ENTITY, TECHNOLOGY, PERSON, ORGANIZATION, PRODUCT — and the type has
 * always been stored. Nothing ever read it, so a person and a subject
 * arrived on screen as identical grey chips.
 *
 * Grouping costs one pass over rows that already exist and no new
 * extraction: "who and what this mentions" is a different question
 * from "what this is about", and they were being answered together. */
const CONCEPT_GROUPS: { heading: string; types: ItemConcept["type"][] }[] = [
  { heading: "Key ideas", types: ["TOPIC", "CONCEPT"] },
  { heading: "People", types: ["PERSON"] },
  { heading: "Organizations", types: ["ORGANIZATION"] },
  { heading: "Technologies & products", types: ["TECHNOLOGY", "PRODUCT"] },
  { heading: "Also mentioned", types: ["ENTITY"] },
]

function KeyIdeas({ concepts }: { concepts: ItemConcept[] }) {
  if (concepts.length === 0) return null
  const groups = CONCEPT_GROUPS.map((g) => ({
    heading: g.heading,
    // Order within a group follows the order the server sent, which is
    // confidence-ranked. No second sort here: re-ranking in a component
    // is a ranking rule nothing tests.
    items: concepts.filter((c) => g.types.includes(c.type)),
  })).filter((g) => g.items.length > 0)

  return (
    <>
      {groups.map((group) => (
        <div key={group.heading} className="mb-7">
          <p className="pk-label mb-2.5">{group.heading}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {group.items.map((c) => (
              <li key={c.id}>
                {/* A CONCEPT IS A DESTINATION, not a label. These chips
                    were text for as long as the concepts existed, which
                    made the one real relationship in the product —
                    item → idea → other items — a dead end at the exact
                    point a reader would follow it.
                    The title is the provenance: a concept is here
                    because passages of this item were cited for it, and
                    the count is the number of those passages. */}
                <Link
                  href={conceptHref(c.id)}
                  className="text-[14px] text-[var(--pk-ink-2)] underline decoration-[var(--pk-rule-2)] underline-offset-4 transition-colors hover:text-[var(--pk-ink)]"
                  title={`${c.evidenceCount} passage${c.evidenceCount === 1 ? "" : "s"} in this piece — see everything about it`}
                >
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

/* ── Related knowledge ──────────────────────────────────────────── */

function RelatedKnowledge({ related }: { related: RelatedKnowledgeItem[] }) {
  if (related.length === 0) {
    return (
      <Block label="Related knowledge">
        <p>Nothing else you&apos;ve saved shares these ideas yet.</p>
      </Block>
    )
  }

  return (
    <div>
      <p className="pk-label mb-2.5">Related knowledge</p>
      <ul className="pk-rows">
        {related.map((r) => {
          const host = hostOf(r.url)
          return (
            <li key={r.id} className="pk-row">
              <Link href={`/knowledge/read/${r.id}`} className="block">
                {host && r.title ? <p className="pk-label">{host}</p> : null}
                <p className="mt-1.5 text-pretty text-[15px] font-medium leading-snug text-[var(--pk-ink)]">
                  {r.title ?? host ?? "Untitled"}
                </p>
                {/* The reason is assembled from stored facts, so it is
                    checkable — it wears the evidence signal, not the
                    generated-content one. */}
                <p className="pk-evidence mt-2 text-pretty text-[13px] leading-[1.6]">{r.why}</p>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ── Shared frame ───────────────────────────────────────────────── */

/** An outcome, stated. These were dashed, tinted boxes — the shape a
 *  UI uses to announce that something is missing, which made three
 *  perfectly ordinary answers ("not read yet", "nothing shares these
 *  ideas") look like defects. A label and a sentence say the same
 *  thing without the alarm. */
function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <p className="pk-label mb-2.5">{label}</p>
      <div className="max-w-[54ch] text-[14px] leading-[1.65] text-[var(--pk-ink-3)]">{children}</div>
    </div>
  )
}
