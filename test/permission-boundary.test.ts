/* ================================================================== *
 * CATEGORY A — pure runtime test (no external credentials, no DB):
 * connector platform audit, gap #3. Proves lib/workforce/model.ts's
 * requiresApprovalByDefault() — the ONE rule both the UI-facing
 * toolExecutionBoundary() (Studio's Tools step, WorkerCanvas) and the
 * real server-side gate (lib/agent/tool-runner.ts's runToolAction(),
 * covered separately in test/tool-runner.test.ts) share — never two
 * independently-drifting copies of the same decision.
 * ================================================================== */

import { describe, expect, it } from "vitest"

describe("requiresApprovalByDefault / toolExecutionBoundary — permission AND risk level both gate approval (gap #3)", () => {
  it("permission alone (the pre-existing rule) still gates: write/publish/delete/financial/external_communication all require approval regardless of risk level", async () => {
    const { requiresApprovalByDefault } = await import("@/lib/workforce/model")
    for (const permission of ["write", "publish", "delete", "financial", "external_communication"] as const) {
      expect(requiresApprovalByDefault({ permission, riskLevel: "low" })).toBe(true)
    }
  })

  it("risk level alone now also gates: a hypothetical read+high or read+critical action requires approval even though 'read' is not in HIGH_RISK_PERMISSIONS", async () => {
    const { requiresApprovalByDefault } = await import("@/lib/workforce/model")
    expect(requiresApprovalByDefault({ permission: "read", riskLevel: "high" })).toBe(true)
    expect(requiresApprovalByDefault({ permission: "read", riskLevel: "critical" })).toBe(true)
  })

  it("read+low and read+medium — the shape every real connector action in this repo actually declares today — never require approval", async () => {
    const { requiresApprovalByDefault } = await import("@/lib/workforce/model")
    expect(requiresApprovalByDefault({ permission: "read", riskLevel: "low" })).toBe(false)
    expect(requiresApprovalByDefault({ permission: "read", riskLevel: "medium" })).toBe(false)
  })

  it("toolExecutionBoundary() (the UI-facing preview) agrees with requiresApprovalByDefault() for a connected, enabled tool — proves the two surfaces can never silently disagree", async () => {
    const { toolExecutionBoundary, requiresApprovalByDefault } = await import("@/lib/workforce/model")
    const base = { id: "t1", name: "Tool", provider: "x", enabled: true, connected: true } as const
    const readCritical = { ...base, risk: "critical" as const, permission: "read" as const }
    const readLow = { ...base, risk: "low" as const, permission: "read" as const }
    expect(toolExecutionBoundary(readCritical)).toBe("requires_approval")
    expect(requiresApprovalByDefault({ permission: readCritical.permission, riskLevel: readCritical.risk })).toBe(true)
    expect(toolExecutionBoundary(readLow)).toBe("executable")
    expect(requiresApprovalByDefault({ permission: readLow.permission, riskLevel: readLow.risk })).toBe(false)
  })

  it("toolExecutionBoundary() still reports not_available/not_connected before ever consulting permission or risk", async () => {
    const { toolExecutionBoundary } = await import("@/lib/workforce/model")
    const disabled = { id: "t1", name: "Tool", provider: "x", enabled: false, connected: true, risk: "low" as const, permission: "read" as const }
    const notConnected = { id: "t1", name: "Tool", provider: "x", enabled: true, connected: false, risk: "low" as const, permission: "read" as const }
    expect(toolExecutionBoundary(disabled)).toBe("not_available")
    expect(toolExecutionBoundary(notConnected)).toBe("not_connected")
  })
})
