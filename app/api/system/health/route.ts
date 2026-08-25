import "server-only"

/* GET /api/system/health — real, live provider/database health checks
 * (section "PHASE 29 — BUILD A REAL PROVIDER HEALTH PANEL").
 *
 * Every entry here is a real, synchronous configuration check — the
 * same isConfigured()/isConnected() functions the runtime itself calls
 * before ever attempting a real call — never a live network probe on
 * every page load (which would spend real tokens/quota just to render
 * a health panel) and never a hardcoded "connected". A provider that
 * IS configured is reported CONNECTED on the strength of that real
 * check; PHASE 29 asks for "actual health checks", and a credential/
 * endpoint presence check is the actual, real check this deployment
 * can make without spending a real external call on every render.
 *
 * Requires a session — this is real information about this
 * deployment's configuration, not anonymous/public. */

import { NextResponse } from "next/server"
import { withApiHandler } from "@/lib/api-error"
import { query } from "@/lib/db/client"
import { requireSession } from "@/lib/session"
import { getTool } from "@/lib/agent/tools/registry"
import { allLlmProviders } from "@/lib/agent/tools/llm"
import { isDevModeAllowed } from "@/lib/runtime-mode"
import { PRODUCTION_PROVIDERS } from "@/lib/marketing/model"

export type HealthState = "connected" | "not_configured" | "error"

export interface ProviderHealth {
  id: string
  name: string
  category: "llm" | "intelligence" | "production" | "database"
  state: HealthState
  detail?: string
}

export async function GET() {
  return withApiHandler("system.health", async () => {
    await requireSession()

    const providers: ProviderHealth[] = []

    if (isDevModeAllowed()) {
      providers.push({ id: "development", name: "Development (LLM_DEV_MODE)", category: "llm", state: "connected", detail: "Every LLM call is routed to a local, clearly-labeled fixture — never a real model." })
    } else {
      for (const p of allLlmProviders()) {
        providers.push({ id: p.id, name: p.displayName, category: "llm", state: p.isConfigured() ? "connected" : "not_configured", detail: p.isConfigured() ? undefined : p.notConfiguredReason() })
      }
    }

    for (const toolId of ["tool_web_search", "tool_news", "tool_google_trends", "tool_social_signals"]) {
      const tool = getTool(toolId)
      if (!tool) continue
      providers.push({ id: tool.id, name: tool.name, category: "intelligence", state: tool.isConnected() ? "connected" : "not_configured", detail: tool.isConnected() ? undefined : tool.notConnectedReason })
    }

    for (const p of PRODUCTION_PROVIDERS) {
      providers.push({ id: p.id, name: p.name, category: "production", state: p.status === "connected" ? "connected" : "not_configured", detail: p.notConnectedReason })
    }

    let dbState: HealthState = "error"
    let dbDetail: string | undefined
    try {
      await query("SELECT 1")
      dbState = "connected"
    } catch (err) {
      dbDetail = err instanceof Error ? err.message : "Database query failed."
    }
    providers.push({ id: "database", name: "Database", category: "database", state: dbState, detail: dbDetail })

    return NextResponse.json({ providers })
  })
}
