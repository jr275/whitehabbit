import "server-only"

/* ================================================================== *
 * HUMAN APPROVAL (§12) — durable, real. A workflow that reaches
 * WAITING_APPROVAL stays there until a real reviewer decides (or the
 * request expires) — never auto-resolved, never resolved by the agent
 * that requested it (§13: "Never let an LLM decide its own permission").
 * ================================================================== */

import { randomUUID } from "node:crypto"
import { query, queryOne } from "@/lib/db/client"
import { finalizeWorkflow, markWaitingApproval, workflowEngine } from "./engine"

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "cancelled"
export type RiskLevel = "low" | "medium" | "high" | "critical"

export interface ApprovalRequest {
  id: string
  orgId: string
  projectId: string
  workflowRunId: string
  artifactType: string
  artifactId: string
  requestedByAgent: string
  approvalType: string
  riskLevel: RiskLevel
  status: ApprovalStatus
  reviewer: string | null
  decisionReason: string | null
  createdAt: number
  expiresAt: number | null
  resolvedAt: number | null
}

interface ApprovalSqlRow {
  id: string
  org_id: string
  project_id: string
  workflow_run_id: string
  artifact_type: string
  artifact_id: string
  requested_by_agent: string
  approval_type: string
  risk_level: RiskLevel
  status: ApprovalStatus
  reviewer: string | null
  decision_reason: string | null
  created_at: string
  expires_at: string | null
  resolved_at: string | null
}

function rowToApproval(r: ApprovalSqlRow): ApprovalRequest {
  return {
    id: r.id,
    orgId: r.org_id,
    projectId: r.project_id,
    workflowRunId: r.workflow_run_id,
    artifactType: r.artifact_type,
    artifactId: r.artifact_id,
    requestedByAgent: r.requested_by_agent,
    approvalType: r.approval_type,
    riskLevel: r.risk_level,
    status: r.status,
    reviewer: r.reviewer,
    decisionReason: r.decision_reason,
    createdAt: Number(r.created_at),
    expiresAt: r.expires_at ? Number(r.expires_at) : null,
    resolvedAt: r.resolved_at ? Number(r.resolved_at) : null,
  }
}

/** Requests approval AND pauses the workflow at WAITING_APPROVAL in one
 * real action — a workflow can never be "waiting approval" without a
 * corresponding durable approvals row a reviewer can actually see. */
export async function requestApproval(input: {
  orgId: string
  projectId: string
  workflowRunId: string
  artifactType: string
  artifactId: string
  requestedByAgent: string
  approvalType: string
  riskLevel: RiskLevel
  expiresInMs?: number
}): Promise<ApprovalRequest> {
  const id = `appr_${randomUUID()}`
  const now = Date.now()
  const expiresAt = input.expiresInMs ? now + input.expiresInMs : null
  await query(
    `INSERT INTO approvals (id, org_id, project_id, workflow_run_id, artifact_type, artifact_id, requested_by_agent, approval_type, risk_level, status, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11)`,
    [id, input.orgId, input.projectId, input.workflowRunId, input.artifactType, input.artifactId, input.requestedByAgent, input.approvalType, input.riskLevel, now, expiresAt],
  )
  await markWaitingApproval(input.workflowRunId, input.orgId)
  return {
    id,
    orgId: input.orgId,
    projectId: input.projectId,
    workflowRunId: input.workflowRunId,
    artifactType: input.artifactType,
    artifactId: input.artifactId,
    requestedByAgent: input.requestedByAgent,
    approvalType: input.approvalType,
    riskLevel: input.riskLevel,
    status: "pending",
    reviewer: null,
    decisionReason: null,
    createdAt: now,
    expiresAt,
    resolvedAt: null,
  }
}

/** Latest approval (any status) for a specific artifact+type — the real
 * lookup a resumed workflow uses to tell "has a human already decided
 * this" apart from "this is the first time we've reached this gate". */
export async function getApprovalForArtifact(orgId: string, artifactType: string, artifactId: string, approvalType: string): Promise<ApprovalRequest | null> {
  const row = await queryOne<ApprovalSqlRow>(
    "SELECT * FROM approvals WHERE org_id = $1 AND artifact_type = $2 AND artifact_id = $3 AND approval_type = $4 ORDER BY created_at DESC LIMIT 1",
    [orgId, artifactType, artifactId, approvalType],
  )
  return row ? rowToApproval(row) : null
}

export async function getApproval(id: string, orgId: string): Promise<ApprovalRequest | null> {
  const row = await queryOne<ApprovalSqlRow>("SELECT * FROM approvals WHERE id = $1 AND org_id = $2", [id, orgId])
  return row ? rowToApproval(row) : null
}

export async function listApprovals(orgId: string, status: ApprovalStatus = "pending"): Promise<ApprovalRequest[]> {
  const rows = await query<ApprovalSqlRow>("SELECT * FROM approvals WHERE org_id = $1 AND status = $2 ORDER BY created_at DESC", [orgId, status])
  return rows.map(rowToApproval)
}

/** The one real path out of WAITING_APPROVAL. Approving resumes the
 * workflow (RUNNING) — the caller is responsible for actually
 * re-invoking the orchestrator so it can act on the approval (this
 * function only records the decision and unblocks the state machine,
 * exactly like every other engine transition). Rejecting fails the
 * workflow with the reviewer's real reason, never silently. */
export async function decideApproval(id: string, orgId: string, decision: "approved" | "rejected", reviewer: string, reason?: string): Promise<ApprovalRequest | null> {
  const approval = await getApproval(id, orgId)
  if (!approval || approval.status !== "pending") return null
  const now = Date.now()
  await query("UPDATE approvals SET status = $1, reviewer = $2, decision_reason = $3, resolved_at = $4 WHERE id = $5", [decision, reviewer, reason ?? null, now, id])

  if (decision === "approved") {
    await workflowEngine.resume(approval.workflowRunId, orgId)
  } else {
    await finalizeWorkflow(approval.workflowRunId, orgId, "failed", { errorReason: `Approval rejected by ${reviewer}${reason ? `: ${reason}` : ""}.` })
  }
  return { ...approval, status: decision, reviewer, decisionReason: reason ?? null, resolvedAt: now }
}

/** Real expiry — never silently left pending forever, never silently
 * auto-approved. Called opportunistically (e.g. before listing
 * approvals), not on a schedule (no cron infra assumed here beyond
 * what the queue worker already provides). */
export async function expireOverdueApprovals(orgId: string): Promise<number> {
  const now = Date.now()
  const overdue = await query<ApprovalSqlRow>("SELECT * FROM approvals WHERE org_id = $1 AND status = 'pending' AND expires_at IS NOT NULL AND expires_at < $2", [orgId, now])
  for (const row of overdue) {
    const approval = rowToApproval(row)
    await query("UPDATE approvals SET status = 'expired', resolved_at = $1 WHERE id = $2", [now, approval.id])
    await finalizeWorkflow(approval.workflowRunId, orgId, "failed", { errorReason: "Approval request expired without a reviewer decision." }).catch(() => {
      // the workflow may already be terminal for another reason — expiry
      // is best-effort cleanup of the approval record itself, never a
      // reason to throw out of a listing call.
    })
  }
  return overdue.length
}
