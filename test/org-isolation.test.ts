/* ================================================================== *
 * CATEGORY A — pure runtime test (no external credentials): section
 * 18 — every execution-related query is scoped by organizationId.
 * Creates two real, independent orgs and a real execution/approval/
 * action-execution/event trail in ORG A, then proves ORG B's own
 * org-scoped reads can never see any of it — a real cross-tenant
 * check against the real repo functions, not an inspection of code.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Category A — organization isolation", () => {
  beforeAll(() => {
    process.env.LLM_DEV_MODE = "true"
  })

  it("execution, approval, events, and pipeline state created in org A are invisible to org B", async () => {
    const { createOrganization, upsertWorker, buildWorkerVersion, createConnection, listApprovals, getExecution, getApproval, getExecutionEvents, listActionExecutions } = await import("@/lib/db/repo")
    const { executeTask } = await import("@/lib/agent/runtime")
    const { buildEmptyWorker } = await import("@/lib/workforce/seed")

    const orgA = await createOrganization(`Isolation A ${randomUUID()}`)
    const orgB = await createOrganization(`Isolation B ${randomUUID()}`)
    await createConnection({ orgId: orgA.id, connectorId: "connector_test", authType: "none", status: "connected" })

    const worker = buildEmptyWorker(`worker_iso_${randomUUID()}`)
    worker.skills = [{ id: "skill_runtime_proof", name: "Runtime Proof", category: "communication", outputType: "runtime_proof", enabled: true }]
    worker.tools = []
    await upsertWorker(worker, orgA.id, undefined)
    const definition = { identity: worker.identity, mission: worker.mission, objectives: worker.objectives, knowledge: worker.knowledge, skills: worker.skills, tools: worker.tools, integrations: worker.integrations, behaviors: worker.behaviors, channels: worker.channels, outcome: worker.outcome, autonomy: worker.autonomy }
    const version = await buildWorkerVersion(worker.id, orgA.id, definition, "iso-test")

    let executionId = ""
    for await (const event of executeTask({ worker: { ...worker, ...version.definition }, orgId: orgA.id, workerVersionId: version.id, skillId: "skill_runtime_proof", input: { note: "isolation-test" } })) {
      executionId = event.executionId
    }
    expect(executionId).toBeTruthy()

    const approvalA = (await listApprovals(orgA.id, { status: "pending" }))[0]
    expect(approvalA).toBeTruthy()

    // Real cross-org reads — every one must come back empty/null,
    // never org A's real data.
    expect(await getExecution(executionId, orgB.id)).toBeNull()
    expect(await getApproval(approvalA.id, orgB.id)).toBeNull()
    expect(await listApprovals(orgB.id)).toEqual([])
    expect(await getExecutionEvents(executionId, orgB.id)).toEqual([])

    // The correct org sees its own real data.
    expect(await getExecution(executionId, orgA.id)).not.toBeNull()
    expect(await getApproval(approvalA.id, orgA.id)).not.toBeNull()
    expect((await getExecutionEvents(executionId, orgA.id)).length).toBeGreaterThan(0)

    // action_executions: org-scoped directly (org_id is populated
    // server-side at claim time) — org B's own query for this exact
    // real executionId comes back empty, never org A's real records.
    expect(await listActionExecutions(executionId, orgB.id)).toEqual([])
    const actionsA = await listActionExecutions(executionId, orgA.id)
    expect(actionsA.every((a) => a.executionId === executionId)).toBe(true)
  }, 20_000)

  it("test_connector_records (the runtime-proof skill's one real write) are org-scoped", async () => {
    const { createOrganization, insertTestConnectorRecord, listTestConnectorRecords } = await import("@/lib/db/repo")
    const orgA = await createOrganization(`TCR Isolation A ${randomUUID()}`)
    const orgB = await createOrganization(`TCR Isolation B ${randomUUID()}`)
    await insertTestConnectorRecord({ orgId: orgA.id, note: "org-a-only" })
    expect(await listTestConnectorRecords(orgB.id)).toEqual([])
    expect((await listTestConnectorRecords(orgA.id)).map((r) => r.note)).toContain("org-a-only")
  })
})
