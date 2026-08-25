"use client"

/* ------------------------------------------------------------------ *
 * AGENT SMITH — choose your specialist.
 *
 *   Agent Smith
 *     -> Shared Workforce OS (Worker/Skill/Tool/Execution — unchanged)
 *     -> Super Agents (this page): business-domain specialists — Sales,
 *        Marketing, Customer Success... — built on top of that shared
 *        runtime, never "N skills wearing product names".
 *
 * The product is not "build an AI agent" — it's "put an autonomous
 * specialist to work." A Super Agent that isn't backed by a real
 * Skill yet (status: "coming_soon") is shown honestly, dimmed, with
 * no Onboard action — never a promise the runtime can't keep.
 *
 * Real state only: whether a Super Agent already has a Worker for
 * this org comes from the same workforceStore/`/api/state` every
 * other real surface reads — never a locally-guessed default.
 * ------------------------------------------------------------------ */

import { ArrowRight, Compass, Layers, PenLine, Rocket, Settings, ShoppingCart, TrendingUp, Users, Wallet } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"
import { StudioShell } from "@/components/studio/studio-shell"
import { PRODUCT_CATALOG, type ProductTemplate } from "@/lib/products/catalog"
import { useWorkforce, workforceStore } from "@/lib/workforce/store"

const ICONS = { PenLine, Layers, Compass, TrendingUp, Wallet, Settings, Users, ShoppingCart, Rocket }

export function ProductsHub({ runtimeMode }: { runtimeMode?: "development" | "preview" | "production" }) {
  const { hydrated, workers } = useWorkforce()

  useEffect(() => {
    workforceStore.hydrate()
  }, [])

  const available = PRODUCT_CATALOG.filter((p) => p.status === "available")
  const comingSoon = PRODUCT_CATALOG.filter((p) => p.status === "coming_soon")

  return (
    <StudioShell runtimeMode={runtimeMode}>
      <div className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Agent Smith</p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">Choose a specialist.</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          Give it an objective. Connect your business. Put it to work. See exactly what it did and what it meant for your business.
        </p>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {available.map((product) => (
            <SuperAgentCard key={product.id} product={product} existingWorkerId={hydrated ? (workers.find((w) => w.productId === product.id)?.id ?? null) : undefined} />
          ))}
        </div>

        {comingSoon.length > 0 && (
          <div className="mt-10">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">More specialists — coming soon</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {comingSoon.map((product) => (
                <ComingSoonCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        )}
      </div>
    </StudioShell>
  )
}

function SuperAgentCard({ product, existingWorkerId }: { product: ProductTemplate; existingWorkerId: string | null | undefined }) {
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

      <p className="mt-4 text-[13px] leading-relaxed text-foreground">{product.whoItIs}</p>

      {product.autonomousActions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {product.autonomousActions.map((a, i) => (
            <span key={a} className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[11px] text-foreground">
              {a}
              {i < product.autonomousActions.length - 1 && <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
        <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">Results it can generate</p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1">
          {product.businessOutcomes.map((o) => (
            <span key={o.label} className={`flex items-center gap-1.5 text-[11px] ${o.real ? "text-foreground" : "text-muted-foreground/70"}`}>
              <span className={`h-1 w-1 shrink-0 rounded-full ${o.real ? "bg-grow" : "bg-muted-foreground/40"}`} />
              {o.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3">
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
        {provisioned ? "Open worker" : "Put it to work"}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </article>
  )
}

/** Honest, dimmed, no action — a Super Agent with no real Skill
 * behind it yet must never look like it can be onboarded. Same
 * pattern as lib/connectors/registry.ts's disabled placeholders. */
function ComingSoonCard({ product }: { product: ProductTemplate }) {
  const Icon = ICONS[product.icon]
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-4 py-3 opacity-60">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">{product.name}</p>
      </div>
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Coming soon</span>
    </div>
  )
}
