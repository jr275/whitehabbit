import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { resolveOrCreateEntity } from "@/lib/knowledge/repo"
import { upsertTrend } from "@/lib/intelligence/trends"
import { listSignals } from "@/lib/intelligence/signals"
import { processIntelligenceEventQueue, listRecentIntelligenceEvents } from "@/lib/intelligence/recalc-worker"
import { query } from "@/lib/db/client"

async function seedProject() {
  const email = `recalc-${randomUUID()}@example.test`
  const { org } = await createUserWithOrganization(email, "hashed-not-real", `Org ${email}`)
  const project = await getOrCreateDefaultProject(org.id)
  return { orgId: org.id, projectId: project.id }
}

/* §7 — real, durable, incremental recalculation: migrations/0010's SQL
 * trigger fires on genuine writes to entities/trends/pages/etc (never
 * simulated), and processIntelligenceEventQueue() is the exact same
 * function the real POST /api/v1/intelligence/process endpoint calls —
 * no separate test-only code path. */
describe("intelligence event queue (§7, ADR-032/033) — real, DB-backed", () => {
  it("a real entity write durably queues an EntityChanged event, resolved to the real project", async () => {
    const { orgId, projectId } = await seedProject()
    const { entity } = await resolveOrCreateEntity(orgId, projectId, "Place", `Recalc ${randomUUID()}`)

    const rows = await query<{ id: string; event_type: string; subject_id: string; project_id: string; status: string }>(
      "SELECT * FROM intelligence_event_queue WHERE org_id = $1 AND event_type = 'EntityChanged' AND subject_id = $2",
      [orgId, entity.id],
    )
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0].project_id).toBe(projectId) // real, resolved directly from entities.project_id at trigger time
    expect(rows[0].status).toBe("pending")
  })

  it("processIntelligenceEventQueue() drains a real EntityChanged event into a real ENTITY_GAP signal", async () => {
    const { orgId, projectId } = await seedProject()
    const { entity } = await resolveOrCreateEntity(orgId, projectId, "Place", `Gap ${randomUUID()}`)

    const result = await processIntelligenceEventQueue(50)
    expect(result.dequeued).toBeGreaterThanOrEqual(1)
    expect(result.errors).toHaveLength(0)

    const signals = await listSignals(orgId, projectId, { type: "ENTITY_GAP" })
    expect(signals.some((s) => s.entityId === entity.id)).toBe(true) // real detector actually ran, not just marked done

    const rows = await query<{ status: string; processed_at: string | null }>(
      "SELECT status, processed_at FROM intelligence_event_queue WHERE org_id = $1 AND subject_id = $2",
      [orgId, entity.id],
    )
    expect(rows.every((r) => r.status === "processed" && r.processed_at !== null)).toBe(true)
  })

  it("a real accelerating Trend write queues and drains into a real TREND_ACCELERATION signal", async () => {
    const { orgId, projectId } = await seedProject()
    const trend = await upsertTrend({ orgId, projectId, label: `Recalc Trend ${randomUUID()}`, state: "rising", velocity: 10, acceleration: 45, momentum: 5, seasonality: null, confidence: 0.8, signalIds: [] })

    const queued = await query<{ project_id: string }>("SELECT project_id FROM intelligence_event_queue WHERE org_id = $1 AND event_type = 'TrendUpdated' AND subject_id = $2", [orgId, trend.id])
    expect(queued.length).toBeGreaterThanOrEqual(1)
    expect(queued[0].project_id).toBe(projectId)

    await processIntelligenceEventQueue(50)
    const signals = await listSignals(orgId, projectId, { type: "TREND_ACCELERATION" })
    expect(signals.some((s) => (s.value as { trendId?: string }).trendId === trend.id)).toBe(true)
  })

  it("draining an empty queue is a real, cheap no-op — never an error", async () => {
    const { orgId } = await seedProject()
    await processIntelligenceEventQueue(50) // drain whatever this fresh org's setup produced, if anything
    const result = await processIntelligenceEventQueue(50)
    expect(result.dequeued).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it("tenant isolation: tenant A never sees tenant B's queued intelligence events", async () => {
    const tenantA = await seedProject()
    const tenantB = await seedProject()
    await resolveOrCreateEntity(tenantB.orgId, tenantB.projectId, "Place", `Iso ${randomUUID()}`)

    const aEvents = await listRecentIntelligenceEvents(tenantA.orgId)
    expect(aEvents.every((e) => e.orgId === tenantA.orgId)).toBe(true)
    expect(aEvents.some((e) => e.orgId === tenantB.orgId)).toBe(false)
  })
})
