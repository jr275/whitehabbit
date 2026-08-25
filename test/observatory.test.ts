/* ================================================================== *
 * CATEGORY A — pure runtime test (no external credentials): the real
 * Observatory (lib/db/repo.ts's getExecutionSummary/
 * listExecutionsDetailed/listRecentActivity/listWorkerHealth, and the
 * GET /api/observatory/* routes built on them).
 *
 * Every row here is written through the SAME real repo functions the
 * production runtime itself calls (insertExecution/finalizeExecution/
 * insertTask/insertOutput/createApproval/claimApproval/
 * insertExecutionEvent) — never a fabricated row shape, never a mock
 * of the query layer. Assertions read the real return values of the
 * real Observatory queries against a real local Postgres.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { beforeAll, describe, expect, it } from "vitest"

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Category A — Observatory: real data, org-scoped, no demo store", () => {
  beforeAll(() => {
    process.env.LLM_DEV_MODE = "true"
  })

  async function setupOrgWithWorker(label: string) {
    const { createOrganization, upsertWorker } = await import("@/lib/db/repo")
    const { buildEmptyWorker } = await import("@/lib/workforce/seed")
    const org = await createOrganization(`Observatory ${label} ${randomUUID()}`)
    const worker = buildEmptyWorker(`worker_obs_${randomUUID()}`)
    worker.identity = { name: `Observatory Worker ${label}`, role: "Test", description: "", persona: "", tone: [], accent: "#5a6ef0", initials: "OW" }
    await upsertWorker(worker, org.id, undefined)
    return { org, worker }
  }

  /** Inserts one real execution row (+ its owning task row) through
   * the exact repo functions the runtime writes through — never a
   * hand-shaped row bypassing the real write path. */
  async function seedExecution(orgId: string, workerId: string, opts: { status: "running" | "completed" | "failed" | "blocked" | "cancelled" | "pending_approval"; durationMs?: number; startedAt?: number }) {
    const { insertTask, insertExecution, finalizeExecution } = await import("@/lib/db/repo")
    const taskId = `task_obs_${randomUUID()}`
    const executionId = `exec_obs_${randomUUID()}`
    const startedAt = opts.startedAt ?? Date.now()
    await insertTask({ id: taskId, workerId, skillId: "skill_runtime_proof", type: "communication", title: "Observatory test task", status: "running", createdAt: startedAt }, orgId, {})
    await insertExecution({ id: executionId, workerId, taskId, status: "running", startedAt, completedAt: null }, orgId)
    if (opts.status !== "running") {
      const completedAt = startedAt + (opts.durationMs ?? 1000)
      await finalizeExecution(executionId, { status: opts.status, completedAt, durationMs: opts.durationMs ?? 1000 })
    }
    return { taskId, executionId }
  }

  it("returns real executions, with correct Worker association", async () => {
    const { listExecutionsDetailed } = await import("@/lib/db/repo")
    const { org, worker } = await setupOrgWithWorker("basic")
    const { executionId } = await seedExecution(org.id, worker.id, { status: "completed" })

    const { items, total } = await listExecutionsDetailed(org.id, {}, 25, 0)
    expect(total).toBe(1)
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(executionId)
    expect(items[0].workerId).toBe(worker.id)
    expect(items[0].workerName).toBe(worker.identity.name) // section 7: Worker association is correct
  })

  it("a completed execution appears in the list and in the summary's completed count", async () => {
    const { listExecutionsDetailed, getExecutionSummary } = await import("@/lib/db/repo")
    const { org, worker } = await setupOrgWithWorker("completed")
    await seedExecution(org.id, worker.id, { status: "completed", durationMs: 2500 })

    const { items } = await listExecutionsDetailed(org.id, { status: "completed" }, 25, 0)
    expect(items).toHaveLength(1)
    expect(items[0].status).toBe("completed")
    expect(items[0].durationMs).toBe(2500)

    const summary = await getExecutionSummary(org.id)
    expect(summary.completed).toBe(1)
    expect(summary.total).toBe(1)
    expect(summary.successRate).toBe(1) // 1 completed / 1 terminal
  })

  it("a failed execution appears in the list and in the summary's failed count", async () => {
    const { listExecutionsDetailed, getExecutionSummary } = await import("@/lib/db/repo")
    const { org, worker } = await setupOrgWithWorker("failed")
    await seedExecution(org.id, worker.id, { status: "failed" })

    const { items } = await listExecutionsDetailed(org.id, { status: "failed" }, 25, 0)
    expect(items).toHaveLength(1)
    expect(items[0].status).toBe("failed")

    const summary = await getExecutionSummary(org.id)
    expect(summary.failed).toBe(1)
    expect(summary.successRate).toBe(0) // 0 completed / 1 terminal
  })

  it("a running execution is represented correctly — no completedAt/durationMs, counted as running, excluded from the terminal success-rate denominator", async () => {
    const { listExecutionsDetailed, getExecutionSummary } = await import("@/lib/db/repo")
    const { org, worker } = await setupOrgWithWorker("running")
    await seedExecution(org.id, worker.id, { status: "running" })

    const { items } = await listExecutionsDetailed(org.id, {}, 25, 0)
    expect(items[0].status).toBe("running")
    expect(items[0].completedAt).toBeNull()
    expect(items[0].durationMs).toBeNull()

    const summary = await getExecutionSummary(org.id)
    expect(summary.running).toBe(1)
    expect(summary.total).toBe(1)
    expect(summary.successRate).toBeNull() // nothing has concluded yet — never fabricated as 0%
  })

  it("approval-related state is represented correctly on the execution row and in the summary's approval counts", async () => {
    const { listExecutionsDetailed, getExecutionSummary, createApproval, claimApproval, createUserWithOrganization } = await import("@/lib/db/repo")
    const { org, worker } = await setupOrgWithWorker("approval")
    const { executionId } = await seedExecution(org.id, worker.id, { status: "pending_approval" })
    const { user } = await createUserWithOrganization(`obs-approver-${randomUUID()}@example.com`, "fake-hash", "Approver Org")

    const approval = await createApproval({
      orgId: org.id,
      workerId: worker.id,
      executionId,
      toolId: "connector_test.actions",
      toolName: "Test Connector — Actions",
      actionId: "record",
      actionLabel: "Record test event",
      permission: "write",
      reason: "test",
      input: {},
    })

    let items = (await listExecutionsDetailed(org.id, {}, 25, 0)).items
    expect(items[0].approvalStatus).toBe("pending")

    let summary = await getExecutionSummary(org.id)
    expect(summary.approvalsPending).toBe(1)
    expect(summary.approvalRate).toBeNull() // nothing decided yet

    await claimApproval(approval.id, org.id, "approved", user.id)

    items = (await listExecutionsDetailed(org.id, {}, 25, 0)).items
    expect(items[0].approvalStatus).toBe("approved")

    summary = await getExecutionSummary(org.id)
    expect(summary.approvalsApproved).toBe(1)
    expect(summary.approvalsPending).toBe(0)
    expect(summary.approvalRate).toBe(1)

    // approvalState filter actually filters server-side.
    const filtered = await listExecutionsDetailed(org.id, { approvalState: "approved" }, 25, 0)
    expect(filtered.total).toBe(1)
    const none = await listExecutionsDetailed(org.id, { approvalState: "none" }, 25, 0)
    expect(none.total).toBe(0)
  })

  it("output count is correct", async () => {
    const { listExecutionsDetailed, getExecutionSummary, insertOutput } = await import("@/lib/db/repo")
    const { org, worker } = await setupOrgWithWorker("outputs")
    const { executionId, taskId } = await seedExecution(org.id, worker.id, { status: "completed" })

    await insertOutput({ id: `out_${randomUUID()}`, workerId: worker.id, taskId, executionId, type: "runtime_proof", title: "Test output 1", content: "content", status: "completed", createdAt: Date.now() }, org.id)
    await insertOutput({ id: `out_${randomUUID()}`, workerId: worker.id, taskId, executionId, type: "runtime_proof", title: "Test output 2", content: "content", status: "completed", createdAt: Date.now() }, org.id)

    const items = (await listExecutionsDetailed(org.id, {}, 25, 0)).items
    expect(items[0].outputCount).toBe(2)

    const summary = await getExecutionSummary(org.id)
    expect(summary.totalOutputs).toBe(2)
  })

  it("organization isolation: org B's Observatory queries never see org A's real executions, outputs, approvals or activity", async () => {
    const { listExecutionsDetailed, getExecutionSummary, listRecentActivity, listWorkerHealth, insertExecutionEvent } = await import("@/lib/db/repo")
    const { org: orgA, worker: workerA } = await setupOrgWithWorker("isoA")
    const { org: orgB } = await setupOrgWithWorker("isoB")
    const { executionId, taskId } = await seedExecution(orgA.id, workerA.id, { status: "completed" })
    await insertExecutionEvent({ id: `ev_${randomUUID()}`, workerId: workerA.id, executionId, taskId, type: "task_completed", timestamp: Date.now(), payload: {} }, orgA.id)

    const bExecutions = await listExecutionsDetailed(orgB.id, {}, 25, 0)
    expect(bExecutions.total).toBe(0)
    expect(bExecutions.items).toEqual([])

    const bSummary = await getExecutionSummary(orgB.id)
    expect(bSummary.total).toBe(0)
    expect(bSummary.completed).toBe(0)

    const bActivity = await listRecentActivity(orgB.id)
    expect(bActivity.find((a) => a.executionId === executionId)).toBeUndefined()

    const bWorkers = await listWorkerHealth(orgB.id)
    expect(bWorkers.find((w) => w.workerId === workerA.id)).toBeUndefined()

    // Org A's own queries DO see its real data — isolation isn't just "always empty".
    const aExecutions = await listExecutionsDetailed(orgA.id, {}, 25, 0)
    expect(aExecutions.total).toBe(1)
  })

  it("empty workspace: zero executions is a real, correctly-represented state — never a query error, never a fabricated non-zero", async () => {
    const { getExecutionSummary, listExecutionsDetailed, listWorkerHealth } = await import("@/lib/db/repo")
    const { org, worker } = await setupOrgWithWorker("empty")

    const summary = await getExecutionSummary(org.id)
    expect(summary.total).toBe(0)
    expect(summary.successRate).toBeNull()
    expect(summary.avgDurationMs).toBeNull()

    const executions = await listExecutionsDetailed(org.id, {}, 25, 0)
    expect(executions.total).toBe(0)
    expect(executions.items).toEqual([])

    // The Worker itself still appears in health (real zeros, never omitted).
    const workers = await listWorkerHealth(org.id)
    const row = workers.find((w) => w.workerId === worker.id)
    expect(row).toBeTruthy()
    expect(row!.executions).toBe(0)
    expect(row!.successRate).toBeNull()
    expect(row!.lastExecutionStatus).toBeNull()
  })

  it("no demo-store data is used by Observatory — static guard against lib/workforce-demo creeping back in", () => {
    const files = [
      "app/observatory/page.tsx",
      "components/observatory/observatory-page.tsx",
      "components/observatory/summary-cards.tsx",
      "components/observatory/executions-table.tsx",
      "components/observatory/activity-feed.tsx",
      "components/observatory/worker-health.tsx",
      "app/api/observatory/summary/route.ts",
      "app/api/observatory/executions/route.ts",
      "app/api/observatory/activity/route.ts",
      "app/api/observatory/workers/route.ts",
    ]
    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8")
      // Real import statements only — a prose comment explaining what a
      // file replaced (e.g. this test's own header, or the page's "Replaces
      // the earlier demo-store-backed page" note) legitimately names
      // lib/workforce-demo without importing it.
      const importLines = source.match(/^import .*$/gm) ?? []
      const demoImport = importLines.find((line) => line.includes("workforce-demo"))
      expect(demoImport, `${file} must never import lib/workforce-demo`).toBeUndefined()
    }
  })
})
