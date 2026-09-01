"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import { Play, Pause, SkipBack, SkipForward, ListMusic } from "lucide-react"
import { getKnowledgeItems } from "@/lib/knowledge/demo-data"
import { durationLabel } from "@/lib/knowledge/config"
import { cn } from "@/lib/utils"

export function AudioView() {
  // Anything can be listened to — the system narrates articles too.
  const queue = useMemo(
    () => getKnowledgeItems().filter((i) => i.state === "ready" && i.cover),
    [],
  )
  const [currentId, setCurrentId] = useState(queue[0]?.id)
  const [playing, setPlaying] = useState(false)

  const current = queue.find((i) => i.id === currentId) ?? queue[0]

  return (
    <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Now playing */}
      <section className="kn-rise">
        <div className="overflow-hidden rounded-3xl border border-[var(--kn-edge)] bg-[var(--kn-paper)]">
          <div className="relative aspect-[16/10] w-full">
            {current?.cover ? (
              <Image
                src={current.cover || "/placeholder.svg"}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 720px"
                className="object-cover"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--kn-ai)]">
                Now playing
              </p>
              <h2 className="mt-2 font-serif text-2xl leading-tight text-balance sm:text-3xl">
                {current?.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {current?.author ?? current?.source}
              </p>
            </div>
          </div>

          {/* Transport */}
          <div className="p-6 sm:p-8">
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/3 rounded-full bg-[var(--kn-ai)]" />
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
              <span>4:12</span>
              <span>{durationLabel(current?.kind ?? "podcast", current?.durationMin)}</span>
            </div>

            <div className="mt-5 flex items-center justify-center gap-6">
              <button
                type="button"
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Previous"
              >
                <SkipBack className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6 translate-x-0.5" />
                )}
              </button>
              <button
                type="button"
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Next"
              >
                <SkipForward className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Queue */}
      <section className="kn-rise" style={{ animationDelay: "60ms" }}>
        <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <ListMusic className="h-3.5 w-3.5" />
          Up next
        </div>
        <ul className="space-y-1">
          {queue.map((item) => {
            const active = item.id === current?.id
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentId(item.id)
                    setPlaying(true)
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors",
                    active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
                  )}
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                    {item.cover ? (
                      <Image
                        src={item.cover || "/placeholder.svg"}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-sm",
                        active ? "text-[var(--kn-ai)]" : "text-foreground",
                      )}
                    >
                      {item.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.source} · {durationLabel(item.kind, item.durationMin)}
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
