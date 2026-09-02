// CATEGORY A — pure runtime test (no external credentials, no DB): server-side permission enforcement (ALLOW/DENY/REQUIRES_APPROVAL) against the real runToolAction(), with fakes only at the ToolAction boundary.
import { describe, expect, it, vi } from "vitest"
import { runToolAction } from "@/lib/agent/tool-runner"
import { ApprovalRequiredError, PermissionDeniedError } from "@/lib/agent/types"
import type { ToolAction, ToolContext } from "@/lib/agent/types"
import type { WorkerIntegrationConfig } from "@/lib/workforce/model"

function makeAction(overrides: Partial<ToolAction> = {}): ToolAction {
  return {
    id: "update_lead",
    label: "Update lead",
    permission: "write",
    riskLevel: "medium",
    run: vi.fn(async () => ({ ok: true, data: {}, durationMs: 1 })),
    ...overrides,
  }
}

function ctx(integrations: WorkerIntegrationConfig[] = []): ToolContext {
  return { workerId: "worker_1", executionId: "exec_1", emit: () => {}, integrations }
}

describe("runToolAction — server-side permission enforcement (section 7)", () => {
  it("ALLOW: an explicit Studio 'allow' override runs the action even though it is normally high-risk", async () => {
    const action = makeAction()
    const integrations: WorkerIntegrationConfig[] = [{ connectorId: "connector_salesforce", connectionId: "conn_1", actions: [{ actionId: "update_lead", enabled: true, permission: "allow" }] }]
    const result = await runToolAction("connector_salesforce.actions", "Salesforce", action, { id: "1" }, ctx(integrations))
    expect(result.ok).toBe(true)
    expect(action.run).toHaveBeenCalledOnce()
  })

  it("DENY: an explicit Studio 'deny' override throws PermissionDeniedError — the action never runs", async () => {
    const action = makeAction()
    const integrations: WorkerIntegrationConfig[] = [{ connectorId: "connector_salesforce", connectionId: "conn_1", actions: [{ actionId: "update_lead", enabled: true, permission: "deny" }] }]
    await expect(runToolAction("connector_salesforce.actions", "Salesforce", action, { id: "1" }, ctx(integrations))).rejects.toBeInstanceOf(PermissionDeniedError)
    expect(action.run).not.toHaveBeenCalled()
  })

  it("REQUIRES_APPROVAL: an explicit Studio override throws ApprovalRequiredError with the real captured input — the action never runs", async () => {
    const action = makeAction()
    const integrations: WorkerIntegrationConfig[] = [{ connectorId: "connector_salesforce", connectionId: "conn_1", actions: [{ actionId: "update_lead", enabled: true, permission: "requires_approval" }] }]
    const input = { id: "lead_42", fields: { Rating: "Hot" } }
    await expect(runToolAction("connector_salesforce.actions", "Salesforce", action, input, ctx(integrations))).rejects.toMatchObject({
      constructor: ApprovalRequiredError,
      actionId: "update_lead",
      input,
    })
    expect(action.run).not.toHaveBeenCalled()
  })

  it("with no explicit override, a low-risk (read) action runs immediately", async () => {
    const action = makeAction({ id: "search_leads", permission: "read", riskLevel: "low" })
    const result = await runToolAction("connector_salesforce.actions", "Salesforce", action, { query: "acme" }, ctx())
    expect(result.ok).toBe(true)
    expect(action.run).toHaveBeenCalledOnce()
  })

  it("with no explicit override, a high-risk action (write/publish/delete/financial/external_communication) requires approval by the blanket default rule", async () => {
    const action = makeAction({ permission: "external_communication" })
    await expect(runToolAction("connector_slack.actions", "Slack", action, { text: "hi" }, ctx())).rejects.toBeInstanceOf(ApprovalRequiredError)
    expect(action.run).not.toHaveBeenCalled()
  })

  it("a disabled override (enabled: false) is ignored — falls back to the blanket default rule", async () => {
    const action = makeAction()
    const integrations: WorkerIntegrationConfig[] = [{ connectorId: "connector_salesforce", connectionId: "conn_1", actions: [{ actionId: "update_lead", enabled: false, permission: "allow" }] }]
    await expect(runToolAction("connector_salesforce.actions", "Salesforce", action, { id: "1" }, ctx(integrations))).rejects.toBeInstanceOf(ApprovalRequiredError)
  })

  it("an override for a DIFFERENT action id never applies to this one", async () => {
    const action = makeAction({ id: "update_lead" })
    const integrations: WorkerIntegrationConfig[] = [{ connectorId: "connector_salesforce", connectionId: "conn_1", actions: [{ actionId: "create_opportunity", enabled: true, permission: "allow" }] }]
    await expect(runToolAction("connector_salesforce.actions", "Salesforce", action, { id: "1" }, ctx(integrations))).rejects.toBeInstanceOf(ApprovalRequiredError)
  })

  // Connector platform audit, gap #3: with no explicit override, riskLevel
  // alone (not just permission) must also gate approval — a hypothetical
  // action declared permission:"read" but riskLevel:"high"/"critical" must
  // never slip through just because "read" itself isn't in
  // HIGH_RISK_PERMISSIONS. No real connector today declares this
  // combination (every real "read" action is "low" risk) — this proves
  // the gate doesn't depend on that discipline holding.
  it("with no explicit override, a read+critical action still requires approval (risk level, not just permission, gates the default rule)", async () => {
    const action = makeAction({ id: "run_sensitive_report", permission: "read", riskLevel: "critical" })
    await expect(runToolAction("connector_x.actions", "Connector X", action, {}, ctx())).rejects.toBeInstanceOf(ApprovalRequiredError)
    expect(action.run).not.toHaveBeenCalled()
  })

  it("with no explicit override, a read+high action also requires approval", async () => {
    const action = makeAction({ id: "run_sensitive_query", permission: "read", riskLevel: "high" })
    await expect(runToolAction("connector_x.actions", "Connector X", action, {}, ctx())).rejects.toBeInstanceOf(ApprovalRequiredError)
  })

  it("an explicit 'allow' override still runs a read+critical action — an operator's deliberate override always wins, exactly like it does for a high-risk permission", async () => {
    const action = makeAction({ id: "run_sensitive_report", permission: "read", riskLevel: "critical" })
    const integrations: WorkerIntegrationConfig[] = [{ connectorId: "connector_x", connectionId: "conn_1", actions: [{ actionId: "run_sensitive_report", enabled: true, permission: "allow" }] }]
    const result = await runToolAction("connector_x.actions", "Connector X", action, {}, ctx(integrations))
    expect(result.ok).toBe(true)
    expect(action.run).toHaveBeenCalledOnce()
  })

  it("with no explicit override, a read+low/medium action runs immediately (the common, honest case every real connector today uses)", async () => {
    const lowAction = makeAction({ id: "list_items", permission: "read", riskLevel: "low" })
    const mediumAction = makeAction({ id: "list_items_2", permission: "read", riskLevel: "medium" })
    await expect(runToolAction("connector_x.actions", "Connector X", lowAction, {}, ctx())).resolves.toMatchObject({ ok: true })
    await expect(runToolAction("connector_x.actions", "Connector X", mediumAction, {}, ctx())).resolves.toMatchObject({ ok: true })
  })
})
