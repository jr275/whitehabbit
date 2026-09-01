/* ================================================================== *
 * WORKFORCE REPOSITORY TENANT SCOPING
 *
 * The Phase 5 audit found three Workforce write functions executing
 * unscoped SQL (`WHERE id = $n` with no org predicate). They were not
 * exploitable — every call site passes a server-generated UUID — but
 * they were the one exception to the repository's own rule, and the
 * Knowledge Library is being modelled on that rule.
 *
 * These tests pin the fix: the functions must be no-ops for a foreign
 * org, and must still work for the owning org (behavior-preserving).
 * ================================================================== */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { finalizeExecution, updateExecutionStatus, updateTaskStatus } from "@/lib/db/repo"
import { closeTestPool, createTenant, getTestPool, prepareDatabase, seedWorkforceExecution } from "../helpers/db.ts"

describe("Workforce repository functions are tenant-scoped", () => {
  before(async () => {
    await prepareDatabase()
  })
  after(async () => {
    await closeTestPool()
  })

  it("updateTaskStatus does nothing for a foreign org", async () => {
    const owner = await createTenant("owner")
    const attacker = await createTenant("attacker")
    const { taskId } = await seedWorkforceExecution(owner)
    const db = getTestPool()

    await updateTaskStatus(taskId, attacker.orgId, "failed")
    const { rows: afterForeign } = await db.query("SELECT status FROM tasks WHERE id = $1", [taskId])
    assert.equal(afterForeign[0].status, "running", "a foreign org must not be able to change this task")

    await updateTaskStatus(taskId, owner.orgId, "completed")
    const { rows: afterOwner } = await db.query("SELECT status FROM tasks WHERE id = $1", [taskId])
    assert.equal(afterOwner[0].status, "completed", "the owning org must still be able to change it")
  })

  it("updateExecutionStatus does nothing for a foreign org", async () => {
    const owner = await createTenant("owner")
    const attacker = await createTenant("attacker")
    const { executionId } = await seedWorkforceExecution(owner)
    const db = getTestPool()

    await updateExecutionStatus(executionId, attacker.orgId, "failed")
    const { rows: afterForeign } = await db.query("SELECT status FROM executions WHERE id = $1", [executionId])
    assert.equal(afterForeign[0].status, "running")

    await updateExecutionStatus(executionId, owner.orgId, "completed")
    const { rows: afterOwner } = await db.query("SELECT status FROM executions WHERE id = $1", [executionId])
    assert.equal(afterOwner[0].status, "completed")
  })

  it("finalizeExecution does nothing for a foreign org", async () => {
    const owner = await createTenant("owner")
    const attacker = await createTenant("attacker")
    const { executionId } = await seedWorkforceExecution(owner)
    const db = getTestPool()

    const patch = { status: "completed" as const, completedAt: Date.now(), durationMs: 1234, costUsd: 0.5 }

    await finalizeExecution(executionId, attacker.orgId, patch)
    const { rows: afterForeign } = await db.query(
      "SELECT status, duration_ms, cost_usd FROM executions WHERE id = $1",
      [executionId],
    )
    assert.equal(afterForeign[0].status, "running", "a foreign org must not be able to finalize this execution")
    assert.equal(afterForeign[0].duration_ms, null)
    assert.equal(afterForeign[0].cost_usd, null)

    await finalizeExecution(executionId, owner.orgId, patch)
    const { rows: afterOwner } = await db.query(
      "SELECT status, duration_ms, cost_usd FROM executions WHERE id = $1",
      [executionId],
    )
    assert.equal(afterOwner[0].status, "completed", "the owning org must still be able to finalize it")
    assert.equal(afterOwner[0].duration_ms, 1234)
    assert.equal(Number(afterOwner[0].cost_usd), 0.5)
  })
})
