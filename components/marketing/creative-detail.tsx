"use client"

/* ================================================================== *
 * CREATIVE DETAIL — section 14/18. "I am looking inside the brain and
 * production process of my marketing department." Every section here
 * reads real, already-persisted data (the concept's own real LLM
 * output, the opportunity/signals that triggered it, real execution
 * metadata) — Production/Performance/Business Impact are honestly
 * "Not connected" since no real provider exists yet, never simulated
 * to look complete.
 * ================================================================== */

import { X } from "lucide-react"
import { Plug } from "lucide-react"
import { ProvenanceBadge } from "@/components/outputs/provenance-badge"
import { ProvenanceGraph } from "@/components/outputs/provenance-graph"
import type { CreativeConcept, CreativeOpportunity, IntelligenceSignal } from "@/lib/marketing/model"
import type { Worker, WorkerExecution } from "@/lib/workforce/model"
import { timeOfDay } from "@/lib/workforce/selectors"

export function CreativeDetail({
  concept,
  opportunity,
  signals,
  worker,
  execution,
  outputId,
  isDemo,
  onClose,
}: {
  concept: CreativeConcept
  opportunity?: CreativeOpportunity
  signals: IntelligenceSignal[]
  worker: Worker
  execution?: WorkerExecution
  outputId?: string
  isDemo: boolean
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{worker.identity.name}</p>
            <h2 className="truncate text-[15px] font-semibold text-foreground">{concept.title}</h2>
          </div>
          <ProvenanceBadge provenance={isDemo ? "demo" : "real"} />
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="thin-scroll-light flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <Meta label="Platform" value={concept.platform} />
            <Meta label="Duration" value={concept.duration} />
            <Meta label="Territory" value={concept.emotionalIntent} />
          </div>

          {/* provenance trace — section 6/12/18 */}
          <div className="mt-4">
            <SectionLabel>Trace — where this came from</SectionLabel>
            <div id="md-graph" className="rounded-lg border border-border bg-secondary/20 p-3">
              <ProvenanceGraph
                nodes={[
                  { key: "signal", label: "Signals", id: signals[0]?.id, anchorId: signals.length ? "md-why-now" : undefined },
                  { key: "opportunity", label: "Opportunity", id: opportunity?.id, anchorId: opportunity ? "md-opportunity" : undefined },
                  { key: "creative", label: "Creative concept", id: concept.id, anchorId: "md-thesis" },
                  { key: "production", label: "Production", id: undefined, anchorId: "md-production" },
                  { key: "performance", label: "Performance", id: undefined, anchorId: "md-performance" },
                ]}
              />
            </div>
          </div>

          {opportunity && (
            <div id="md-opportunity" className="mt-5">
              <SectionLabel>Why this was created</SectionLabel>
              <div className="rounded-lg border border-border bg-card p-3.5">
                <p className="text-[13px] font-medium text-foreground">{opportunity.topic}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{opportunity.rationale}</p>
                <div className="mt-2.5 grid grid-cols-4 gap-2">
                  <Score label="Opportunity" value={opportunity.opportunityScore} />
                  <Score label="Brand fit" value={opportunity.brandRelevance} />
                  <Score label="Audience fit" value={opportunity.audienceRelevance} />
                  <Score label="Novelty" value={opportunity.novelty} />
                </div>
              </div>
            </div>
          )}

          {signals.length > 0 && (
            <div id="md-why-now" className="mt-5">
              <SectionLabel>Why now — real signals</SectionLabel>
              <ul className="flex flex-col gap-1.5">
                {signals.map((s) => (
                  <li key={s.id} className="rounded-lg border border-border bg-card px-3 py-2">
                    <p className="text-[12px] font-medium text-foreground">{s.topic}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      velocity {s.velocity} · acceleration {s.acceleration} · novelty {s.novelty} · confidence {s.confidence}%
                    </p>
                    {s.sourceUrl && (
                      <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-[11px] text-primary hover:underline">
                        {s.sourceUrl}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div id="md-thesis" className="mt-5">
            <SectionLabel>Creative thesis</SectionLabel>
            <p className="rounded-lg border border-border bg-card px-3.5 py-3 text-[13px] leading-relaxed text-foreground">{concept.thesis}</p>
          </div>

          <div className="mt-5">
            <SectionLabel>Story</SectionLabel>
            <div className="rounded-lg border border-border bg-card p-3.5">
              <p className="text-[11.5px] leading-relaxed text-foreground">
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Hook </span>
                {concept.hook}
              </p>
              <p className="mt-2 text-[11.5px] leading-relaxed text-foreground">{concept.story}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
                <Meta label="World" value={concept.world} />
                <Meta label="Camera" value={concept.cameraLanguage} />
                <Meta label="Brand role" value={concept.brandRole} />
                <Meta label="Product role" value={concept.productRole} />
                <Meta label="Visual style" value={concept.visualStyle} />
                <Meta label="Audience" value={concept.audience} />
              </div>
              {concept.characters.length > 0 && (
                <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                  <span className="font-mono text-[9px] uppercase tracking-wider">Characters </span>
                  {concept.characters.join(", ")}
                </p>
              )}
              <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                <span className="font-mono text-[9px] uppercase tracking-wider">CTA </span>
                {concept.cta}
              </p>
            </div>
          </div>

          <div id="md-production" className="mt-5">
            <SectionLabel>Production</SectionLabel>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/20 px-3.5 py-3">
              <Plug className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                No production provider connected — this concept stays at the concept stage. Connect Google Flow/Veo or another production provider to generate an actual video.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <SectionLabel>Output</SectionLabel>
            <p className="rounded-lg border border-border bg-card px-3.5 py-3 text-[12px] leading-relaxed text-muted-foreground">
              The real, structured creative concept above is this execution&apos;s output — no video/image output exists yet because no production provider is connected.
            </p>
          </div>

          <div id="md-performance" className="mt-5">
            <SectionLabel>Performance</SectionLabel>
            <NotConnected reason="Connect a distribution/ads platform to measure impressions, views, completion rate, and CTR for this creative." />
          </div>

          <div className="mt-5">
            <SectionLabel>Business impact</SectionLabel>
            <NotConnected reason="Connect an ads/CRM platform to measure revenue, ROAS and pipeline influenced by this creative." />
          </div>

          <div className="mt-5">
            <SectionLabel>Recommendation</SectionLabel>
            <p className="rounded-lg border border-border bg-primary/5 px-3.5 py-3 text-[12px] leading-relaxed text-foreground">
              {opportunity?.status === "open"
                ? "Review this territory and connect a production provider to move it into production."
                : "Review this territory for brand fit before moving it forward."}
            </p>
          </div>

          <div className="mt-5">
            <SectionLabel>Execution metadata</SectionLabel>
            <dl className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {execution && <MetaRow k="Execution" v={execution.id} />}
              {outputId && <MetaRow k="Output" v={outputId} />}
              {execution && <MetaRow k="Timestamp" v={timeOfDay(execution.startedAt)} />}
              {isDemo && <MetaRow k="Mode" v="Development simulation — no external LLM was called" />}
            </dl>
          </div>
        </div>
      </div>
    </>
  )
}

function NotConnected({ reason }: { reason: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/20 px-3.5 py-3">
      <Plug className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">{reason}</p>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{children}</div>
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-foreground">{value || "—"}</p>
    </div>
  )
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 px-2 py-1.5">
      <p className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[8.5px] text-muted-foreground">{label}</p>
    </div>
  )
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="shrink-0 text-[11.5px] text-muted-foreground">{k}</dt>
      <dd className="truncate text-right font-mono text-[11px] text-foreground">{v}</dd>
    </div>
  )
}
