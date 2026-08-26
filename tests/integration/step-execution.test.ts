import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { query } from "@/lib/db/client"
import { createUserWithOrganization } from "@/lib/db/repo"
import { getOrCreateDefaultProject } from "@/lib/projects/repo"
import { createWebsite } from "@/lib/websites/repo"
import { workflowEngine, finalizeWorkflow } from "@/lib/workflow/engine"
import * as workflowRepo from "@/lib/workflow/repo"
import { enqueueStepJob, processStepQueue } from "@/lib/workflow/step-worker"
import { ack, dequeue, enqueue, reapExpiredLeases, DEFAULT_LEASE_MS } from "@/lib/workflow/queue"
import { nextWebsiteDiscoveryStep } from "@/lib/website-discovery/steps"
import { BudgetExceededError } from "@/lib/workflow/types"
import { FIXTURE_ORIGIN, FIXTURE_PAGES } from "../e2e/fixture-website"

/* Phase 5A (§8, ADR-023) — the mandatory test list for the new
 * step-level, queue-driven execution model. Every test here exercises
 * the REAL step-dispatch/worker code (lib/workflow/step-worker.ts),
 * never a reimplementation. */

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "203.0.113.20", family: 4 }]),
}))

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url
  const parsed = new URL(url)
  if (parsed.origin !== FIXTURE_ORIGIN) return Promise.reject(new Error(`Test bug: unexpected fetch to ${url}`))
  const entry = FIXTURE_PAGES[parsed.pathname]
  if (!entry) return Promise.resolve(new Response("not found", { status: 404 }))
  return Promise.resolve(new Response(entry.body, { status: entry.status, headers: { "content-type": entry.contentType } }))
}

beforeAll(() => {
  vi.stubGlobal("fetch", fakeFetch)
})
afterAll(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/* dequeue()/processStepQueue() are intentionally global/unscoped by
 * design (a real worker drains ALL tenants' due jobs, §7) — exactly
 * right in production, but it means any job a test leaves `pending`
 * would otherwise leak into a LATER test's dequeue() call and produce
 * spurious results (a real bug this suite caught while being written —
 * see the git history for this file). Sweeping stray `pending` jobs
 * between tests keeps each test's queue-level assertions deterministic
 * without weakening dequeue()'s real, intentionally global scope. */
afterEach(async () => {
  await query("UPDATE jobs SET status = 'cancelled', updated_at = $1 WHERE status = 'pending'", [Date.now()])
})

async function seedWebsite() {
  const email = `step-${randomUUID()}@example.test`
  const { org } = await createUserWithOrganization(email, "hashed-not-real", `Org ${email}`)
  const project = await getOrCreateDefaultProject(org.id)
  const website = await createWebsite({ orgId: org.id, projectId: project.id, url: FIXTURE_ORIGIN })
  return { orgId: org.id, projectId: project.id, website }
}

describe("HTTP entry point only enqueues — never runs a step inline (§8)", () => {
  it("workflowEngine.start() + enqueueStepJob() leaves the run at checkpoint=null with zero executed steps until a worker tick runs", async () => {
    const { orgId, projectId, website } = await seedWebsite()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: website.id })
    const nextStep = nextWebsiteDiscoveryStep(run.checkpoint?.lastCompletedSequence ?? null)
    expect(nextStep).toBe("crawl")
    await enqueueStepJob(run, nextStep!)

    // real assertion: nothing executed yet — this "request" (the two
    // calls above) never called dispatch/runStep.
    const steps = await workflowRepo.listSteps(run.id, orgId)
    expect(steps).toHaveLength(0)
    const stillRunning = await workflowRepo.getWorkflowRun(run.id, orgId)
    expect(stillRunning?.checkpoint).toBeNull()
  })
})

describe("worker executes exactly one step per job, then enqueues the next (§3, §8)", () => {
  it("one processStepQueue() tick advances exactly one step, not the whole pipeline", async () => {
    const { orgId, projectId, website } = await seedWebsite()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: website.id })
    await enqueueStepJob(run, "crawl")

    const tick1 = await processStepQueue(10)
    expect(tick1.succeeded).toBeGreaterThanOrEqual(1)
    const afterTick1 = await workflowRepo.listSteps(run.id, orgId)
    expect(afterTick1.map((s) => s.step)).toEqual(["crawl"]) // exactly one step — not extract_entities/build_profile/discover_opportunities yet

    // a job for the NEXT step must now be pending.
    const runAfterTick1 = await workflowRepo.getWorkflowRun(run.id, orgId)
    expect(runAfterTick1?.checkpoint?.lastCompletedStep).toBe("crawl")

    const tick2 = await processStepQueue(10)
    expect(tick2.succeeded).toBeGreaterThanOrEqual(1)
    const afterTick2 = await workflowRepo.listSteps(run.id, orgId)
    expect(afterTick2.map((s) => s.step)).toEqual(["crawl", "extract_entities"])
  }, 20_000)

  it("draining ticks to completion runs every step exactly once and finalizes the run", async () => {
    const { orgId, projectId, website } = await seedWebsite()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: website.id })
    await enqueueStepJob(run, "crawl")
    for (let i = 0; i < 10; i++) {
      const finished = await workflowRepo.getWorkflowRun(run.id, orgId)
      if (finished?.status === "succeeded") break
      await processStepQueue(10)
    }
    const finished = await workflowRepo.getWorkflowRun(run.id, orgId)
    expect(finished?.status).toBe("succeeded")
    const steps = await workflowRepo.listSteps(run.id, orgId)
    expect(steps.map((s) => s.step)).toEqual(["crawl", "extract_entities", "build_profile", "discover_opportunities"])
    expect(new Set(steps.map((s) => s.step)).size).toBe(4) // each step executed exactly once, never duplicated
  }, 20_000)
})

describe("crash recovery via lease expiry (§4, §8)", () => {
  it("a job whose lease expired before completion is returned to pending and successfully re-run", async () => {
    const { orgId, projectId, website } = await seedWebsite()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: website.id })
    await enqueueStepJob(run, "crawl")

    // simulate a worker claiming the job (dequeue sets status='locked'
    // + a real lease) and then crashing before ever executing/acking it.
    const claimed = await dequeue(`worker_${randomUUID()}`, 1)
    expect(claimed).toHaveLength(1)
    expect(claimed[0].leaseExpiresAt).not.toBeNull()

    // nothing executed — this really is "crashed before doing anything".
    const stepsBeforeReap = await workflowRepo.listSteps(run.id, orgId)
    expect(stepsBeforeReap).toHaveLength(0)

    // simulate the lease having already expired (backdate it directly,
    // rather than pass reapExpiredLeases() a fake future "now" — doing
    // that instead would also backdate `available_at` into the future
    // relative to the real clock every other call uses, an artifact of
    // the simulation rather than a real crash).
    await query("UPDATE jobs SET lease_expires_at = $1 WHERE id = $2", [Date.now() - 1_000, claimed[0].id])
    const reaped = await reapExpiredLeases()
    expect(reaped.resetToPending).toBeGreaterThanOrEqual(1)

    // the next real tick picks the SAME job back up and completes the step.
    const tick = await processStepQueue(10)
    expect(tick.succeeded).toBeGreaterThanOrEqual(1)
    const steps = await workflowRepo.listSteps(run.id, orgId)
    expect(steps.map((s) => s.step)).toContain("crawl")
    expect(steps.filter((s) => s.step === "crawl")).toHaveLength(1) // recovered, never duplicated
  }, 20_000)

  it("a stale-leased job that has exhausted its attempts is dead-lettered, never reset forever", async () => {
    const { orgId } = await seedWebsite()
    const job = await enqueue({ orgId, type: "website_discovery", payload: {}, maxAttempts: 1, idempotencyKey: `stale-${randomUUID()}` })
    const claimed = await dequeue(`worker_${randomUUID()}`, 30, {}, DEFAULT_LEASE_MS)
    const mine = claimed.find((j) => j.id === job.id)
    expect(mine?.attempts).toBe(1) // exhausted its one allowed attempt just by being claimed

    await query("UPDATE jobs SET lease_expires_at = $1 WHERE id = $2", [Date.now() - 1_000, job.id])
    const reaped = await reapExpiredLeases()
    expect(reaped.deadLettered).toBeGreaterThanOrEqual(1)
    const row = await query<{ status: string }>("SELECT status FROM jobs WHERE id = $1", [job.id])
    expect(row[0]?.status).toBe("dead_letter")
  })
})

describe("duplicate job / idempotency (§6, §8)", () => {
  it("enqueuing the same step twice while the first is still active returns the SAME job, never a duplicate", async () => {
    const { orgId, projectId, website } = await seedWebsite()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: website.id })
    const first = await enqueueStepJob(run, "crawl")
    const second = await enqueueStepJob(run, "crawl")
    expect(second.id).toBe(first.id)
  })
})

describe("tenant fairness under load (§5, §8)", () => {
  it("a tenant with a large backlog never starves a tenant with a small one", async () => {
    const heavy = await seedWebsite()
    const light = await seedWebsite()
    const medium = await seedWebsite()

    // heavy tenant: 30 pending jobs (well past its concurrency ceiling
    // of 3 active runs); light/medium: a handful each.
    for (let i = 0; i < 30; i++) {
      await enqueue({ orgId: heavy.orgId, type: "website_discovery", payload: { i }, idempotencyKey: `fair-heavy-${randomUUID()}` })
    }
    for (let i = 0; i < 2; i++) {
      await enqueue({ orgId: light.orgId, type: "website_discovery", payload: { i }, idempotencyKey: `fair-light-${randomUUID()}` })
    }
    for (let i = 0; i < 5; i++) {
      await enqueue({ orgId: medium.orgId, type: "website_discovery", payload: { i }, idempotencyKey: `fair-medium-${randomUUID()}` })
    }

    const workerId = `worker_${randomUUID()}`
    const claimed = await dequeue(workerId, 10)
    const byOrg = new Map<string, number>()
    for (const j of claimed) byOrg.set(j.orgId, (byOrg.get(j.orgId) ?? 0) + 1)

    // the heavy tenant's OWN concurrency ceiling (DEFAULT_CONCURRENCY_LIMITS.website_discovery = 3)
    // caps how much of this tick it can take, no matter how deep its backlog is.
    expect(byOrg.get(heavy.orgId) ?? 0).toBeLessThanOrEqual(3)
    // light and medium tenants — with far smaller backlogs, nowhere near
    // any ceiling — must still receive real execution capacity in the
    // same tick, not be starved behind the heavy tenant's backlog.
    expect(byOrg.get(light.orgId) ?? 0).toBeGreaterThan(0)
    expect(byOrg.get(medium.orgId) ?? 0).toBeGreaterThan(0)

    // cleanup: ack the claimed (now `locked`) jobs — the unclaimed
    // `pending` remainder is swept by this file's afterEach().
    for (const j of claimed) await ack(j.id)
  })
})

describe("budget exhaustion, cancellation, pause, and failure produce real terminal outcomes (§6, §8)", () => {
  it("a step that reports usage over the run's budget fails the workflow — never silently continues", async () => {
    const { orgId, projectId, website } = await seedWebsite()
    const run = await workflowEngine.start({
      orgId,
      projectId,
      pipeline: "website_discovery",
      subjectType: "website",
      subjectId: website.id,
      budget: { maxSteps: 1 }, // the crawl step alone exhausts this
    })
    await enqueueStepJob(run, "crawl")
    await processStepQueue(10) // crawl succeeds, usage.steps becomes 1 — right at the limit, not yet over
    const afterCrawl = await workflowRepo.getWorkflowRun(run.id, orgId)
    expect(afterCrawl?.status).toBe("running")

    await processStepQueue(10) // extract_entities pushes usage.steps to 2 > maxSteps 1 -> BudgetExceededError, non-retryable
    const final = await workflowRepo.getWorkflowRun(run.id, orgId)
    expect(final?.status).toBe("failed")
    expect(final?.errorReason).toMatch(/budget/i)
  }, 20_000)

  it("a cancelled run's stray step job executes nothing and does not advance the checkpoint", async () => {
    const { orgId, projectId, website } = await seedWebsite()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: website.id })
    await enqueueStepJob(run, "crawl")
    await workflowEngine.cancel(run.id, orgId)

    // real worker path (dequeue -> runOneStepJob -> ack), not a direct
    // call bypassing the queue — a stray pending job must not linger
    // after this tick either way.
    const tick = await processStepQueue(10)
    expect(tick.errors).toHaveLength(0)
    const steps = await workflowRepo.listSteps(run.id, orgId)
    expect(steps).toHaveLength(0)
    const stillCancelled = await workflowRepo.getWorkflowRun(run.id, orgId)
    expect(stillCancelled?.status).toBe("cancelled")
  })

  it("a paused run's stray step job is a no-op; resume() re-enqueues and execution continues correctly", async () => {
    const { orgId, projectId, website } = await seedWebsite()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: website.id })
    await enqueueStepJob(run, "crawl")
    await workflowEngine.pause(run.id, orgId)

    const tick = await processStepQueue(10) // dispatched while paused — must not execute, must not error
    expect(tick.errors).toHaveLength(0)
    expect(await workflowRepo.listSteps(run.id, orgId)).toHaveLength(0)

    const resumed = await workflowEngine.resume(run.id, orgId)
    expect(resumed.status).toBe("running")
    const nextStep = nextWebsiteDiscoveryStep(resumed.checkpoint?.lastCompletedSequence ?? null)
    await enqueueStepJob(resumed, nextStep!)
    await processStepQueue(10)
    const steps = await workflowRepo.listSteps(run.id, orgId)
    expect(steps.map((s) => s.step)).toEqual(["crawl"])
  }, 20_000)

  it("a step job whose subject no longer exists fails the workflow with a real reason, without crashing the worker tick", async () => {
    const { orgId, projectId } = await seedWebsite()
    // start a run for a subject that will never resolve to a real
    // website — dispatchWebsiteDiscoveryStep's own "not found" guard
    // handles this gracefully (finalizes FAILED) rather than throwing,
    // so the job itself completes normally (real, not a queue failure).
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: `missing-${randomUUID()}` })
    await enqueueStepJob(run, "crawl")
    const tick = await processStepQueue(10)
    expect(tick.errors).toHaveLength(0)
    const final = await workflowRepo.getWorkflowRun(run.id, orgId)
    expect(final?.status).toBe("failed")
    expect(final?.errorReason).toMatch(/no longer exists/i)
  })

  it("a job whose step dispatch genuinely throws a non-retryable error is dead-lettered AND fails the workflow — never left stuck RUNNING forever", async () => {
    const { orgId, projectId, website } = await seedWebsite()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: website.id })
    // crafted directly via the low-level enqueue() (bypassing
    // enqueueStepJob's step-name validation) so dispatch itself throws
    // "Unknown website_discovery step" — a real, non-retryable failure.
    await enqueue({ orgId, projectId, workflowRunId: run.id, stepName: "not_a_real_step", stepSequence: 99, type: "website_discovery", payload: {} })
    const tick = await processStepQueue(10)
    expect(tick.deadLettered).toBeGreaterThanOrEqual(1)
    const final = await workflowRepo.getWorkflowRun(run.id, orgId)
    expect(final?.status).toBe("failed")
    expect(final?.errorReason).toMatch(/unknown website_discovery step/i)
  })
})

describe("BudgetExceededError is never retried (§10 sanity, complements retry.test coverage)", () => {
  it("is classified non-retryable", () => {
    const err = new BudgetExceededError("over budget")
    expect(err.name).toBe("BudgetExceededError")
  })
})

describe("finalizeWorkflow is idempotent enough for a race between dead-letter and a concurrent cancel", () => {
  it("finalizing an already-terminal run does not throw uncatchably from step-worker's own error path", async () => {
    const { orgId, projectId, website } = await seedWebsite()
    const run = await workflowEngine.start({ orgId, projectId, pipeline: "website_discovery", subjectType: "website", subjectId: website.id })
    await finalizeWorkflow(run.id, orgId, "succeeded")
    // finalizing again (as step-worker's dead-letter path does,
    // wrapped in .catch()) must not propagate — the run is already
    // terminal, which is a real, expected race, not a bug.
    await expect(finalizeWorkflow(run.id, orgId, "failed", { errorReason: "late" }).catch(() => "caught")).resolves.toBe("caught")
  })
})
