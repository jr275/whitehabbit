/* ================================================================== *
 * KNOWLEDGE — an honest Coming-soon page. There is no cross-Agent
 * knowledge backend today (no aggregate index, no API listing
 * knowledge sources across every Worker in an org) — a knowledge
 * source (lib/workforce/model.ts's KnowledgeSource) is configured
 * per-Agent, inside Studio's own Knowledge build step
 * (components/studio/build-panel.tsx's KnowledgeStep). This page
 * never fabricates an aggregate view; it shows the real, static
 * KNOWLEDGE_TEMPLATES catalog Studio's own "Connect knowledge" quick-
 * add buttons already use, as a preview of what's configurable today,
 * and links out to where it's actually done. Server component — no
 * client state needed (no interactivity beyond a Link).
 * ================================================================== */

import { BookOpen } from "lucide-react"
import Link from "next/link"
import { KNOWLEDGE_TEMPLATES } from "@/lib/workforce/catalog"

export function KnowledgePage() {
  return (
    <div className="mx-auto max-w-[900px] px-5 py-10 sm:px-8">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Coming soon</p>
      <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">Knowledge</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
        A cross-Agent Knowledge Hub is coming — a single place to see and manage every knowledge source across your whole workforce. For now, knowledge sources are configured per Agent, in Studio.
      </p>

      <div className="mt-8 rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary/60 text-muted-foreground">
          <BookOpen className="h-4 w-4" />
        </span>
        <p className="mt-4 text-[15px] font-medium text-foreground">Aggregate view not built yet</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          Open any Agent in Studio and go to the Knowledge step to add sources today.
        </p>
      </div>

      <h2 className="mt-10 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Available knowledge templates</h2>
      <p className="mt-1.5 text-[12.5px] text-muted-foreground">The same quick-add templates Studio&apos;s Knowledge step offers — pick one from there to attach it to a specific Agent.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {KNOWLEDGE_TEMPLATES.map((t) => (
          <div key={t.name} className="rounded-lg border border-border bg-card px-3.5 py-2.5">
            <p className="text-[13px] font-medium text-foreground">{t.name}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{t.type}</p>
          </div>
        ))}
      </div>

      <Link href="/studio" className="mt-8 inline-block text-[13px] font-medium text-primary hover:underline">
        Open Studio →
      </Link>
    </div>
  )
}
