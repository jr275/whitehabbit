"use client"

/* ================================================================== *
 * UNDERSTAND — what your library actually contains.
 *
 * This page used to have nine chapters. Three read the viewer's real
 * library; four were drawn from a fixed sample (themes, timeline,
 * questions, insights); and two SIMULATED a feature — the Ask section
 * walked a fake thinking delay and returned a pre-written answer, and
 * Research walked a scripted list of stages.
 *
 * The six are gone, and the reason is not length. A product whose
 * single promise is "answers drawn only from what you saved" cannot
 * also ship a screen that performs that promise with canned text, one
 * click from the surface that keeps it. A visitor who is impressed by
 * the fake and then meets the real one has been taught that the
 * product claims more than it does; a visitor who notices it is canned
 * has stopped believing any of it. The sample chapters were milder but
 * did the same work — with a small library they made it look fuller
 * than it was, which is the one thing a knowledge product must never
 * do.
 *
 * What remains is everything the page can say truthfully:
 *
 *   signals      how much you have          (server-resolved counts)
 *   connections  how it links               (derived from your items)
 *   explorer     what is in it              (your objects + concepts)
 *
 * and one link to Ask, which is real. Shorter and true beats long and
 * staged — and when the concepts pipeline has read a library, these
 * three fill up on their own.
 * ================================================================== */

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  useKnowledgeConcepts,
  useKnowledgeConnections,
  useKnowledgeObjects,
  useKnowledgeOverview,
} from "@/lib/knowledge/understand/hooks"
import type { KnowledgeConcept, KnowledgeObject, KnowledgeOverview } from "@/lib/knowledge/understand/types"
import { askAboutHref } from "@/lib/knowledge/config"
import { KnowledgeGraph } from "./connections/knowledge-graph"
import { KnowledgeExplorer } from "./explorer/knowledge-explorer"
import { ObjectDetailDrawer } from "./explorer/object-detail-drawer"
import { KnowledgeIntro } from "./intro/knowledge-intro"
import { KnowledgeHeader, type ChapterLink } from "./shell/knowledge-header"
import { Chapter } from "./shell/section"
import { KnowledgeSignals } from "./signals/knowledge-signals"

const CHAPTERS: ChapterLink[] = [
  { id: "signals", label: "Signals" },
  { id: "connections", label: "Connections" },
  { id: "explorer", label: "Explorer" },
]

/**
 * `overview` is resolved on the server when there is a session — the
 * viewer's own counts — and omitted for guests, who get the labelled
 * sample the Explorer falls back to.
 */
export interface UnderstandProps {
  overview?: KnowledgeOverview | null
  /** The viewer's own concepts and saved items, resolved on the
   *  server. Null means there is nobody to resolve them for (a guest),
   *  and the Explorer falls back to the labelled sample. */
  explorer?: { concepts: KnowledgeConcept[]; objects: KnowledgeObject[]; total: number } | null
  /** A real failure reading the library. NOT the same as an empty
   *  library, and the Explorer renders it differently. */
  explorerError?: boolean
  /** Concept selected by ?concept= in the URL, so a filtered Explorer
   *  is a link that can be sent to someone. */
  initialConceptId?: string | null
}

export function KnowledgeUnderstand({
  overview: liveOverview,
  explorer,
  explorerError = false,
  initialConceptId = null,
}: UnderstandProps = {}) {
  const overview = useKnowledgeOverview(liveOverview)
  const concepts = useKnowledgeConcepts(explorer?.concepts)
  const connections = useKnowledgeConnections(explorer?.objects, explorer?.concepts)
  const objects = useKnowledgeObjects(explorer?.objects)

  const router = useRouter()
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(initialConceptId)
  const [openObjectId, setOpenObjectId] = useState<string | null>(null)

  /* THE URL IS THE SOURCE OF TRUTH ON ARRIVAL, including an arrival by
   * Back. Returning from an item restores the App Router's cached RSC
   * payload for this route, which was rendered before replaceState put
   * ?concept= in the address bar — so the URL said "filtered" and the
   * list said "everything", which is worse than either alone.
   *
   * Reconciling here rather than switching to router.replace keeps the
   * narrow behaviour: no server round trip and no re-run of every
   * reveal animation just to narrow a list in place.
   *
   * An id that is not one of this viewer's own concepts is dropped,
   * exactly as the server drops it — a URL is not authorization, and a
   * phantom filter that matches nothing looks like an empty library. */
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("concept")
    const valid = fromUrl && concepts.data.some((c) => c.id === fromUrl) ? fromUrl : null
    setSelectedConceptId((current) => (current === valid ? current : valid))
  }, [concepts.data])

  const selectConcept = useCallback((conceptId: string | null) => {
    setSelectedConceptId(conceptId)
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    if (conceptId) url.searchParams.set("concept", conceptId)
    else url.searchParams.delete("concept")
    window.history.replaceState(null, "", url)
  }, [])

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  /* EVERY "ask about this" LEAVES FOR THE REAL ASK.
   *
   * There is exactly one answering surface in Keeply and it is
   * /knowledge/ai: real retrieval, real citations, and an honest
   * failure when a provider is not configured. This page used to hold
   * a second one that answered from a fixture. askAboutHref is the
   * same link the Reader and Topics use — no second RAG, no second
   * answer contract, no second client. */
  const handleAsk = useCallback(
    (question: string) => {
      setOpenObjectId(null)
      router.push(askAboutHref(question))
    },
    [router],
  )

  const openObject = useMemo(
    () => objects.data.find((o) => o.id === openObjectId) ?? null,
    [objects.data, openObjectId],
  )

  /** Related = shares at least one concept. Computed here rather than
   *  stored, so it stays true if the objects change. */
  const relatedObjects = useMemo(() => {
    if (!openObject) return []
    return objects.data
      .filter((o) => o.id !== openObject.id && o.conceptIds.some((c) => openObject.conceptIds.includes(c)))
      .sort(
        (a, b) =>
          b.conceptIds.filter((c) => openObject.conceptIds.includes(c)).length -
          a.conceptIds.filter((c) => openObject.conceptIds.includes(c)).length,
      )
      .slice(0, 4)
  }, [openObject, objects.data])

  const isLive = overview.data.origin === "live"

  return (
    /* No <main> and no skip link of its own: this route renders inside
       the app shell, which supplies both. */
    <div className="kp-understand">
      <KnowledgeHeader chapters={CHAPTERS} />

      <div>
        <KnowledgeIntro overview={overview.data} onExplore={() => scrollTo("signals")} />

        <KnowledgeSignals overview={overview.data} />

        <Chapter
          id="connections"
          index={1}
          eyebrow="How it connects"
          title="The ideas that keep showing up together"
          lede="Every line here is a count, not a guess: two concepts are connected when the same saved items discuss both. Select one to see what joins it, and to which pieces."
          bleed
        >
          <KnowledgeGraph
            concepts={concepts.data}
            connections={connections.data}
            objects={objects.data}
            onOpenObject={setOpenObjectId}
          />
        </Chapter>

        <Chapter
          id="explorer"
          index={2}
          eyebrow="Find it"
          title="Everything, plainly"
          lede="The part where you look something up."
          bleed
        >
          <KnowledgeExplorer
            objects={objects.data}
            concepts={concepts.data}
            selectedConceptId={selectedConceptId}
            onSelectConcept={selectConcept}
            total={explorer?.total}
            error={explorerError}
            live={objects.origin === "live"}
            onOpen={setOpenObjectId}
            onAsk={handleAsk}
            onExploreConnections={() => scrollTo("connections")}
          />
        </Chapter>
      </div>

      <footer className="border-t border-[var(--kp-rule)] py-12">
        <div className="mx-auto w-full max-w-[var(--kp-page)] px-[var(--kp-gutter)]">
          <p className="text-[15px] font-semibold tracking-[-0.02em]">Keeply</p>
          {/* One sentence, and it is only needed in the one case where
              the page is not showing the reader their own library. A
              signed-in reader sees their counts, their connections and
              their items — so there is nothing left to disclaim. */}
          <p className="mt-2 max-w-[56ch] text-[12.5px] leading-relaxed text-[var(--kp-ink-faint)]">
            {isLive
              ? "Everything on this page is read from your library."
              : "Signed out, so this shows a fixed sample library rather than an account. Sign in to see your own."}
          </p>
        </div>
      </footer>

      <ObjectDetailDrawer
        object={openObject}
        concepts={concepts.data}
        related={relatedObjects}
        onClose={() => setOpenObjectId(null)}
        onOpenObject={setOpenObjectId}
        onAsk={handleAsk}
        onExploreConnections={() => scrollTo("connections")}
        onSelectConcept={selectConcept}
      />
    </div>
  )
}
