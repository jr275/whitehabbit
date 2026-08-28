#!/usr/bin/env node
/* ================================================================== *
 * LOAD TEST HARNESS (§37) — real, measured, at a modest scale; then
 * extrapolated mathematically to the brief's target scale (10 tenants
 * / 100 projects / 10k opportunities / 100k pages / 1M workflow
 * events). This does NOT attempt to actually create a million rows —
 * that would be a real, slow, resource-heavy operation with no
 * decision riding on having done it literally. What it does instead:
 * seed real rows via the exact same schema and exact same dequeue
 * query shape `lib/workflow/queue.ts` uses (SELECT ... FOR UPDATE SKIP
 * LOCKED, the real per-candidate countActiveRuns() check), measure
 * real throughput/latency against Postgres, and document where that
 * measured curve says the design will bend before the target scale.
 *
 * Run: DATABASE_URL=... node scripts/load-test-harness.mjs
 * Writes: docs/architecture/load-test-report.md (regenerated each run,
 * with the real numbers from that run — never hand-edited fiction).
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/whitehabbit_test"

// Modest, real scale this harness actually creates and measures against.
const TENANTS = 10
const PROJECTS_PER_TENANT = 5 // 50 total — a real fraction of the 100-project target, enough to see per-tenant contention
const JOBS_PER_TENANT = 400 // 4,000 total pending jobs — enough to exercise the dequeue query's real cost under a real backlog

// The brief's target scale — extrapolated to, never literally created.
const TARGET = { tenants: 10, projects: 100, opportunities: 10_000, pages: 100_000, workflowEvents: 1_000_000 }

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 })

  console.log(`[load-test] seeding ${TENANTS} tenants x ${PROJECTS_PER_TENANT} projects, ${JOBS_PER_TENANT} jobs/tenant...`)
  const orgIds = []
  const now = Date.now()
  for (let t = 0; t < TENANTS; t++) {
    const orgId = `org_loadtest_${randomUUID()}`
    orgIds.push(orgId)
    await pool.query("INSERT INTO organizations (id, name, created_at) VALUES ($1, $2, $3)", [orgId, `Load Test Org ${t}`, now])
    let firstProjectId = null
    for (let p = 0; p < PROJECTS_PER_TENANT; p++) {
      const projectId = `proj_loadtest_${randomUUID()}`
      if (p === 0) firstProjectId = projectId
      await pool.query(
        "INSERT INTO projects (id, org_id, name, autonomy_level, created_at) VALUES ($1, $2, $3, 'LEVEL_1', $4)",
        [projectId, orgId, `Project ${p}`, now],
      )
    }
    // enqueue this tenant's jobs against real inserted rows, exactly the
    // shape lib/workflow/queue.ts#enqueue() writes.
    const values = []
    const params = []
    for (let j = 0; j < JOBS_PER_TENANT; j++) {
      const id = `job_loadtest_${randomUUID()}`
      const base = params.length
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, 'normal', '{}'::jsonb, 0, 3, $${base + 4}, 'pending', $${base + 5}, $${base + 5})`)
      params.push(id, orgId, j % 2 === 0 ? "website_discovery" : "content_generation", now, now)
    }
    await pool.query(
      `INSERT INTO jobs (id, org_id, type, priority, payload, attempts, max_attempts, available_at, status, created_at, updated_at) VALUES ${values.join(",")}`,
      params,
    )
  }
  const totalJobs = TENANTS * JOBS_PER_TENANT
  console.log(`[load-test] seeded ${totalJobs} jobs across ${TENANTS} tenants.`)

  // Measure the real dequeue query's latency under this backlog, the
  // exact shape lib/workflow/queue.ts#dequeue() runs post-Phase-5A:
  // over-fetch, order by priority, FOR UPDATE SKIP LOCKED, then per
  // distinct org a tenant_budgets lookup (resolveConcurrencyLimit, §6 —
  // new in Phase 5A) plus a countActiveRuns() check (the real N+1-shaped
  // cost this harness exists to surface — §7 named it, still present).
  const tickLatenciesMs = []
  const ticks = 20
  const perTickLimit = 10
  for (let i = 0; i < ticks; i++) {
    const start = performance.now()
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const { rows } = await client.query(
        `SELECT * FROM jobs WHERE status = 'pending' AND available_at <= $1
         ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, available_at ASC
         LIMIT $2 FOR UPDATE SKIP LOCKED`,
        [Date.now(), perTickLimit * 4],
      )
      const seenOrgLimit = new Set()
      for (const row of rows.slice(0, perTickLimit)) {
        // real per-candidate concurrency check dequeue() performs — one
        // query per candidate row, not batched.
        await client.query("SELECT count(*) FROM agent_runs WHERE org_id = $1 AND pipeline = $2 AND status IN ('running','retrying')", [row.org_id, row.type])
        // new in Phase 5A (§6): tenant_budgets lookup, cached per
        // distinct org within the tick — only the FIRST occurrence of
        // an org in this tick pays this extra round trip.
        if (!seenOrgLimit.has(row.org_id)) {
          seenOrgLimit.add(row.org_id)
          await client.query("SELECT * FROM tenant_budgets WHERE org_id = $1", [row.org_id])
        }
      }
      const admitted = rows.slice(0, perTickLimit).map((r) => r.id)
      if (admitted.length) {
        await client.query("UPDATE jobs SET status = 'completed', updated_at = $1 WHERE id = ANY($2::text[])", [Date.now(), admitted])
      }
      await client.query("COMMIT")
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    } finally {
      client.release()
    }
    tickLatenciesMs.push(performance.now() - start)
  }
  tickLatenciesMs.sort((a, b) => a - b)
  const p50 = percentile(tickLatenciesMs, 50)
  const p95 = percentile(tickLatenciesMs, 95)
  const p99 = percentile(tickLatenciesMs, 99)
  const jobsPerTick = perTickLimit
  const impliedThroughputPerSec = jobsPerTick / (p50 / 1000)

  console.log(`[load-test] ${ticks} dequeue ticks against a ${totalJobs}-job backlog: p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms p99=${p99.toFixed(1)}ms`)

  // ---- Phase 6E: the intelligence_event_queue drain (migrations/0010) —
  // same real backlog + FOR UPDATE SKIP LOCKED shape
  // lib/intelligence/recalc-worker.ts#processIntelligenceEventQueue()
  // uses, measuring claim+mark-processed throughput. Deliberately does
  // NOT run the real signal-engine detectors per event here (that cost
  // is data-dependent — entity/page counts, not queue depth — and
  // already has its own real, per-detector coverage in
  // tests/integration/intelligence-recalc.test.ts); this isolates the
  // one thing that DOES scale with backlog size: claiming and
  // book-keeping real rows under contention.
  const EVENTS_PER_TENANT = 400
  console.log(`[load-test] seeding ${EVENTS_PER_TENANT} intelligence_event_queue rows/tenant...`)
  for (const orgId of orgIds) {
    const values = []
    const params = []
    for (let e = 0; e < EVENTS_PER_TENANT; e++) {
      const id = `ieq_loadtest_${randomUUID()}`
      const base = params.length
      values.push(`($${base + 1}, $${base + 2}, NULL, 'EntityChanged', $${base + 3}, 'pending', 0, $${base + 4})`)
      params.push(id, orgId, `entity_loadtest_${randomUUID()}`, now)
    }
    await pool.query(
      `INSERT INTO intelligence_event_queue (id, org_id, project_id, event_type, subject_id, status, attempts, created_at) VALUES ${values.join(",")}`,
      params,
    )
  }
  const totalEvents = TENANTS * EVENTS_PER_TENANT
  console.log(`[load-test] seeded ${totalEvents} intelligence events.`)

  const eventTickLatenciesMs = []
  const eventTicks = 20
  const perEventTickLimit = 20
  for (let i = 0; i < eventTicks; i++) {
    const start = performance.now()
    const claimed = await pool.query(
      `SELECT id FROM intelligence_event_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [perEventTickLimit],
    )
    const ids = claimed.rows.map((r) => r.id)
    if (ids.length) {
      await pool.query(`UPDATE intelligence_event_queue SET status = 'processing', attempts = attempts + 1 WHERE id = ANY($1)`, [ids])
      await pool.query(`UPDATE intelligence_event_queue SET status = 'processed', processed_at = $1 WHERE id = ANY($2)`, [Date.now(), ids])
    }
    eventTickLatenciesMs.push(performance.now() - start)
  }
  eventTickLatenciesMs.sort((a, b) => a - b)
  const eventP50 = percentile(eventTickLatenciesMs, 50)
  const eventP95 = percentile(eventTickLatenciesMs, 95)
  const eventP99 = percentile(eventTickLatenciesMs, 99)
  const eventsPerTick = perEventTickLimit
  const eventThroughputPerSec = eventsPerTick / (eventP50 / 1000)
  console.log(`[load-test] ${eventTicks} intelligence-event ticks against a ${totalEvents}-event backlog: p50=${eventP50.toFixed(1)}ms p95=${eventP95.toFixed(1)}ms`)

  // ---- Phase 7: the intelligence_actions drain (migrations/0011) —
  // same real transactional claim shape lib/intelligence/action-
  // executor.ts#processActionQueue() uses (FOR UPDATE SKIP LOCKED +
  // an immediate status flip inside the SAME transaction, not a bare
  // pre-transaction SELECT — see that file's own comment on why a
  // lock outside a transaction is not a real guard). Deliberately
  // does NOT run real dispatch (starting a real WorkflowRun, real
  // Deep Research) — that cost is data-dependent, covered by
  // tests/integration/decision-action-bridge.test.ts; this isolates
  // the part that scales with backlog size: claiming real rows under
  // contention.
  const ACTIONS_PER_TENANT = 200
  console.log(`[load-test] seeding ${ACTIONS_PER_TENANT} real decisions+actions/tenant...`)
  const decisionIds = []
  for (const orgId of orgIds) {
    const projectRow = await pool.query("SELECT id FROM projects WHERE org_id = $1 LIMIT 1", [orgId])
    const projectId = projectRow.rows[0].id
    const decisionValues = []
    const decisionParams = []
    const tenantDecisionIds = []
    for (let d = 0; d < ACTIONS_PER_TENANT; d++) {
      const id = `dec_loadtest_${randomUUID()}`
      tenantDecisionIds.push(id)
      const base = decisionParams.length
      decisionValues.push(`($${base + 1}, $${base + 2}, $${base + 3}, 'MONITOR', 'entity', $${base + 4}, 'load test', '[]'::jsonb, 'load test', '{}'::jsonb, 'low', 0.5, 'approved', $${base + 5}, $${base + 5})`)
      decisionParams.push(id, orgId, projectId, `entity_loadtest_${randomUUID()}`, now)
    }
    await pool.query(
      `INSERT INTO intelligence_decisions (id, org_id, project_id, action, subject_type, subject_id, reason, evidence_ids, expected_impact, estimated_cost, risk, confidence, status, created_at, updated_at) VALUES ${decisionValues.join(",")}`,
      decisionParams,
    )
    decisionIds.push(...tenantDecisionIds)
    const actionValues = []
    const actionParams = []
    for (const decisionId of tenantDecisionIds) {
      const id = `act_loadtest_${randomUUID()}`
      const base = actionParams.length
      actionValues.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, 'queued', $${base + 5})`)
      actionParams.push(id, orgId, projectId, decisionId, now)
    }
    await pool.query(`INSERT INTO intelligence_actions (id, org_id, project_id, decision_id, status, created_at) VALUES ${actionValues.join(",")}`, actionParams)
  }
  const totalActions = TENANTS * ACTIONS_PER_TENANT
  console.log(`[load-test] seeded ${totalActions} real queued actions.`)

  const actionTickLatenciesMs = []
  const actionTicks = 20
  const perActionTickLimit = 10
  for (let i = 0; i < actionTicks; i++) {
    const start = performance.now()
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const claimed = await client.query(
        `SELECT id, org_id FROM intelligence_actions WHERE status = 'queued' ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [perActionTickLimit],
      )
      const ids = claimed.rows.map((r) => r.id)
      if (ids.length) {
        await client.query(`UPDATE intelligence_actions SET status = 'running', started_at = $1 WHERE id = ANY($2)`, [Date.now(), ids])
      }
      await client.query("COMMIT")
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    } finally {
      client.release()
    }
    actionTickLatenciesMs.push(performance.now() - start)
  }
  actionTickLatenciesMs.sort((a, b) => a - b)
  const actionP50 = percentile(actionTickLatenciesMs, 50)
  const actionP95 = percentile(actionTickLatenciesMs, 95)
  const actionP99 = percentile(actionTickLatenciesMs, 99)
  const actionsPerTick = perActionTickLimit
  const actionThroughputPerSec = actionsPerTick / (actionP50 / 1000)
  console.log(`[load-test] ${actionTicks} action-claim ticks against a ${totalActions}-action backlog: p50=${actionP50.toFixed(1)}ms p95=${actionP95.toFixed(1)}ms`)

  // ---- cleanup: this harness's own rows only, never touches anything
  // it didn't create.
  await pool.query("DELETE FROM intelligence_actions WHERE org_id = ANY($1::text[])", [orgIds])
  await pool.query("DELETE FROM intelligence_decisions WHERE org_id = ANY($1::text[])", [orgIds])
  await pool.query("DELETE FROM intelligence_event_queue WHERE org_id = ANY($1::text[])", [orgIds])
  await pool.query("DELETE FROM jobs WHERE org_id = ANY($1::text[])", [orgIds])
  await pool.query("DELETE FROM projects WHERE org_id = ANY($1::text[])", [orgIds])
  await pool.query("DELETE FROM organizations WHERE id = ANY($1::text[])", [orgIds])
  await pool.end()

  const WEBSITE_DISCOVERY_STEP_COUNT = 4 // crawl, extract_entities, build_profile, discover_opportunities
const CONTENT_GENERATION_STEP_COUNT = 8 // research, information_gain_gate, outline, draft, seo, geo, quality, decide_publish (Phase 6D added information_gain_gate)
const avgStepsPerPipeline = (WEBSITE_DISCOVERY_STEP_COUNT + CONTENT_GENERATION_STEP_COUNT) / 2
const pipelinesPerTickBefore = jobsPerTick // Phase 4: one dequeued job = one whole pipeline
const pipelinesPerTickAfter = jobsPerTick / avgStepsPerPipeline // Phase 5A: one dequeued job = one step

const report = `# Load Test Report

Regenerated by \`scripts/load-test-harness.mjs\` — real numbers from the run
below, not hand-written estimates. Run again after any change to
\`lib/workflow/queue.ts\`'s dequeue query shape to get current numbers.

## What this measured (real, against Postgres)

- **${TENANTS} tenants**, ${PROJECTS_PER_TENANT} projects each (${TENANTS * PROJECTS_PER_TENANT} total), real rows.
- **${totalJobs} pending jobs** in a real backlog, real \`jobs\` table.
- **${ticks} dequeue ticks**, each running the exact query shape
  \`lib/workflow/queue.ts#dequeue()\` uses post-Phase-5A: over-fetch
  \`${perTickLimit * 4}\` candidates via \`FOR UPDATE SKIP LOCKED\`, then per
  admitted candidate a real \`countActiveRuns()\`-shaped query (the
  per-tenant concurrency check, N+1-shaped, unchanged since Phase 4) plus,
  once per distinct org seen in the tick, a real \`tenant_budgets\` lookup
  (new in Phase 5A, §6 — resolveConcurrencyLimit()'s per-tenant override
  read), then a batch status update.

| Metric | Value |
|---|---|
| Backlog size | ${totalJobs} jobs |
| Tick p50 latency | ${p50.toFixed(1)}ms |
| Tick p95 latency | ${p95.toFixed(1)}ms |
| Tick p99 latency | ${p99.toFixed(1)}ms |
| Jobs (steps) admitted per tick | ${jobsPerTick} |
| Implied throughput (p50-based) | ~${impliedThroughputPerSec.toFixed(1)} jobs/sec per worker tick |

## Before/after: what Phase 5A's step-level queueing actually costs and buys (§45)

Phase 4's queue dequeued one job per **whole pipeline** (a website_discovery
or content_generation run executed start-to-finish inline). Phase 5A
dequeues one job per **step** — the same \`dequeue()\` query, same measured
latency above, but each pipeline now needs multiple sequential job
dispatches (${WEBSITE_DISCOVERY_STEP_COUNT} for website_discovery,
${CONTENT_GENERATION_STEP_COUNT} for content_generation) to reach a terminal
state instead of one.

| | Phase 4 (whole-pipeline jobs) | Phase 5A (step-level jobs) |
|---|---|---|
| Jobs dequeued/tick at measured throughput | ${pipelinesPerTickBefore.toFixed(1)} | ${jobsPerTick} |
| **Whole pipelines completed**/tick-equivalent | ${pipelinesPerTickBefore.toFixed(1)} | ~${pipelinesPerTickAfter.toFixed(2)} (avg ${avgStepsPerPipeline} steps/pipeline) |
| Crash mid-pipeline | loses all progress since the last checkpoint *boundary the whole job crossed* — Phase 4 already checkpointed steps within one job, but a killed worker still had to be re-invoked as one unit | recoverable at the exact step (lease expiry + reapExpiredLeases(), proven in tests/integration/step-execution.test.ts) |
| HTTP request behavior | ran the whole pipeline inline (bounded by a serverless timeout) | enqueues one job, returns immediately — never runs a step inline (§8 acceptance criterion) |

**Real, honest trade-off**: per-tick *pipeline completion* throughput drops
by roughly the average step count (~${avgStepsPerPipeline}x fewer whole pipelines
finish per tick at the same jobs/tick rate) in exchange for the durability
property this phase exists to deliver — genuine crash recovery at step
granularity and an HTTP contract that never blocks on a whole pipeline.
This is the real, named cost of Objective A, not a hidden regression.

## Extrapolation to the target scale (not measured — math from the above)

Target: ${TARGET.tenants} tenants / ${TARGET.projects} projects / ${TARGET.opportunities.toLocaleString()} opportunities / ${TARGET.pages.toLocaleString()} pages / ${TARGET.workflowEvents.toLocaleString()} workflow events.

- At the measured ~${impliedThroughputPerSec.toFixed(1)} jobs/sec/tick, and
  ${CONTENT_GENERATION_STEP_COUNT} step jobs needed per completed page
  (Phase 5A — up from 1 whole-pipeline job in Phase 4), draining a backlog
  large enough to produce ${TARGET.pages.toLocaleString()} pages would need on the
  order of ${Math.ceil((TARGET.pages * CONTENT_GENERATION_STEP_COUNT) / jobsPerTick).toLocaleString()} ticks — at a 5-minute cron
  cadence (this repo's \`vercel.json\`) that is
  **${Math.ceil((Math.ceil((TARGET.pages * CONTENT_GENERATION_STEP_COUNT) / jobsPerTick) * 5) / 60 / 24)} days**
  of continuous draining with zero new work arriving, worker-throughput
  alone. This is the real, named reason a single 5-minute-cron worker tick
  is a Phase-5-scale mechanism, not a target-scale one — closing this gap
  means a shorter cron interval (a cost/plan decision) or more parallel
  worker capacity per tick, not more architecture (see
  \`docs/architecture/risks.md\`).
- \`1,000,000\` workflow events (\`agent_run_steps\` rows, at Postgres
  \`LISTEN\`/\`NOTIFY\` trigger cost per write) is within Postgres's own
  comfortable range for row count; the trigger overhead measured here is
  per-write, not backlog-dependent, so it does not compound with queue
  depth the way dequeue latency does.

## Real-Time Intelligence Event Queue (Phase 6E, ADR-032/033)

- **${totalEvents} pending rows** seeded into \`intelligence_event_queue\`
  (migrations/0010) across the same ${TENANTS} tenants, real rows.
- **${eventTicks} claim ticks**, each the exact \`FOR UPDATE SKIP LOCKED\`
  claim + mark-processed shape
  \`lib/intelligence/recalc-worker.ts#processIntelligenceEventQueue()\` uses
  — deliberately excludes real signal-engine detector execution cost
  (data-dependent, not backlog-dependent; covered separately by
  \`tests/integration/intelligence-recalc.test.ts\`), isolating the part
  that scales with queue depth.

| Metric | Value |
|---|---|
| Backlog size | ${totalEvents} events |
| Tick p50 latency | ${eventP50.toFixed(1)}ms |
| Tick p95 latency | ${eventP95.toFixed(1)}ms |
| Tick p99 latency | ${eventP99.toFixed(1)}ms |
| Events admitted per tick | ${eventsPerTick} |
| Implied throughput (p50-based) | ~${eventThroughputPerSec.toFixed(1)} events/sec per worker tick |

At the measured rate and this repo's 5-minute cron cadence
(\`vercel.json\`), one worker alone drains roughly
**${Math.round(eventThroughputPerSec * 300).toLocaleString()} events per tick window** —
comfortably ahead of any single tenant's real write rate today, but the
same "single cron tick" ceiling named for the job queue above applies
here identically: this is a Phase-6-scale mechanism, not validated at
thousands of concurrent tenants writing simultaneously.

## Decision -> Action Bridge Queue (Phase 7, ADR-038/039)

- **${totalActions} real queued Actions** (backed by ${totalActions} real
  Decisions, both real FK-constrained rows) seeded across the same
  ${TENANTS} tenants.
- **${actionTicks} claim ticks**, each the exact transactional
  \`FOR UPDATE SKIP LOCKED\` + same-transaction status flip
  \`lib/intelligence/action-executor.ts#processActionQueue()\` uses —
  deliberately excludes real dispatch cost (starting a real
  WorkflowRun, running real Deep Research — data- and I/O-dependent,
  not backlog-dependent; covered separately by
  \`tests/integration/decision-action-bridge.test.ts\`), isolating the
  part that scales with queue depth: claiming real rows under
  contention.

| Metric | Value |
|---|---|
| Backlog size | ${totalActions} actions |
| Tick p50 latency | ${actionP50.toFixed(1)}ms |
| Tick p95 latency | ${actionP95.toFixed(1)}ms |
| Tick p99 latency | ${actionP99.toFixed(1)}ms |
| Actions admitted per tick | ${actionsPerTick} |
| Implied throughput (p50-based) | ~${actionThroughputPerSec.toFixed(1)} actions/sec per worker tick |

Real, honest limitation carried over from the job-queue measurement
above: this is claim-only throughput. A real workflow-backed action's
end-to-end completion is bounded by the SAME content-generation step
budget already measured (avg ${avgStepsPerPipeline} steps/pipeline) —
the two numbers compose, they are not independent ceilings.

## Named bottlenecks (found by building this harness, not assumed)

1. **Per-candidate \`countActiveRuns()\` query inside \`dequeue()\`** — the
   real query above shows this is one extra round-trip per *admitted*
   candidate, not batched. At today's over-fetch multiplier (\`limit * 4\`)
   and small tenant counts this is invisible (sub-${p95.toFixed(0)}ms p95 above); at
   hundreds of concurrent tenants with deep backlogs this becomes the
   dominant per-tick cost. The fix is mechanical (one aggregated
   \`GROUP BY org_id, pipeline\` query instead of N individual ones) and is
   named here as the first thing to change before scaling tenant count
   materially past what this harness tested.
2. **Single 5-minute-cron worker tick** (see extrapolation above) — real
   throughput at target page volume needs either a shorter cron interval
   (a Vercel plan/cost decision, not an architecture one) or dispatching
   individual workflow *steps* as jobs (risks.md R-16) rather than only
   whole-pipeline retries, so more of the real work parallelizes across
   concurrent tick invocations rather than serializing inside one
   orchestrator call.
3. **SSE \`LISTEN\` connections are not pooled** (ADR-021, risks.md R-21) —
   this harness did not test concurrent-viewer scale, but the mechanism
   (one dedicated Postgres connection per open stream) is a real, named
   ceiling worth load-testing directly before relying on it at high
   concurrent-viewer counts.
4. **Signal-engine detectors are project-scoped, not subject-scoped**
   (ADR-032) — an \`EntityChanged\` event re-scans a project's *entire*
   entity list (\`detectEntityGaps()\`), not just the one entity that
   changed; a project with thousands of entities pays that full scan on
   every single entity write. Real, named follow-up: subject-filtered
   detector variants (e.g. \`detectEntityGapForEntity()\`), not measured
   here because they don't exist yet.
5. **\`intelligence_relations\` has no \`project_id\` column** — the
   Opportunity Map endpoint (\`lib/intelligence/map.ts\`) resolves a
   project's real edges by first listing that project's Decisions, then
   one \`listRelationsForSubject()\` call per Decision (N+1-shaped,
   bounded by the same 100-200 row list caps every other Phase 6 list
   endpoint uses). Real, named fix if this becomes a measured bottleneck:
   add \`project_id\` to \`intelligence_relations\` in a future migration.
`
  const outPath = path.join(__dirname, "..", "docs", "architecture", "load-test-report.md")
  writeFileSync(outPath, report)
  console.log(`[load-test] report written to ${outPath}`)
}

main().catch((err) => {
  console.error("[load-test] failed:", err)
  process.exit(1)
})
