"use client"

/* ================================================================== *
 * UNDERSTAND — the composition.
 *
 * This file does exactly three things and deliberately nothing else:
 * it reads the adapter hooks, it owns the small amount of state that
 * genuinely spans sections (which object is open, what was asked), and
 * it orders the chapters. Every section's own behaviour lives in that
 * section's component, which is what keeps a twelve-part narrative
 * from becoming one unmaintainable page component.
 *
 * The order IS the argument:
 *   what you have → what's in it → what it's about → how it connects
 *   → how it moved → what it asks → what Keeply noticed → find it
 *   → ask it → go past it
 * ================================================================== */

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  useAsk,
  useKnowledgeConcepts,
  useKnowledgeConnections,
  useKnowledgeInsights,
  useKnowledgeObjects,
  useKnowledgeOverview,
  useKnowledgeQuestions,
  useKnowledgeThemes,
  useKnowledgeTimeline,
  useResearch,
  useVoice,
} from "@/lib/knowledge/understand/hooks"
import type {
  KnowledgeConcept,
  KnowledgeInsight,
  KnowledgeObject,
  KnowledgeOverview,
} from "@/lib/knowledge/understand/types"
import { askAboutHref } from "@/lib/knowledge/config"
import { KnowledgeAsk } from "./ask/knowledge-ask"
import { KnowledgeGraph } from "./connections/knowledge-graph"
import { KnowledgeExplorer } from "./explorer/knowledge-explorer"
import { ObjectDetailDrawer } from "./explorer/object-detail-drawer"
import { KnowledgeInsights } from "./insights/knowledge-insights"
import { KnowledgeIntro } from "./intro/knowledge-intro"
import { KnowledgeQuestions } from "./questions/knowledge-questions"
import { KnowledgeResearch } from "./research/knowledge-research"
import { KnowledgeHeader, type ChapterLink } from "./shell/knowledge-header"
import { Chapter } from "./shell/section"
import { KnowledgeSignals } from "./signals/knowledge-signals"
import { KnowledgeThemes } from "./themes/knowledge-themes"
import { KnowledgeTimeline } from "./timeline/knowledge-timeline"
import { KnowledgeVoiceLayer } from "./voice/knowledge-voice-layer"

const CHAPTERS: ChapterLink[] = [
  { id: "signals", label: "Signals" },
  { id: "themes", label: "Themes" },
  { id: "connections", label: "Connections" },
  { id: "timeline", label: "Timeline" },
  { id: "questions", label: "Questions" },
  { id: "insights", label: "Insights" },
  { id: "explorer", label: "Explorer" },
  { id: "ask", label: "Ask" },
  { id: "research", label: "Research" },
]

/**
 * `overview` is resolved on the server when there is a session — the
 * viewer's own counts — and omitted for guests, who get the labelled
 * prototype. Everything else on this page is still sample data, which
 * is why the footer says so per-section rather than for the page as a
 * whole.
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
  const themes = useKnowledgeThemes()
  const concepts = useKnowledgeConcepts(explorer?.concepts)
  const connections = useKnowledgeConnections(explorer?.objects, explorer?.concepts)
  const timeline = useKnowledgeTimeline()
  const questions = useKnowledgeQuestions()
  const insights = useKnowledgeInsights()
  const objects = useKnowledgeObjects(explorer?.objects)

  /* ?concept= is kept in the URL so the filtered view is linkable, but
   * with replaceState rather than a navigation: re-rendering the whole
   * page (and re-running every reveal animation) to narrow a list in
   * place would be the wrong trade. The server reads the same param on
   * a cold load, so a pasted link arrives already filtered. */
  const router = useRouter()
  /** Whether this page is showing the reader their own library. Drives
   *  the one behavioural difference between the prototype and the real
   *  thing: where a question goes. */
  const isLive = overview.data.origin === "live"

  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(initialConceptId)

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

  const ask = useAsk()
  const research = useResearch()
  const voice = useVoice()

  const [openObjectId, setOpenObjectId] = useState<string | null>(null)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const askRef = useRef<HTMLDivElement>(null)
  const researchRef = useRef<HTMLDivElement>(null)

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  /** Every "ask about this" on the page routes HERE — one Ask surface,
   *  reached from many places, rather than an answer rendered wherever
   *  the button happened to be. */
  /* ONE ASK SURFACE, and for a signed-in reader it is the real one.
   *
   * This page's Ask section is part of the prototype: it walks a
   * simulated thinking state and answers from the sample library. That
   * is the right thing to show a visitor with no library — and the
   * wrong thing to show someone who HAS one, because a real, grounded,
   * citing Ask already exists at /knowledge/ai, one click away, and
   * answering them from a fixed sample instead would be the page's
   * only outright lie.
   *
   * So every "ask about this" on the page — a theme, a question card,
   * an insight, the drawer, the Ask field itself — hands a live reader
   * to the real surface with their question already in it. No second
   * RAG, no second answer contract, no second client: askAboutHref is
   * the same link the Reader and Topics have always used. */
  const handleAsk = useCallback(
    (question: string) => {
      if (isLive) {
        router.push(askAboutHref(question))
        return
      }
      ask.submit(question)
      setOpenObjectId(null)
      // Wait a frame so the section has its answer state before we move.
      requestAnimationFrame(() => scrollTo("ask"))
    },
    [ask, isLive, router, scrollTo],
  )

  const handleInsightAction = useCallback(
    (insight: KnowledgeInsight) => {
      // A gap is the one insight whose natural next step leaves the
      // library, so it opens Research pre-filled; everything else is a
      // question about what is already saved.
      if (insight.detail.kind === "knowledge_gap") {
        research.start(`What does ${insight.detail.missing[0]} actually require?`)
        requestAnimationFrame(() => scrollTo("research"))
        return
      }
      handleAsk(insight.headline.endsWith("?") ? insight.headline : `Tell me more: ${insight.headline.toLowerCase()}`)
    },
    [handleAsk, research, scrollTo],
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

  return (
    /* No <main> and no skip link of its own any more: this route now
       renders inside the app shell, which supplies both. Two <main>
       landmarks on one page is a real accessibility fault, not a
       cosmetic one — a screen reader is told the page has two
       primary regions and neither is wrong. */
    <div className="kp-understand">
      <KnowledgeHeader chapters={CHAPTERS} />

      <div>
        <KnowledgeIntro overview={overview.data} onExplore={() => scrollTo("signals")} />

        <KnowledgeSignals overview={overview.data} />

        <Chapter
          id="themes"
          index={1}
          eyebrow="What you're exploring"
          title="Six subjects your library keeps returning to"
          lede="Concepts that appear together often enough to be a subject rather than a coincidence. Size reflects how much of your library each one holds."
        >
          <KnowledgeThemes
            themes={themes.data}
            concepts={concepts.data}
            questions={questions.data}
            onAsk={handleAsk}
          />
        </Chapter>

        <Chapter
          id="connections"
          index={2}
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
          id="timeline"
          index={3}
          eyebrow="How it moved"
          title="What you've been learning, in order"
          lede="Not when you saved things — what changed in what you were reading."
          bleed
        >
          <KnowledgeTimeline events={timeline.data} objects={objects.data} onOpenObject={setOpenObjectId} />
        </Chapter>

        <Chapter
          id="questions"
          index={4}
          eyebrow="What it's asking"
          title="Questions emerging from your knowledge"
          lede="Raised repeatedly across your sources and settled by none of them. These came out of your library; they weren't suggested to it."
        >
          <KnowledgeQuestions questions={questions.data} themes={themes.data} onAsk={handleAsk} />
        </Chapter>

        <Chapter
          id="insights"
          index={5}
          eyebrow="Keeply noticed"
          title="Things you probably haven't spotted"
          lede="Patterns that only appear when the whole library is read at once — a gap, a disagreement, a shift in what you care about."
          bleed
        >
          <KnowledgeInsights insights={insights.data} themes={themes.data} onAction={handleInsightAction} />
        </Chapter>

        <Chapter
          id="explorer"
          index={6}
          eyebrow="Find it"
          title="Everything, plainly"
          lede="The story is over. This is the part where you look something up."
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

        <div ref={askRef}>
          <Chapter
            id="ask"
            index={7}
            eyebrow="Ask"
            title="Ask your knowledge"
            lede="Answered only from what you've saved, with the passages it drew on shown beside it."
            bleed
          >
            <KnowledgeAsk
              ask={ask}
              objects={objects.data}
              concepts={concepts.data}
              onOpenObject={setOpenObjectId}
              onAsk={isLive ? handleAsk : undefined}
            />
          </Chapter>
        </div>

        <div ref={researchRef}>
          <Chapter
            id="research"
            index={8}
            eyebrow="Research"
            title="Go past what you've saved"
            lede="When your library doesn't hold the answer, Keeply looks outward — then shows you the difference between what you already knew and what it found."
            bleed
          >
            <KnowledgeResearch research={research} />
          </Chapter>
        </div>
      </div>

      <footer className="border-t border-[var(--kp-rule)] py-12">
        <div className="mx-auto w-full max-w-[var(--kp-page)] px-[var(--kp-gutter)]">
          <p className="font-[family-name:var(--font-fraunces)] text-[15px]">
            KEEP<span className="text-[var(--kp-accent)]">ly</span> — save anything, understand everything.
          </p>
          <p className="mt-2 max-w-[56ch] text-[12.5px] leading-relaxed text-[var(--kp-ink-faint)]">
            {overview.data.origin === "live" ? (
              <>
                The counts at the top and the Explorer are read from your library. Themes, connections, the timeline,
                questions and insights are still a design prototype drawn from a fixed sample — not from your account.
              </>
            ) : (
              <>
                A design prototype of the Knowledge surface. The figures shown come from a fixed sample library and are
                not read from any account.
              </>
            )}
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

      {voiceOpen && (
        <KnowledgeVoiceLayer
          voice={voice}
          onClose={() => {
            voice.cancel()
            setVoiceOpen(false)
          }}
          onAsk={handleAsk}
        />
      )}
    </div>
  )
}
