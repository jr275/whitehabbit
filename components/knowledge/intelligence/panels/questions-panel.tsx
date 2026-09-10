"use client"

import { HelpCircle, Sparkles } from "lucide-react"
import Link from "next/link"
import { askAboutHref } from "@/lib/knowledge/config"
import { intelligence } from "@/lib/knowledge/intelligence/client"
import { useEnvelope } from "@/lib/knowledge/intelligence/use-intelligence"
import { ConfidenceMeter, PanelError, PanelHeading, PanelSkeleton } from "../shared"

export function QuestionsPanel() {
  const { data, provenance, isLoading, error } = useEnvelope("questions", intelligence.getQuestions)

  if (isLoading) return <PanelSkeleton rows={3} />
  if (error) return <PanelError message={error.message} />
  if (!data) return null

  return (
    <div>
      <PanelHeading
        title="Emerging questions"
        hint="Open threads your library implies but hasn't resolved. Ask any of them for real."
        provenance={provenance}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        {data.map((q) => (
          <div key={q.id} className="flex flex-col gap-4 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-6">
            <div className="flex items-start gap-3">
              <HelpCircle className="mt-0.5 size-5 shrink-0 text-[var(--kn-ai)]" />
              <h3 className="text-balance font-serif text-xl font-medium leading-snug tracking-tight text-foreground">
                {q.question}
              </h3>
            </div>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">{q.rationale}</p>
            <div className="mt-auto flex items-center justify-between gap-3 pt-1">
              <ConfidenceMeter value={q.confidence} />
              <Link
                href={askAboutHref(q.suggestedAsk)}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-1.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kn-ai)]"
              >
                <Sparkles className="size-3.5" /> Ask this
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
