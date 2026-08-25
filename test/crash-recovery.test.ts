/* ================================================================== *
 * CATEGORY A — PURE RUNTIME TESTS (no external provider credentials;
 * the "external" write here is the Internal Test Connector's one
 * real, permanently-internal-labeled write action — see lib/agent/
 * skills/runtime-proof.ts's header for why this is honest, not fake
 * data pretending to be a real integration).
 *
 * Proves, against a real local Postgres, using the REAL runtime
 * (executeTask/resumeTask/retryFailedStage/claimApproval — the same
 * functions the HTTP routes call, not test doubles):
 *   - section 11/25: crash recovery — state loaded from persistence
 *     alone resumes and completes an execution exactly once.
 *   - section 12: the execution lease prevents two concurrent
 *     resume attempts from both performing the real write.
 *   - section 4: approval decisions are idempotent — a double-click
 *     on Approve only transitions once.
 *   - section 14: the exact same logical event can't be inserted twice.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Category A — crash recovery, concurrency, approval idempotency, event idempotency", () => {
  beforeAll(() => {
    process.env.LLM_DEV_MODE = "true"
  })

  async function setupRuntimeProofWorker() {
    const { createOrganization, upsertWorker, buildWorkerVersion, createConnection } = await import("@/lib/db/repo")
    const { buildEmptyWorker } = await import("@/lib/workforce/seed")

    const org = await createOrganization(`Runtime Proof Org ${randomUUID()}`)
    // A real, connected Connection for the internal test connector —
    // required for connector_test.actions to appear in toolsMapForOrg().
    await createConnection({ orgId: org.id, connectorId: "connector_test", authType: "none", status: "connected" })

    const worker = buildEmptyWorker(`worker_proof_${randomUUID()}`)
    worker.identity = { name: "Runtime Proof Worker", role: "Test", description: "", persona: "", tone: [], accent: "#5a6ef0", initials: "RP" }
    worker.skills = [{ id: "skill_runtime_proof", name: "Runtime Proof", category: "communication", outputType: "runtime_proof", enabled: true }]
    worker.tools = []
    await upsertWorker(worker, org.id, undefined)
    const definition = {
      identity: worker.identity,
      mission: worker.mission,
      objectives: worker.objectives,
      knowledge: worker.knowledge,
      skills: worker.skills,
      tools: worker.tools,
      integrations: worker.integrations,
      behaviors: worker.behaviors,
      channels: worker.channels,
      outcome: worker.outcome,
      autonomy: worker.autonomy,
    }
    const version = await buildWorkerVersion(worker.id, org.id, definition, "proof-test")
    return { org, worker: { ...worker, ...version.definition }, versionId: version.id }
  }

  it("crash recovery: an execution reaches WAITING_FOR_APPROVAL, is reloaded from persistence alone (no in-memory state reused), and resumes to COMPLETED with exactly one real write", async () => {
    const { executeTask } = await import("@/lib/agent/runtime")
    const { listApprovals, getApproval, listTestConnectorRecords } = await import("@/lib/db/repo")

    const { org, worker, versionId } = await setupRuntimeProofWorker()
    const note = `crash-test-${randomUUID()}`

    // 1-2. Start execution; it reaches WAITING_FOR_APPROVAL for real —
    // no worker-integration override exists, so the write action hits
    // the blanket HIGH_RISK_PERMISSIONS default.
    for await (const _event of executeTask({ worker, orgId: org.id, workerVersionId: versionId, skillId: "skill_runtime_proof", input: { note } })) {
      /* drain */
    }

    const pending = (await listApprovals(org.id, { status: "pending" }))[0]
    expect(pending).toBeTruthy()
    expect(pending.resumeState).toBeTruthy()

    // 3. Real checkpoint persisted — the intake stage completed, the
    // record stage is genuinely waiting, before anything resumes.
    const stagesBefore = (pending.resumeState as { stages: { key: string; status: string }[] }).stages
    expect(stagesBefore.find((s) => s.key === "objective_intake")?.status).toBe("completed")
    expect(stagesBefore.find((s) => s.key === "record_action")?.status).toBe("waiting_for_approval")

    // 4. "Simulate process restart": load the approval FRESH from the
    // database via a brand-new query — this object carries no
    // reference to anything the first invocation held in memory. This
    // is the actual proof that resume works from persistence alone.
    const reloaded = await getApproval(pending.id, org.id)
    expect(reloaded).toBeTruthy()

    // 5-6. Resume using only the freshly-loaded row; it must not
    // re-run intake, and must complete.
    const { resumeTask } = await import("@/lib/agent/runtime")
    const outcome = await resumeTask(reloaded!, org.id)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) throw new Error("unreachable")
    expect(outcome.execution.status).toBe("completed")

    // 7. Exactly one real external side effect — never duplicated.
    const records = await listTestConnectorRecords(org.id)
    const matching = records.filter((r) => r.note === note)
    expect(matching).toHaveLength(1)

    const finalExecution = outcome.execution
    expect(finalExecution.pipelineState?.stages.find((s) => s.key === "record_action")?.status).toBe("completed")
  }, 30_000)

  it("concurrency: two simultaneous resume attempts on the same execution never both perform the real write — the lease lets exactly one through", async () => {
    const { executeTask, resumeTask } = await import("@/lib/agent/runtime")
    const { listApprovals, getApproval, listTestConnectorRecords } = await import("@/lib/db/repo")

    const { org, worker, versionId } = await setupRuntimeProofWorker()
    const note = `concurrency-test-${randomUUID()}`

    for await (const _event of executeTask({ worker, orgId: org.id, workerVersionId: versionId, skillId: "skill_runtime_proof", input: { note } })) {
      /* drain */
    }
    const pending = (await listApprovals(org.id, { status: "pending" }))[0]

    // Two independent, freshly-loaded copies — exactly what two
    // concurrent processes/requests would each hold.
    const [copyA, copyB] = await Promise.all([getApproval(pending.id, org.id), getApproval(pending.id, org.id)])

    const [resultA, resultB] = await Promise.all([resumeTask(copyA!, org.id), resumeTask(copyB!, org.id)])

    const outcomes = [resultA, resultB]
    const succeeded = outcomes.filter((o) => o.ok)
    const busy = outcomes.filter((o) => !o.ok && o.reason === "lease_busy")
    // Exactly one of the two concurrent attempts actually ran the
    // pipeline; the other was correctly blocked by the lease (it may
    // also legitimately see the execution as already resolved,
    // depending on scheduling, but it must never ALSO perform the
    // real write).
    expect(succeeded.length).toBeGreaterThanOrEqual(1)
    expect(succeeded.length + busy.length).toBe(2)

    const records = await listTestConnectorRecords(org.id)
    expect(records.filter((r) => r.note === note)).toHaveLength(1)
  }, 30_000)

  it("approval idempotency: two concurrent claims of the same approval only let one transition happen", async () => {
    const { createUserWithOrganization, upsertWorker, createApproval, claimApproval, getApproval } = await import("@/lib/db/repo")
    const { buildEmptyWorker } = await import("@/lib/workforce/seed")
    const { user: userA, org } = await createUserWithOrganization(`appr-idem-a-${randomUUID()}@example.com`, "fake-hash", "Approval Idempotency Org")
    const { user: userB } = await createUserWithOrganization(`appr-idem-b-${randomUUID()}@example.com`, "fake-hash", "Approval Idempotency Org B")
    const worker = buildEmptyWorker(`worker_appr_${randomUUID()}`)
    await upsertWorker(worker, org.id, undefined)
    const approval = await createApproval({
      orgId: org.id,
      workerId: worker.id,
      toolId: "connector_test.actions",
      toolName: "Test Connector",
      actionId: "record",
      actionLabel: "Record test event",
      permission: "write",
      reason: "test",
      input: { note: "x" },
    })

    const [a, b] = await Promise.all([claimApproval(approval.id, org.id, "approved", userA.id), claimApproval(approval.id, org.id, "approved", userB.id)])
    const winners = [a, b].filter((r) => r !== null)
    expect(winners).toHaveLength(1)

    const final = await getApproval(approval.id, org.id)
    expect(final?.status).toBe("approved")
    expect(final?.decidedBy).toBe(winners[0]!.decidedBy)
  })

  it("event idempotency: inserting the exact same logical event twice never creates a duplicate row", async () => {
    const { createOrganization, upsertWorker, insertTask, insertExecution, insertExecutionEvent, getExecutionEvents } = await import("@/lib/db/repo")
    const { buildEmptyWorker } = await import("@/lib/workforce/seed")

    const org = await createOrganization(`Event Idempotency Org ${randomUUID()}`)
    const worker = buildEmptyWorker(`worker_evt_${randomUUID()}`)
    await upsertWorker(worker, org.id, undefined)
    const now = Date.now()
    const task = { id: `task_${randomUUID()}`, workerId: worker.id, skillId: "skill_runtime_proof", type: "communication" as const, title: "t", status: "running" as const, createdAt: now }
    await insertTask(task, org.id, {})
    const execution = { id: `exec_${randomUUID()}`, workerId: worker.id, taskId: task.id, status: "running" as const, startedAt: now, completedAt: null }
    await insertExecution(execution, org.id)

    const event = { id: `ev_${randomUUID()}`, workerId: worker.id, executionId: execution.id, taskId: task.id, type: "stage_completed" as const, timestamp: now, payload: { stage: "record_action" } }
    const first = await insertExecutionEvent(event, org.id, "dup-key-1")
    const second = await insertExecutionEvent({ ...event, id: `ev_${randomUUID()}` }, org.id, "dup-key-1")

    expect(first.sequence).toBe(second.sequence)
    const all = await getExecutionEvents(execution.id, org.id)
    expect(all).toHaveLength(1)
  })
})
