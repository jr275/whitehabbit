import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { assertValidTransition, isValidTransition } from "@/lib/workflow/state-machine"
import { InvalidWorkflowTransitionError, type WorkflowStatus } from "@/lib/workflow/types"
import { workflowEngine, runStep, finalizeWorkflow } from "@/lib/workflow/engine"
import * as repo from "@/lib/workflow/repo"
import { assertWithinBudget, DEFAULT_BUDGET, emptyUsage } from "@/lib/workflow/budget"
import { BudgetExceededError } from "@/lib/workflow/types"
import { assertCapability, CapabilityDeniedError } from "@/lib/workflow/permissions"
import { requestApproval, decideApproval, getApprovalForArtifact } from "@/lib/workflow/approval"
import { evaluatePublishAutonomy } from "@/lib/workflow/autonomy"
import { enqueue, dequeue, ack } from "@/lib/workflow/queue"

/* Phase 4 (§4-§13): the durable workflow engine's own correctness —
 * distinct from tenant-isolation and from the E2E vertical slice.
 * Every test here exercises real Postgres persistence, never a mock. */

async function seedOrgProject() {
  const email = `wf-${randomUUID()}@example.test`
  const { user, org } = await createUserWithOrganization(email, "hashed-password-not-real", `Org ${email}`)
  const project = await getOrCreateDefaultProject(org.id)
  return { orgId: org.id, projectId: project.id, userId: user.id }
}

describe("workflow state machine (§3)", () => {
  it("never allows a self-transition", () => {
    expect(isValidTransition("running", "running")).toBe(false)
  })

  it("rejects an undeclared transition and throws", () => {
    expect(() => assertValidTransition("succeeded", "running")).toThrow(InvalidWorkflowTransitionError)
    expect(() => assertValidTransition("queued", "waiting_approval")).toThrow(InvalidWorkflowTransitionError)
  })

  it("never allows a FAILED run to jump directly to RUNNING — only through RETRYING", () => {
    expect(isValidTransition("failed", "running")).toBe(false)
    expect(isValidTransition("failed", "retrying")).toBe(true)
    expect(isValidTransition("retrying", "running")).toBe(true)
  })

  it("terminal states (succeeded/cancelled) accept no further transitions", () => {
    const terminal: WorkflowStatus[] = ["succeeded", "cancelled"]
    for (const from of terminal) {
      expect(isValidTransition(from, "running")).toBe(false)
      expect(isValidTransition(from, "queued")).toBe(false)
    }
  })
})

describe("workflow engine — idempotent start (§6)", () => {
  it("starting the same (org, pipeline, subject) twice returns the SAME run, never a duplicate", async () => {
    const { orgId, projectId } = await seedOrgProject()
    const subjectId = `subject-${randomUUID()}`
    const first = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId })
    const second = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId })
    expect(second.id).toBe(first.id)
  })

  it("a NEW run for the same subject is allowed once the prior run reaches a terminal state", async () => {
    const { orgId, projectId } = await seedOrgProject()
    const subjectId = `subject-${randomUUID()}`
    const first = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId })
    await finalizeWorkflow(first.id, orgId, "succeeded")
    const second = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId })
    expect(second.id).not.toBe(first.id)
  })
})

describe("workflow engine — cancel/pause/resume/retry (§29)", () => {
  it("cancel/pause/resume validate the state machine and reject an invalid action", async () => {
    const { orgId, projectId } = await seedOrgProject()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: `s-${randomUUID()}` })
    const paused = await workflowEngine.pause(run.id, orgId)
    expect(paused.status).toBe("paused")
    const resumed = await workflowEngine.resume(run.id, orgId)
    expect(resumed.status).toBe("running")
    await finalizeWorkflow(run.id, orgId, "succeeded")
    await expect(workflowEngine.pause(run.id, orgId)).rejects.toThrow(InvalidWorkflowTransitionError)
  })

  it("retry() moves a FAILED run through RETRYING back to RUNNING without throwing (regression: retry() must never attempt an illegal direct FAILED->RUNNING jump)", async () => {
    const { orgId, projectId } = await seedOrgProject()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "content_generation", subjectType: "opportunity", subjectId: `s-${randomUUID()}` })
    await finalizeWorkflow(run.id, orgId, "failed", { errorReason: "simulated failure" })
    const retried = await workflowEngine.retry(run.id, orgId)
    expect(retried.status).toBe("running")
    expect(retried.attemptCount).toBe(2)
  })
})

describe("checkpoint-resume (§4)", () => {
  it("a step already succeeded is never re-executed on the next call — its persisted output is reused", async () => {
    const { orgId, projectId } = await seedOrgProject()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: `s-${randomUUID()}` })

    let executions = 0
    const fn = async () => {
      executions += 1
      return { output: { done: true }, checkpointData: { marker: "step-1" } }
    }

    const first = await runStep(run, 1, "crawl", null, fn)
    expect(first.output).toEqual({ done: true })
    expect(executions).toBe(1)

    // simulate a resume: fetch the run fresh (as an API-triggered resume would) and re-run the same step
    const freshRun = (await repo.getWorkflowRun(run.id, orgId))!
    const second = await runStep(freshRun, 1, "crawl", null, fn)
    expect(second.output).toEqual({ done: true })
    expect(executions).toBe(1) // NOT re-executed
  })

  it("updateCheckpoint persists denormalized progress without going through the state machine", async () => {
    const { orgId, projectId } = await seedOrgProject()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: `s-${randomUUID()}` })
    await runStep(run, 1, "crawl", null, async () => ({ output: {} }))
    const updated = (await repo.getWorkflowRun(run.id, orgId))!
    expect(updated.status).toBe("running") // unchanged — checkpointing is metadata, not a transition
    expect(updated.checkpoint).toEqual({ lastCompletedStep: "crawl", lastCompletedSequence: 1 })
  })
})

describe("retry with backoff (§5)", () => {
  it("a transient error retries in-process and eventually succeeds, recording every attempt", async () => {
    const { orgId, projectId } = await seedOrgProject()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: `s-${randomUUID()}` })
    let attempts = 0
    const result = await runStep(
      run,
      1,
      "crawl",
      null,
      async () => {
        attempts += 1
        if (attempts < 3) {
          const err = new Error("Request timeout while fetching page")
          throw err
        }
        return { output: { ok: true } }
      },
      { maxAttempts: 5, baseMs: 1, backoffMultiplier: 1, maxBackoffMs: 5 },
    )
    expect(attempts).toBe(3)
    expect(result.output).toEqual({ ok: true })
    const steps = await repo.listSteps(run.id, orgId)
    expect(steps.find((s) => s.step === "crawl")?.status).toBe("succeeded")
  })

  it("a non-retryable error (ValidationError) fails immediately, never retried", async () => {
    const { orgId, projectId } = await seedOrgProject()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: `s-${randomUUID()}` })
    let attempts = 0
    class ValidationError extends Error {
      constructor(m: string) {
        super(m)
        this.name = "ValidationError"
      }
    }
    await expect(
      runStep(run, 1, "crawl", null, async () => {
        attempts += 1
        throw new ValidationError("bad input")
      }),
    ).rejects.toThrow("bad input")
    expect(attempts).toBe(1)
  })
})

describe("budget enforcement (§10)", () => {
  it("assertWithinBudget throws BudgetExceededError the moment a limit is crossed, per-dimension", () => {
    expect(() => assertWithinBudget({ tokens: 100, costUsd: 0, durationMs: 0, steps: 0 }, { maxTokens: 50 })).toThrow(BudgetExceededError)
    expect(() => assertWithinBudget({ tokens: 0, costUsd: 5, durationMs: 0, steps: 0 }, { maxCostUsd: 1 })).toThrow(BudgetExceededError)
    expect(() => assertWithinBudget(emptyUsage(), DEFAULT_BUDGET)).not.toThrow()
  })

  it("a step that pushes usage past the run's own budget throws and the run's step is marked failed, not silently continued", async () => {
    const { orgId, projectId } = await seedOrgProject()
    const run = await workflowEngine.start({
      orgId,
      projectId,
      pipeline: "website_discovery",
      subjectType: "website",
      subjectId: `s-${randomUUID()}`,
      budget: { maxTokens: 10 },
    })
    await expect(runStep(run, 1, "crawl", null, async () => ({ output: {}, inputTokens: 20, outputTokens: 0 }))).rejects.toThrow(BudgetExceededError)
    const steps = await repo.listSteps(run.id, orgId)
    expect(steps.find((s) => s.step === "crawl")?.status).toBe("failed")
  })
})

describe("capability permissions (§11)", () => {
  it("an agent may only act within its own declared capability allow-list", () => {
    expect(() => assertCapability("WebsiteDiscoveryAgent", "crawl_website")).not.toThrow()
    expect(() => assertCapability("WebsiteDiscoveryAgent", "publish_page_version")).toThrow(CapabilityDeniedError)
    expect(() => assertCapability("ContentGenerationAgent", "delete_tenant_data")).toThrow(CapabilityDeniedError)
  })
})

describe("durable human approval (§12-13)", () => {
  it("requesting approval pauses the workflow at WAITING_APPROVAL; approving resumes it exactly once", async () => {
    const { orgId, projectId, userId } = await seedOrgProject()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "content_generation", subjectType: "opportunity", subjectId: `s-${randomUUID()}` })
    const approval = await requestApproval({
      orgId,
      projectId,
      workflowRunId: run.id,
      artifactType: "page",
      artifactId: `page-${randomUUID()}`,
      requestedByAgent: "ContentGenerationAgent",
      approvalType: "publish",
      riskLevel: "low",
    })
    const paused = (await repo.getWorkflowRun(run.id, orgId))!
    expect(paused.status).toBe("waiting_approval")

    const decided = await decideApproval(approval.id, orgId, "approved", userId)
    expect(decided?.status).toBe("approved")
    const resumed = (await repo.getWorkflowRun(run.id, orgId))!
    expect(resumed.status).toBe("running")

    // idempotent resume: a second lookup for this artifact must see the decision already made
    const existingDecision = await getApprovalForArtifact(orgId, "page", approval.artifactId, "publish")
    expect(existingDecision?.status).toBe("approved")
  })

  it("rejecting an approval fails the workflow with a real reason, never auto-publishes", async () => {
    const { orgId, projectId, userId } = await seedOrgProject()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "content_generation", subjectType: "opportunity", subjectId: `s-${randomUUID()}` })
    const approval = await requestApproval({
      orgId,
      projectId,
      workflowRunId: run.id,
      artifactType: "page",
      artifactId: `page-${randomUUID()}`,
      requestedByAgent: "ContentGenerationAgent",
      approvalType: "publish",
      riskLevel: "medium",
    })
    await decideApproval(approval.id, orgId, "rejected", userId, "Not accurate enough")
    const failed = (await repo.getWorkflowRun(run.id, orgId))!
    expect(failed.status).toBe("failed")
    expect(failed.errorReason).toContain("Not accurate enough")
  })

  it("evaluatePublishAutonomy is a pure backend decision — LEVEL_0/1 never auto-publish regardless of quality", () => {
    const highQualityInput = {
      autonomyLevel: "LEVEL_1" as const,
      informationGainScore: 95,
      qualityScore: 95,
      riskLevel: "low" as const,
      factsVerified: true,
      schemaValid: true,
    }
    expect(evaluatePublishAutonomy(highQualityInput).autoPublishAllowed).toBe(false)

    const level4Input = { ...highQualityInput, autonomyLevel: "LEVEL_4" as const }
    expect(evaluatePublishAutonomy(level4Input).autoPublishAllowed).toBe(true)

    const level4RiskyInput = { ...level4Input, riskLevel: "high" as const }
    expect(evaluatePublishAutonomy(level4RiskyInput).autoPublishAllowed).toBe(false)
  })
})

describe("job queue (§7-9)", () => {
  it("dequeue never returns more than a tenant's concurrency ceiling worth of jobs for one pipeline type", async () => {
    const { orgId } = await seedOrgProject()
    const jobIds: string[] = []
    for (let i = 0; i < 5; i++) {
      const job = await enqueue({ orgId, type: "website_discovery", payload: { i } })
      jobIds.push(job.id)
    }
    // DEFAULT_CONCURRENCY_LIMITS.website_discovery is 3, and no runs are
    // active yet, so at most 3 of these 5 pending jobs should be admitted.
    const dequeued = await dequeue(`worker-${randomUUID()}`, 10)
    const forThisOrg = dequeued.filter((j) => j.orgId === orgId)
    expect(forThisOrg.length).toBeLessThanOrEqual(3)
    for (const job of forThisOrg) await ack(job.id)
  })

  it("enqueue with the same idempotencyKey never creates a second pending job", async () => {
    const { orgId } = await seedOrgProject()
    const key = `idem-${randomUUID()}`
    const first = await enqueue({ orgId, type: "content_generation", payload: {}, idempotencyKey: key })
    const second = await enqueue({ orgId, type: "content_generation", payload: {}, idempotencyKey: key })
    expect(second.id).toBe(first.id)
  })
})
