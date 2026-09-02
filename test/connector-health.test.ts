/* ================================================================== *
 * CATEGORY A — pure runtime test (no external credentials): real
 * connector health persistence (section 23/27 of the connectivity
 * platform brief). Proves health is recorded from a REAL connector
 * call through the actual chokepoint (getConnectorTools()'s
 * withHealthTracking wrapping) — not a separate, hand-simulated write
 * — and that a healthCheck() genuinely reflects "not configured"
 * rather than inferring health from credentials merely existing.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Category A — connector health", () => {
  beforeAll(() => {
    process.env.LLM_DEV_MODE = "true"
  })

  it("a real connector call (Internal Test Connector's record action) opportunistically records real health on success", async () => {
    const { createOrganization, createConnection, getConnection, insertTask, insertExecution, upsertWorker } = await import("@/lib/db/repo")
    const { getConnectorTools } = await import("@/lib/connectors/registry")
    const { buildEmptyWorker } = await import("@/lib/workforce/seed")

    const org = await createOrganization(`Health Test ${randomUUID()}`)
    const connection = await createConnection({ orgId: org.id, connectorId: "connector_test", authType: "none", status: "connected" })
    expect(connection.lastCheckedAt).toBeUndefined() // real: never checked yet

    // A real execution row — the Internal Test Connector's write is
    // FK-constrained to a genuine execution, same as production.
    const worker = buildEmptyWorker(`worker_health_${randomUUID()}`)
    await upsertWorker(worker, org.id, undefined)
    const taskId = `task_health_${randomUUID()}`
    const executionId = `exec_health_${randomUUID()}`
    const now = Date.now()
    await insertTask({ id: taskId, workerId: worker.id, skillId: "skill_runtime_proof", type: "communication", title: "Health test", status: "running", createdAt: now }, org.id, {})
    await insertExecution({ id: executionId, workerId: worker.id, taskId, status: "running", startedAt: now, completedAt: null }, org.id)

    const tools = getConnectorTools(connection)
    const tool = tools.find((t) => t.id === "connector_test.actions")!
    const action = tool.actions.find((a) => a.id === "record")!
    const before = Date.now()
    const result = await action.run({ note: `health-test-${randomUUID()}` }, { workerId: worker.id, executionId, emit: () => {} })
    expect(result.ok).toBe(true)

    const updated = await getConnection(connection.id, org.id)
    expect(updated!.lastCheckedAt).toBeGreaterThanOrEqual(before)
    expect(updated!.lastSuccessAt).toBe(updated!.lastCheckedAt)
    expect(updated!.lastErrorAt).toBeUndefined()
    expect(updated!.lastErrorCode).toBeUndefined()
    expect(updated!.lastLatencyMs).toBeGreaterThanOrEqual(0)
  })

  it("POST /api/connections/[id]/test's underlying mechanism: a real healthCheck() reports not_configured honestly, never a fabricated healthy", async () => {
    const { createOrganization, createConnection, recordConnectionHealth, getConnection } = await import("@/lib/db/repo")
    const { salesforceConnector } = await import("@/lib/connectors/providers/salesforce")

    const org = await createOrganization(`Health Test SF ${randomUUID()}`)
    const connection = await createConnection({ orgId: org.id, connectorId: "connector_salesforce", authType: "oauth2", status: "not_connected" })

    const result = await salesforceConnector.healthCheck!(connection)
    expect(result.state).toBe("not_configured") // real: no SALESFORCE_CLIENT_ID/SECRET in this environment

    await recordConnectionHealth(connection.id, org.id, { ok: false, errorCode: result.state, latencyMs: 5 })
    const updated = await getConnection(connection.id, org.id)
    expect(updated!.lastErrorCode).toBe("not_configured")
    expect(updated!.lastErrorAt).toBeTruthy()
    expect(updated!.lastSuccessAt).toBeUndefined()
  })

  it("organization isolation: recordConnectionHealth for the wrong org never touches another org's real connection row", async () => {
    const { createOrganization, createConnection, recordConnectionHealth, getConnection } = await import("@/lib/db/repo")

    const orgA = await createOrganization(`Health Iso A ${randomUUID()}`)
    const orgB = await createOrganization(`Health Iso B ${randomUUID()}`)
    const connection = await createConnection({ orgId: orgA.id, connectorId: "connector_test", authType: "none", status: "connected" })

    // A wrong-org write must be a real no-op — never silently succeed
    // against another org's row.
    await recordConnectionHealth(connection.id, orgB.id, { ok: true, latencyMs: 1 })
    const stillUnset = await getConnection(connection.id, orgA.id)
    expect(stillUnset!.lastCheckedAt).toBeUndefined()

    expect(await getConnection(connection.id, orgB.id)).toBeNull()
  })
})
