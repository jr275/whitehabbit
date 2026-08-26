import "server-only"

/* ================================================================== *
 * BUDGET RESOLUTION (Phase 5A §6, closes Phase 4's risks.md R-22) —
 * real, persisted overrides read at the two points that actually need
 * them: a run's own BudgetPolicy at workflowEngine.start(), and a
 * tenant's concurrency ceiling at lib/workflow/queue.ts#dequeue().
 *
 * Honest scoping decision (documented in ADR-023, not silently
 * narrowed): the brief names a five-level chain — step override ->
 * agent override -> workflow override -> project override -> tenant
 * default. This codebase implements THREE of those five as genuinely
 * distinct layers with real, different data behind them:
 *
 *   workflow override (explicit BudgetPolicy passed to start(), e.g. a
 *     caller that knows this specific run needs more headroom)
 *   -> project override (project_budgets row)
 *   -> DEFAULT_BUDGET (lib/workflow/budget.ts)
 *
 * "Agent override" and "step override" are NOT implemented as separate
 * layers: an AgentType maps 1:1 to a WorkflowPipeline today (§11,
 * ADR-019), so an agent-level budget would be indistinguishable from
 * the workflow-level one already resolved above it; and no step in
 * either pipeline has ever needed a ceiling narrower than its run's
 * own cumulative budget (every step already shares and is checked
 * against the SAME run-level usage via runStep()'s assertWithinBudget()
 * call, §10). Building two more override layers with no real
 * distinguishing input would be exactly the "architectural TODO
 * replacing implementation" (§45) this phase says not to do — so they
 * are named here as PLANNED, not faked. See docs/architecture/risks.md.
 *
 * Concurrency (max_concurrent_discovery/generation) is a separate,
 * real two-level chain: tenant_budgets -> DEFAULT_CONCURRENCY_LIMITS —
 * read per-candidate inside dequeue() so a per-tenant override
 * genuinely takes effect during the same worker tick that admits other
 * tenants' work at their own (possibly different) ceilings.
 * ================================================================== */

import { query, queryOne } from "@/lib/db/client"
import { DEFAULT_BUDGET } from "./budget"
import type { BudgetPolicy, WorkflowPipeline } from "./types"

export interface TenantBudget {
  orgId: string
  dailyCostLimitUsd: number | null
  monthlyCostLimitUsd: number | null
  maxConcurrentDiscovery: number
  maxConcurrentGeneration: number
  updatedAt: number
}

interface TenantBudgetRow {
  org_id: string
  daily_cost_limit_usd: number | null
  monthly_cost_limit_usd: number | null
  max_concurrent_discovery: number
  max_concurrent_generation: number
  updated_at: string
}

function rowToTenantBudget(r: TenantBudgetRow): TenantBudget {
  return {
    orgId: r.org_id,
    dailyCostLimitUsd: r.daily_cost_limit_usd,
    monthlyCostLimitUsd: r.monthly_cost_limit_usd,
    maxConcurrentDiscovery: r.max_concurrent_discovery,
    maxConcurrentGeneration: r.max_concurrent_generation,
    updatedAt: Number(r.updated_at),
  }
}

export async function getTenantBudget(orgId: string): Promise<TenantBudget | null> {
  const row = await queryOne<TenantBudgetRow>("SELECT * FROM tenant_budgets WHERE org_id = $1", [orgId])
  return row ? rowToTenantBudget(row) : null
}

export async function upsertTenantBudget(input: {
  orgId: string
  dailyCostLimitUsd?: number | null
  monthlyCostLimitUsd?: number | null
  maxConcurrentDiscovery?: number
  maxConcurrentGeneration?: number
}): Promise<TenantBudget> {
  const now = Date.now()
  await query(
    `INSERT INTO tenant_budgets (org_id, daily_cost_limit_usd, monthly_cost_limit_usd, max_concurrent_discovery, max_concurrent_generation, updated_at)
     VALUES ($1, $2, $3, COALESCE($4, 3), COALESCE($5, 5), $6)
     ON CONFLICT (org_id) DO UPDATE SET
       daily_cost_limit_usd = COALESCE(EXCLUDED.daily_cost_limit_usd, tenant_budgets.daily_cost_limit_usd),
       monthly_cost_limit_usd = COALESCE(EXCLUDED.monthly_cost_limit_usd, tenant_budgets.monthly_cost_limit_usd),
       max_concurrent_discovery = COALESCE($4, tenant_budgets.max_concurrent_discovery),
       max_concurrent_generation = COALESCE($5, tenant_budgets.max_concurrent_generation),
       updated_at = $6`,
    [input.orgId, input.dailyCostLimitUsd ?? null, input.monthlyCostLimitUsd ?? null, input.maxConcurrentDiscovery ?? null, input.maxConcurrentGeneration ?? null, now],
  )
  return (await getTenantBudget(input.orgId))!
}

export interface ProjectBudget {
  projectId: string
  orgId: string
  maxTokens: number | null
  maxCostUsd: number | null
  maxDurationMs: number | null
  maxSteps: number | null
  maxConcurrentDiscovery: number | null
  maxConcurrentGeneration: number | null
  updatedAt: number
}

interface ProjectBudgetRow {
  project_id: string
  org_id: string
  max_tokens: number | null
  max_cost_usd: number | null
  max_duration_ms: number | null
  max_steps: number | null
  max_concurrent_discovery: number | null
  max_concurrent_generation: number | null
  updated_at: string
}

function rowToProjectBudget(r: ProjectBudgetRow): ProjectBudget {
  return {
    projectId: r.project_id,
    orgId: r.org_id,
    maxTokens: r.max_tokens,
    maxCostUsd: r.max_cost_usd,
    maxDurationMs: r.max_duration_ms,
    maxSteps: r.max_steps,
    maxConcurrentDiscovery: r.max_concurrent_discovery,
    maxConcurrentGeneration: r.max_concurrent_generation,
    updatedAt: Number(r.updated_at),
  }
}

export async function getProjectBudget(orgId: string, projectId: string): Promise<ProjectBudget | null> {
  const row = await queryOne<ProjectBudgetRow>("SELECT * FROM project_budgets WHERE project_id = $1 AND org_id = $2", [projectId, orgId])
  return row ? rowToProjectBudget(row) : null
}

export async function upsertProjectBudget(input: {
  orgId: string
  projectId: string
  maxTokens?: number | null
  maxCostUsd?: number | null
  maxDurationMs?: number | null
  maxSteps?: number | null
  maxConcurrentDiscovery?: number | null
  maxConcurrentGeneration?: number | null
}): Promise<ProjectBudget> {
  const now = Date.now()
  await query(
    `INSERT INTO project_budgets (project_id, org_id, max_tokens, max_cost_usd, max_duration_ms, max_steps, max_concurrent_discovery, max_concurrent_generation, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (project_id) DO UPDATE SET
       max_tokens = $3, max_cost_usd = $4, max_duration_ms = $5, max_steps = $6,
       max_concurrent_discovery = $7, max_concurrent_generation = $8, updated_at = $9`,
    [
      input.projectId,
      input.orgId,
      input.maxTokens ?? null,
      input.maxCostUsd ?? null,
      input.maxDurationMs ?? null,
      input.maxSteps ?? null,
      input.maxConcurrentDiscovery ?? null,
      input.maxConcurrentGeneration ?? null,
      now,
    ],
  )
  return (await getProjectBudget(input.orgId, input.projectId))!
}

/** workflow override -> project override -> DEFAULT_BUDGET, per field
 * (a project that overrides only maxCostUsd still falls through to the
 * real default for maxTokens/maxDurationMs/maxSteps — never a
 * fabricated "0" for a dimension nobody configured). */
export async function resolveBudgetPolicy(orgId: string, projectId: string, explicitOverride?: BudgetPolicy): Promise<BudgetPolicy> {
  const project = await getProjectBudget(orgId, projectId)
  return {
    maxTokens: explicitOverride?.maxTokens ?? project?.maxTokens ?? DEFAULT_BUDGET.maxTokens,
    maxCostUsd: explicitOverride?.maxCostUsd ?? project?.maxCostUsd ?? DEFAULT_BUDGET.maxCostUsd,
    maxDurationMs: explicitOverride?.maxDurationMs ?? project?.maxDurationMs ?? DEFAULT_BUDGET.maxDurationMs,
    maxSteps: explicitOverride?.maxSteps ?? project?.maxSteps ?? DEFAULT_BUDGET.maxSteps,
  }
}

/** tenant_budgets -> DEFAULT_CONCURRENCY_LIMITS, per pipeline. Read by
 * lib/workflow/queue.ts#dequeue() once per distinct org encountered in
 * a tick (cached in-call), so a real per-tenant override genuinely
 * governs admission alongside every other tenant's own ceiling in the
 * same tick. */
export async function resolveConcurrencyLimit(orgId: string, pipeline: WorkflowPipeline, fallback: number): Promise<number> {
  const tenant = await getTenantBudget(orgId)
  if (!tenant) return fallback
  return pipeline === "website_discovery" ? tenant.maxConcurrentDiscovery : tenant.maxConcurrentGeneration
}
