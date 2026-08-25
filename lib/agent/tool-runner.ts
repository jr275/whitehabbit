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
 * With no explicit decision for this action, the original blanket rule
 * is the safe default:
 *
 *   ToolAction.permission
 *     ├── read                     -> runs immediately
 *     └── write/publish/delete/
 *         financial/external_communication
 *                                  -> throws ApprovalRequiredError
 *                                     BEFORE the action ever executes
 *
 * Every registered native tool's actions are "read" — this gate is
 * real and load-bearing for them too, it is just never triggered by
 * that catalog. Connector actions (Slack send_message, Salesforce
 * update_lead/create_opportunity) are where this is actually exercised.
 * ================================================================== */

import { ApprovalRequiredError, PermissionDeniedError } from "./types"
import type { ToolAction, ToolActionResult, ToolContext } from "./types"
import { HIGH_RISK_PERMISSIONS } from "@/lib/workforce/model"

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
  if (override === "requires_approval" || (!override && HIGH_RISK_PERMISSIONS.includes(action.permission))) {
    throw new ApprovalRequiredError(toolId, toolName, action.label, action.permission, action.id, input)
  }
  // override === "allow" (or no override and the blanket rule is
  // read/low-risk) — both real, both correctly reach the action.
  return action.run(input, ctx) as Promise<ToolActionResult<T>>
}
