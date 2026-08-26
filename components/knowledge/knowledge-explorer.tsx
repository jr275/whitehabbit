"use client"

/* Knowledge Graph UI (§29) — real, persisted entities only. Search is
 * client-side over an already-fetched (bounded, <=200) entity list;
 * selecting an entity progressively loads its relationships/evidence/
 * opportunities via a dedicated request, rather than loading the
 * entire graph up front. */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { WorkforceNav } from "@/components/workforce/nav"
import type { Entity, EntityEvidence, EntityRelationship } from "@/lib/knowledge/model"

interface EntityDetail {
  entity: Entity
  relationships: EntityRelationship[]
  relatedEntities: { id: string; name: string; entity_type: string }[]
  evidence: EntityEvidence[]
  opportunities: { id: string; title: string; status: string; finalScore: number | null }[]
}

export function KnowledgeExplorer() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<EntityDetail | null>(null)

  useEffect(() => {
    fetch("/api/knowledge/entities")
      .then((res) => res.json())
      .then((data) => setEntities(data.entities))
      .catch(() => setEntities([]))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setDetail(null)
    fetch(`/api/knowledge/entities/${selectedId}`)
      .then((res) => res.json())
      .then(setDetail)
      .catch(() => setDetail(null))
  }, [selectedId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entities
    return entities.filter((e) => e.name.toLowerCase().includes(q) || e.entityType.toLowerCase().includes(q))
  }, [entities, query])

  return (
    <div className="min-h-dvh bg-background bg-substrate">
      <WorkforceNav />
      <main className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Knowledge Graph</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground">Entities</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Real entities extracted and resolved from your connected websites — never mock graph data.</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search entities…"
                className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <ul className="mt-3 flex max-h-[600px] flex-col gap-1 overflow-y-auto">
              {filtered.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => setSelectedId(e.id)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${selectedId === e.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}
                  >
                    <span className="truncate">{e.name}</span>
                    <span className="ml-2 shrink-0 font-mono text-[9px] uppercase text-muted-foreground">{e.entityType}</span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No entities yet — run website discovery.</li>}
            </ul>
          </div>

          <div>
            {!selectedId ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-border bg-card p-10 text-sm text-muted-foreground">Select an entity to inspect it.</div>
            ) : !detail ? (
              <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading…</div>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="rounded-xl border border-border bg-card p-5">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">{detail.entity.entityType}</span>
                  <h2 className="mt-1 text-2xl font-semibold text-foreground">{detail.entity.name}</h2>
                  {detail.entity.canonicalEntityId && <p className="mt-1 text-xs text-warn">Merged into another canonical entity.</p>}
                </div>

                <section className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Relationships ({detail.relationships.length})</h3>
                  <ul className="mt-3 flex flex-col gap-1.5 text-sm text-foreground/90">
                    {detail.relationships.map((r) => {
                      const otherId = r.sourceEntityId === detail.entity.id ? r.targetEntityId : r.sourceEntityId
                      const other = detail.relatedEntities.find((e) => e.id === otherId)
                      return (
                        <li key={r.id}>
                          {r.relationshipType} — <button className="text-primary hover:underline" onClick={() => setSelectedId(otherId)}>{other?.name ?? otherId}</button>
                          {r.confidence != null && <span className="ml-2 text-xs text-muted-foreground">confidence {Math.round(r.confidence * 100)}%</span>}
                        </li>
                      )
                    })}
                    {detail.relationships.length === 0 && <li className="text-muted-foreground">No relationships recorded.</li>}
                  </ul>
                </section>

                <section className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Evidence / source pages ({detail.evidence.length})</h3>
                  <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground/90">
                    {detail.evidence.map((ev) => (
                      <li key={ev.id} className="border-b border-border pb-2 last:border-0">
                        <p>{ev.fact}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {ev.verificationStatus} · {ev.sourceUrl ? <a href={ev.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{ev.sourceUrl}</a> : "no source URL"}
                        </p>
                      </li>
                    ))}
                    {detail.evidence.length === 0 && <li className="text-muted-foreground">No evidence recorded.</li>}
                  </ul>
                </section>

                <section className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Opportunities ({detail.opportunities.length})</h3>
                  <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                    {detail.opportunities.map((o) => (
                      <li key={o.id}>
                        <Link href={`/opportunities/${o.id}`} className="text-primary hover:underline">{o.title}</Link>
                        <span className="ml-2 text-xs text-muted-foreground">{o.status} · score {o.finalScore ?? "—"}</span>
                      </li>
                    ))}
                    {detail.opportunities.length === 0 && <li className="text-muted-foreground">No opportunities from this entity yet.</li>}
                  </ul>
                </section>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
