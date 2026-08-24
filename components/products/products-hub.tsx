"use client"

/* ------------------------------------------------------------------ *
 * AGENT SMITH — the shared Workforce OS's product layer.
 *
 *   Agent Smith
 *     -> Shared Workforce OS (Worker/Skill/Tool/Execution — unchanged)
 *     -> Products (this page): Content Intelligence, Programmatic SEO,
 *        Discover — distinct, tailor-made business systems built on
 *        top of that shared runtime, never "3 skills wearing product
 *        names".
 *
 * Real state only: whether a Product already has a Worker for this
 * org comes from the same workforceStore/`/api/state` every other
 * real surface reads — never a locally-guessed "not started" default.
 * ------------------------------------------------------------------ */

import { ArrowRight, Compass, Layers, PenLine } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"
import { StudioShell } from "@/components/studio/studio-shell"
import { PRODUCT_CATALOG, type ProductTemplate } from "@/lib/products/catalog"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

const ICONS = { PenLine, Layers, Compass }

export function ProductsHub({ runtimeMode }: { runtimeMode?: "development" | "preview" | "production" }) {
  const { hydrated, workers } = useWorkforce()

  useEffect(() => {
    workforceStore.hydrate()
  }, [])

  return (
    <StudioShell runtimeMode={runtimeMode}>
      <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Agent Smith · Shared Workforce OS</p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">Products</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          Each product is a distinct, tailor-made business system — its own onboarding, its own Domain Profile, its own Worker — built on the same real
          Workforce OS that powers Studio and Outputs.
        </p>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {PRODUCT_CATALOG.map((product) => (
            <ProductCard key={product.id} product={product} existingWorkerId={hydrated ? (workers.find((w) => w.productId === product.id)?.id ?? null) : undefined} />
          ))}
        </div>
      </div>
    </StudioShell>
  )
}

function ProductCard({ product, existingWorkerId }: { product: ProductTemplate; existingWorkerId: string | null | undefined }) {
  const Icon = ICONS[product.icon]
  const provisioned = !!existingWorkerId

  return (
    <article className="flex flex-col rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ backgroundColor: product.accent }}>
          <Icon className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold tracking-tight text-foreground">{product.name}</h2>
          <p className="truncate text-[12px] text-muted-foreground">{product.tagline}</p>
        </div>
        {provisioned && (
          <span className="flex items-center gap-1.5 rounded-full border border-grow/30 bg-grow/8 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-grow">
            <span className="h-1.5 w-1.5 rounded-full bg-grow" /> Active
          </span>
        )}
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">{product.description}</p>

      <div className="mt-4 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
        <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">Deliverable</p>
        <p className="mt-1 text-[12.5px] text-foreground">{product.deliverableLabel}</p>
      </div>

      <div className="mt-4">
        <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">Real today</p>
        <ul className="mt-1.5 space-y-1">
          {product.realCapabilities.map((c) => (
            <li key={c} className="flex gap-1.5 text-[11.5px] leading-relaxed text-foreground">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-grow" />
              {c}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3">
        <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">Not yet connected</p>
        <ul className="mt-1.5 space-y-1">
          {product.notYetConnected.map((c) => (
            <li key={c} className="flex gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warn" />
              {c}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 flex-1" />

      <Link
        href={provisioned ? `/studio?worker=${encodeURIComponent(existingWorkerId!)}` : `/products/${product.slug}/onboard`}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.16em] text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: product.accent }}
      >
        {provisioned ? "Open worker" : "Onboard"}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </article>
  )
}
