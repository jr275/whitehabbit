"use client"

/* ------------------------------------------------------------------ *
 * SYSTEM HEALTH — section "PHASE 29" / "PHASE 12 — Integration
 * Health". Real, live provider/connector/database checks from
 * GET /api/system/health — never a hardcoded "connected".
 * ------------------------------------------------------------------ */

import { useEffect, useState } from "react"
import { CheckCircle2, CircleAlert, Plug, TriangleAlert } from "lucide-react"
import type { HealthState, IntegrationHealth, ProviderHealth } from "@/app/api/system/health/route"
import type { IntegrationHealthState } from "@/lib/connectors/types"

const CATEGORY_LABEL: Record<ProviderHealth["category"], string> = {
  llm: "Model providers",
  intelligence: "Intelligence sources",
  production: "Production providers",
  database: "Database",
}

const STATE_META: Record<HealthState, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  connected: { label: "Connected", cls: "text-grow bg-grow/10 border-grow/30", icon: CheckCircle2 },
  not_configured: { label: "Not configured", cls: "text-muted-foreground bg-secondary/50 border-border", icon: Plug },
  error: { label: "Error", cls: "text-destructive bg-destructive/10 border-destructive/30", icon: CircleAlert },
}

const INTEGRATION_STATE_META: Record<IntegrationHealthState, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  healthy: { label: "Healthy", cls: "text-grow bg-grow/10 border-grow/30", icon: CheckCircle2 },
  degraded: { label: "Degraded", cls: "text-warn bg-warn/10 border-warn/30", icon: TriangleAlert },
  not_configured: { label: "Not configured", cls: "text-muted-foreground bg-secondary/50 border-border", icon: Plug },
  auth_error: { label: "Auth error", cls: "text-destructive bg-destructive/10 border-destructive/30", icon: CircleAlert },
  rate_limited: { label: "Rate limited", cls: "text-warn bg-warn/10 border-warn/30", icon: TriangleAlert },
  error: { label: "Error", cls: "text-destructive bg-destructive/10 border-destructive/30", icon: CircleAlert },
}

export function SystemHealth() {
  const [providers, setProviders] = useState<ProviderHealth[] | null>(null)
  const [integrations, setIntegrations] = useState<IntegrationHealth[]>([])

  useEffect(() => {
    fetch("/api/system/health")
      .then((r) => r.json())
      .then((data) => {
        setProviders(data.providers)
        setIntegrations(data.integrations ?? [])
      })
      .catch(() => setProviders([]))
  }, [])

  if (providers === null) return null

  const byCategory = new Map<ProviderHealth["category"], ProviderHealth[]>()
  for (const p of providers) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, [])
    byCategory.get(p.category)!.push(p)
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <p className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-foreground">System Health</p>
      <div className="flex flex-col gap-3">
        {Array.from(byCategory.entries()).map(([category, items]) => (
          <div key={category}>
            <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">{CATEGORY_LABEL[category]}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {items.map((p) => {
                const meta = STATE_META[p.state]
                const Icon = meta.icon
                return (
                  <span key={p.id} title={p.detail} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[10px] ${meta.cls}`}>
                    <Icon className="h-3 w-3" />
                    {p.name} — {meta.label}
                  </span>
                )
              })}
            </div>
          </div>
        ))}

        {integrations.length > 0 && (
          <div>
            <p className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">Integrations</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {integrations.map((p) => {
                const meta = INTEGRATION_STATE_META[p.state]
                const Icon = meta.icon
                return (
                  <span key={p.id} title={p.detail} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[10px] ${meta.cls}`}>
                    <Icon className="h-3 w-3" />
                    {p.name} — {meta.label}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
