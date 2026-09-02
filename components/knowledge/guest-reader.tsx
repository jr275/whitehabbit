"use client"

/* Client reader used ONLY on the guest path (no session). It loads the
 * document through the same guest-aware client seam (client.ts →
 * guest-store) and renders the exact same ReaderView the authenticated
 * server page uses, so the reading experience is identical. */

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { fetchDocument, KnowledgeApiError } from "@/lib/knowledge/client"
import type { KnowledgeDocument } from "@/lib/knowledge/types"
import { ReaderView } from "./reader-view"

export function GuestReader({ id }: { id: string }) {
  const [doc, setDoc] = useState<KnowledgeDocument | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading")

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    fetchDocument(id, controller.signal)
      .then((d) => {
        if (!active) return
        setDoc(d)
        setStatus("ready")
      })
      .catch((err) => {
        if (!active) return
        if (err instanceof DOMException && err.name === "AbortError") return
        // 404 (or anything else) → honest "not found" rather than a crash.
        if (err instanceof KnowledgeApiError) setStatus("missing")
        else setStatus("missing")
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [id])

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16">
        <div className="kn-shimmer h-4 w-28 rounded" />
        <div className="kn-shimmer mt-6 h-10 w-3/4 rounded" />
        <div className="kn-shimmer mt-3 h-10 w-1/2 rounded" />
        <div className="mt-10 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="kn-shimmer h-4 w-full rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (status === "missing" || !doc) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-start px-5 py-24">
        <p className="font-serif text-3xl font-medium tracking-tight text-foreground">This piece isn&apos;t here.</p>
        <p className="mt-2 text-muted-foreground">It may have been removed from your library.</p>
        <Link
          href="/knowledge/library"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
        >
          <ArrowLeft className="size-4" /> Back to your library
        </Link>
      </div>
    )
  }

  return <ReaderView doc={doc} />
}
