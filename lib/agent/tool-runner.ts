import "server-only"

/* ================================================================== *
 * TOOL RUNNER — the one place a skill invokes a tool action, so the
 * approval gate is enforced once, centrally, rather than trusted to
 * every skill author to remember. Skills call runToolAction() instead
 * of action.run() directly.
 *
 * Real permission hierarchy (Organization -> Integration -> Agent ->
 * Agent Version -> Action -> Resource): a Worker's own, explicit,
 * Studio-configured decision for this exact (toolId, actionId) — see
 * WorkerContext.integrations / lib/workforce/model.ts's
 * WorkerIntegrationConfig — always wins when one exists:
 *
 *   "allow"             -> runs immediately, even if normally high-risk
 *                            (an operator's deliberate, informed override)
 *   "deny"              -> throws PermissionDeniedError, never runs
 *   "requires_approval" -> throws ApprovalRequiredError, never runs
 *
 * With no explicit decision for this action, the safe default gates on
 * BOTH real signals a ToolAction carries — permission and riskLevel —
 * never permission alone (connector platform audit, gap #3: a
 * hypothetical action declared permission:"read" but riskLevel:"high"/
 * "critical" must still require approval; every real connector/native
 * tool today happens to keep read+low together, but the gate must not
 * rely on that discipline holding forever as more connectors are added):
 *
 *   ToolAction.permission in HIGH_RISK_PERMISSIONS
 *     OR ToolAction.riskLevel is "high"/"critical"
 *                                  -> throws ApprovalRequiredError
 *                                     BEFORE the action ever executes
 *   otherwise                     -> runs immediately
 *
 * Every registered native tool's actions are read/low — this gate is
 * real and load-bearing for them too, it is just never triggered by
 * that catalog. Connector actions (Slack send_message, Salesforce
 * update_lead/create_opportunity) are where this is actually exercised.
 * ================================================================== */

import { ApprovalRequiredError, PermissionDeniedError } from "./types"
import type { ToolAction, ToolActionResult, ToolContext } from "./types"
import { requiresApprovalByDefault } from "@/lib/workforce/model"

export async function runToolAction<T>(
  toolId: string,
  toolName: string,
  action: ToolAction,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolActionResult<T>> {
  const override = (ctx.integrations ?? []).flatMap((cfg) => cfg.actions).find((a) => a.actionId === action.id && a.enabled)?.permission

  if (override === "deny") {
    throw new PermissionDeniedError(toolId, toolName, action.label)
  }
  if (override === "requires_approval" || (!override && requiresApprovalByDefault(action))) {
    throw new ApprovalRequiredError(toolId, toolName, action.label, action.permission, action.id, input)
  }
  // override === "allow" (or no override and the blanket rule is
  // read/low-risk) — both real, both correctly reach the action.
  return action.run(input, ctx) as Promise<ToolActionResult<T>>
}
