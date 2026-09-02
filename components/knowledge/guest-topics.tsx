"use client"

/* Client Topics used ONLY on the guest path. Topics are aggregated from
 * the guest library (client.ts → guest-store) client-side, mirroring the
 * authenticated server page's UI exactly. Guest items carry no extracted
 * topics yet, so this honestly shows the empty state until real
 * extraction (or a signed-in library) provides them. */

import { useEffect, useMemo, useState } from "react"
import { PageContainer, PageHeader } from "./page-header"
import { fetchLibrary } from "@/lib/knowledge/client"
import type { KnowledgeItem, Topic } from "@/lib/knowledge/types"

export function GuestTopics() {
  const [items, setItems] = useState<KnowledgeItem[] | null>(null)

  useEffect(() => {
    let active = true
    fetchLibrary({ limit: 200 })
      .then((res) => active && setItems(res.items))
      .catch(() => active && setItems([]))
    return () => {
      active = false
    }
  }, [])

  const topics = useMemo<Topic[]>(() => {
    if (!items) return []
    const counts = new Map<string, number>()
    for (const it of items) for (const t of it.topics ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()]
      .map(([label, count]) => ({ id: label, label, count, momentum: 0 }))
      .sort((a, b) => b.count - a.count)
  }, [items])

  const max = topics.reduce((m, t) => Math.max(m, t.count), 1)

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Topics"
        title="The themes running through your library."
        subtitle="Topics surface automatically from what you save. Larger means stronger presence."
      />

      {items === null ? (
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="kn-shimmer h-24 rounded-2xl" />
          ))}
        </div>
      ) : topics.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-[var(--kn-edge)] bg-[var(--kn-paper)] px-6 py-16 text-center">
          <p className="text-sm text-foreground">No topics yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Save a few things and topics will start to appear here.
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-3 rounded-2xl border border-[var(--kn-edge)] bg-[var(--kn-paper)] p-5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-serif text-2xl font-medium tracking-tight text-foreground">{t.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {t.count} {t.count === 1 ? "piece" : "pieces"}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-[var(--kn-ai)]/70" style={{ width: `${(t.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
