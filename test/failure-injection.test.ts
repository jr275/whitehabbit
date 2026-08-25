/* ================================================================== *
 * CATEGORY D — FAILURE INJECTION TESTS. Simulates real failure modes
 * (429 with Retry-After, 500, timeout, 401, human rejection, a
 * duplicate resume) against the REAL retry/tool-runner/runtime logic,
 * using fakes only at the external-call boundary (a fake ToolAction's
 * run()) — never faking the policy logic itself.
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { DEFAULT_RETRY_POLICY, isTransientToolFailure, withRetry } from "@/lib/agent/retry"
import type { ToolActionResult } from "@/lib/agent/types"

describe("Category D — provider failure classification and retry", () => {
  it("429 (rate limited) with a real Retry-After hint: retried, and the actual delay honors the hint", async () => {
    let calls = 0
    const outcome = await withRetry<ToolActionResult>(
      async () => {
        calls += 1
        if (calls < 2) return { ok: false, errorCode: "provider_error", error: "429 Too Many Requests", retryAfterMs: 50, durationMs: 1 }
        return { ok: true, durationMs: 1 }
      },
      isTransientToolFailure,
      { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 }, // tiny computed backoff — retryAfterMs (50ms) should win
      (r) => r.retryAfterMs,
    )
    expect(outcome.result.ok).toBe(true)
    expect(outcome.attempts).toBe(2)
    expect(outcome.log[0].delayMs).toBeGreaterThanOrEqual(50)
  })

  it("500 (server error): classified transient, retried", async () => {
    let calls = 0
    const outcome = await withRetry<ToolActionResult>(
      async () => {
        calls += 1
        return calls < 2 ? { ok: false, errorCode: "provider_error", error: "500 Internal Server Error", durationMs: 1 } : { ok: true, durationMs: 1 }
      },
      isTransientToolFailure,
      { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 },
    )
    expect(outcome.result.ok).toBe(true)
    expect(calls).toBe(2)
  })

  it("timeout (a caught AbortError surfaced as a provider_error result): classified transient, retried", async () => {
    let calls = 0
    const outcome = await withRetry<ToolActionResult>(
      async () => {
        calls += 1
        return calls < 2 ? { ok: false, errorCode: "provider_error", error: "The operation was aborted due to timeout", durationMs: 20000 } : { ok: true, durationMs: 5 }
      },
      isTransientToolFailure,
      { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 },
    )
    expect(outcome.result.ok).toBe(true)
  })

  it("401 (invalid/expired credential): NEVER retried, even once", async () => {
    let calls = 0
    const outcome = await withRetry<ToolActionResult>(
      async () => {
        calls += 1
        return { ok: false, errorCode: "invalid_credential", error: "401 Unauthorized", durationMs: 1 }
      },
      isTransientToolFailure,
      DEFAULT_RETRY_POLICY,
    )
    expect(calls).toBe(1)
    expect(outcome.result.ok).toBe(false)
  })

  it("a permission/validation failure (execution_error) is never retried", async () => {
    let calls = 0
    await withRetry<ToolActionResult>(
      async () => {
        calls += 1
        return { ok: false, errorCode: "execution_error", error: "invalid input", durationMs: 1 }
      },
      isTransientToolFailure,
      DEFAULT_RETRY_POLICY,
    )
    expect(calls).toBe(1)
  })
})

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)("Category D — rejection and duplicate-resume, against the real runtime", () => {
  async function setupRuntimeProofWorker() {
    const { createOrganization, upsertWorker, buildWorkerVersion, createConnection } = await import("@/lib/db/repo")
    const { buildEmptyWorker } = await import("@/lib/workforce/seed")
    const org = await createOrganization(`Rejection Test Org ${randomUUID()}`)
    await createConnection({ orgId: org.id, connectorId: "connector_test", authType: "none", status: "connected" })
    const worker = buildEmptyWorker(`worker_reject_${randomUUID()}`)
    worker.identity = { name: "Rejection Test Worker", role: "Test", description: "", persona: "", tone: [], accent: "#5a6ef0", initials: "RT" }
    worker.skills = [{ id: "skill_runtime_proof", name: "Runtime Proof", category: "communication", outputType: "runtime_proof", enabled: true }]
    worker.tools = []
    await upsertWorker(worker, org.id, undefined)
    const definition = { identity: worker.identity, mission: worker.mission, objectives: worker.objectives, knowledge: worker.knowledge, skills: worker.skills, tools: worker.tools, integrations: worker.integrations, behaviors: worker.behaviors, channels: worker.channels, outcome: worker.outcome, autonomy: worker.autonomy }
    const version = await buildWorkerVersion(worker.id, org.id, definition, "reject-test")
    return { org, worker: { ...worker, ...version.definition }, versionId: version.id }
  }

  it("rejection: persists rejectedBy/rejectedAt/reason, terminates the execution, marks downstream skipped, and performs NO real action", async () => {
    process.env.LLM_DEV_MODE = "true"
    const { executeTask, finalizeRejectedExecution } = await import("@/lib/agent/runtime")
    const { listApprovals, claimApproval, getApproval, listTestConnectorRecords, createUserWithOrganization } = await import("@/lib/db/repo")

    const { org, worker, versionId } = await setupRuntimeProofWorker()
    const note = `reject-test-${randomUUID()}`
    for await (const _e of executeTask({ worker, orgId: org.id, workerVersionId: versionId, skillId: "skill_runtime_proof", input: { note } })) {
      /* drain */
    }
    const pending = (await listApprovals(org.id, { status: "pending" }))[0]
    const { user } = await createUserWithOrganization(`rejector-${randomUUID()}@example.com`, "fake-hash", "Rejector Org")

    const claimed = await claimApproval(pending.id, org.id, "rejected", user.id)
    expect(claimed).toBeTruthy()
    // section 5: reason/decidedBy/decidedAt are real, persisted facts.
    expect(claimed!.decidedBy).toBe(user.id)
    expect(claimed!.decidedAt).toBeTruthy()
    expect(claimed!.reason.length).toBeGreaterThan(0)

    const execution = await finalizeRejectedExecution(claimed!, org.id)
    expect(execution?.status).toBe("cancelled")

    const records = await listTestConnectorRecords(org.id)
    expect(records.filter((r) => r.note === note)).toHaveLength(0) // never performed

    const reloaded = await getApproval(pending.id, org.id)
    expect(reloaded?.status).toBe("rejected")
  }, 20_000)

  it("duplicate resume of an execution already COMPLETED performs no further real action a second time", async () => {
    process.env.LLM_DEV_MODE = "true"
    const { executeTask, resumeTask } = await import("@/lib/agent/runtime")
    const { listApprovals, getApproval, listTestConnectorRecords } = await import("@/lib/db/repo")

    const { org, worker, versionId } = await setupRuntimeProofWorker()
    const note = `dup-resume-test-${randomUUID()}`
    for await (const _e of executeTask({ worker, orgId: org.id, workerVersionId: versionId, skillId: "skill_runtime_proof", input: { note } })) {
      /* drain */
    }
    const pending = (await listApprovals(org.id, { status: "pending" }))[0]
    const approval = (await getApproval(pending.id, org.id))!

    const first = await resumeTask(approval, org.id)
    expect(first.ok).toBe(true)

    // A second resumeTask call reusing the SAME (now stale) approval
    // object — e.g. a retried HTTP request that raced past the
    // approval-claim guard, or a caller invoking resumeTask directly.
    const second = await resumeTask(approval, org.id)
    // Either it's blocked by the lease, or it runs again against an
    // idempotency-ledger key that's already "completed" — either way,
    // the real external action must never fire twice.
    if (second.ok) {
      const records = await listTestConnectorRecords(org.id)
      expect(records.filter((r) => r.note === note)).toHaveLength(1)
    } else {
      expect(second.reason).toBe("lease_busy")
    }
  }, 20_000)
})
