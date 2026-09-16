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
        <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Reading what this is about…
        </p>
      </Block>
    )
  }

  if (phase === "error" || !result) {
    return (
      <Block label="Key ideas">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Couldn&apos;t load what we know about this piece.
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-1.5 rounded-md text-[12px] font-medium text-foreground underline underline-offset-2 hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)]"
        >
          Try again
        </button>
      </Block>
    )
  }

  if (result.status === "unavailable") {
    return (
      <Block label="Key ideas">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Saves kept only in this browser aren&apos;t analyzed. Sign in to have Keeply read them.
        </p>
      </Block>
    )
  }

  if (result.status === "not_analyzed") {
    return (
      <Block label="Key ideas">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Keeply hasn&apos;t read this one yet. Its ideas and anything related will appear here once it has.
        </p>
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
        <div key={group.heading}>
          <p className="text-[12px] font-medium text-foreground/70">{group.heading}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
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
                  className="inline-block rounded-md bg-secondary/60 px-2 py-1 text-xs text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kn-paper)]"
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
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Nothing else you&apos;ve saved shares these ideas yet.
        </p>
      </Block>
    )
  }

  return (
    <div>
      <p className="text-[12px] font-medium text-foreground/70">Related knowledge</p>
      <ul className="mt-2 space-y-2">
        {related.map((r) => {
          const host = hostOf(r.url)
          return (
            <li key={r.id}>
              <Link
                href={`/knowledge/read/${r.id}`}
                className="block rounded-xl border border-[var(--kn-edge)] bg-card px-3.5 py-3 transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kn-paper)]"
              >
                <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
                  {r.title ?? host ?? "Untitled"}
                </p>
                {host && r.title ? <p className="mt-0.5 text-[11px] text-muted-foreground">{host}</p> : null}
                <p className="mt-1.5 text-pretty text-[12px] leading-relaxed text-muted-foreground">{r.why}</p>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ── Shared frame ───────────────────────────────────────────────── */

/** The same quiet card the slots used, minus the "Soon" badge — these
 *  states are outcomes now, not promises. */
function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--kn-edge)] bg-[var(--kn-well)]/40 px-3.5 py-3">
      <p className="text-[12px] font-medium text-foreground/70">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  )
}
