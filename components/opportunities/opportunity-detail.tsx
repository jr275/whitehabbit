"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CircleAlert, Clock3, Sparkles } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import { ScoreComponent } from "./score-badge"
import type { Opportunity } from "@/lib/opportunity/model"

interface GenerateResponse {
  pageBrief: { id: string; recommendedSections: string[]; requiredEvidence: string[] } | null
  agentRunId?: string
  page?: { id: string; status: string; qualityScore: number | null; rejectionReasons: string[] | null }
  error?: string
}

export function OpportunityDetail({ id }: { id: string }) {
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState<GenerateResponse | null>(null)

  async function load() {
    try {
      const res = await fetch(`/api/opportunities/${id}`)
      if (!res.ok) throw new Error("Opportunity not found.")
      const data = await res.json()
      setOpportunity(data.opportunity)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load opportunity.")
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  async function generate() {
    setGenerating(true)
    setGenerateResult(null)
    try {
      const res = await fetch(`/api/opportunities/${id}/generate`, { method: "POST" })
      const data = (await res.json()) as GenerateResponse
      if (!res.ok && !data.error) throw new Error("Generation failed.")
      setGenerateResult(data)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.")
    } finally {
      setGenerating(false)
    }
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-background">
        <WorkforceNav />
        <main className="mx-auto max-w-[900px] px-5 py-8"><div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><CircleAlert className="size-4" /> {error}</div></main>
      </div>
    )
  }
  if (!opportunity) {
    return (
      <div className="min-h-dvh bg-background">
        <WorkforceNav />
        <main className="mx-auto max-w-[900px] px-5 py-8"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" /> Loading…</div></main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main className="mx-auto max-w-[900px] px-5 py-8 sm:px-8">
        <Link href="/opportunities" className="text-xs text-muted-foreground hover:text-foreground">← All opportunities</Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{opportunity.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {opportunity.opportunityType?.replaceAll("_", " ") ?? "programmatic seo"} · {opportunity.targetIntent ?? "no target intent recorded"} · status <strong className="text-foreground">{opportunity.status}</strong>
        </p>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Opportunity score — {opportunity.finalScore ?? "—"}</h2>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ScoreComponent label="Demand" componentKey="demandScore" value={opportunity.demandScore} />
            <ScoreComponent label="Trend" componentKey="trendScore" value={opportunity.trendScore} />
            <ScoreComponent label="Business value" componentKey="businessValueScore" value={opportunity.businessValueScore} />
            <ScoreComponent label="Information gain" componentKey="informationGainScore" value={opportunity.informationGainScore} />
            <ScoreComponent label="Entity coverage" componentKey="entityCoverageScore" value={opportunity.entityCoverageScore} />
            <ScoreComponent label="Competition" componentKey="competitionScore" value={opportunity.competitionScore} />
            <ScoreComponent label="Authority gap" componentKey="authorityGapScore" value={opportunity.authorityGapScore} />
            <ScoreComponent label="Citation potential" componentKey="citationPotentialScore" value={opportunity.citationPotentialScore} />
          </div>
          {opportunity.scoreNotes && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{opportunity.scoreNotes}</p>}
        </section>

        {opportunity.informationGainReasons && opportunity.informationGainReasons.length > 0 && (
          <section className="mt-6 rounded-xl border border-border bg-card p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Information gain reasons</h2>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm text-foreground/90">
              {opportunity.informationGainReasons.map((reason, i) => (
                <li key={i}>• {reason}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Outline</h2>
          <ol className="mt-3 flex flex-col gap-1.5 text-sm text-foreground/90">
            {opportunity.outline.map((section, i) => (
              <li key={i}>{i + 1}. {section}</li>
            ))}
          </ol>
        </section>

        {opportunity.status === "approved" && (
          <section className="mt-6">
            <button
              disabled={generating}
              onClick={generate}
              className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              <Sparkles className="size-4" /> {generating ? "Generating…" : "Generate page"}
            </button>
          </section>
        )}

        {generateResult && (
          <section className="mt-6 rounded-xl border border-border bg-card p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Generation result</h2>
            {generateResult.error ? (
              <p className="mt-3 text-sm text-warn">{generateResult.error}</p>
            ) : generateResult.page ? (
              <>
                <p className="mt-3 text-sm text-foreground">
                  Page status: <strong>{generateResult.page.status}</strong> · Quality score: {generateResult.page.qualityScore ?? "—"}
                </p>
                {generateResult.page.rejectionReasons && (
                  <ul className="mt-2 flex flex-col gap-1 text-xs text-destructive">
                    {generateResult.page.rejectionReasons.map((r, i) => <li key={i}>• {r}</li>)}
                  </ul>
                )}
                <div className="mt-3 flex gap-3 text-xs">
                  <Link href={`/pages/${generateResult.page.id}`} className="text-primary hover:underline">View page →</Link>
                  {generateResult.agentRunId && <Link href={`/agent-runs/${generateResult.agentRunId}`} className="text-primary hover:underline">View agent run →</Link>}
                </div>
              </>
            ) : null}
          </section>
        )}
      </main>
    </div>
  )
}
