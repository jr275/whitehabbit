import "server-only"

/* ================================================================== *
 * TOOL RUNNER — the one place a skill invokes a tool action, so the
 * approval gate is enforced once, centrally, rather than trusted to
 * every skill author to remember. Skills call runToolAction() instead
 * of action.run() directly.
 *
 *   ToolAction.permission
 *     ├── read                     -> runs immediately
 *     └── write/publish/delete/
 *         financial/external_communication
 *                                  -> throws ApprovalRequiredError
 *                                     BEFORE the action ever executes
 *
 * Today every registered tool's actions are "read" (Web Search,
 * Browser, Analytics, LLM) — this gate is real and load-bearing, it is
 * just never triggered by the current catalog. It exists so a future
 * write/publish-permission tool (send email, publish a post, change a
 * budget) is blocked by construction, not by remembering to add a
 * check when that tool is built.
 * ================================================================== */

import { ApprovalRequiredError } from "./types"
import type { ToolAction, ToolActionResult, ToolContext } from "./types"
import { HIGH_RISK_PERMISSIONS } from "@/lib/workforce/model"

export async function runToolAction<T>(
  toolId: string,
  toolName: string,
  action: ToolAction,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolActionResult<T>> {
  if (HIGH_RISK_PERMISSIONS.includes(action.permission)) {
    throw new ApprovalRequiredError(toolId, toolName, action.label, action.permission)
  }
  return action.run(input, ctx) as Promise<ToolActionResult<T>>
}
