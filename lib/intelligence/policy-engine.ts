import "server-only"

/* ================================================================== *
 * POLICY ENGINE (Phase 7, §5, ADR-039) — the real, backend-owned gate
 * evaluated before an ActionExecutor ever dispatches a real execution.
 * Never the agent's own call (§5: "The agent must NEVER decide whether
 * it is allowed to execute itself"). Deliberately does not re-litigate
 * whether this Decision SHOULD be executed — decideOnDecision()
 * (lib/intelligence/decisions.ts) is the one real human-approval gate
 * for that, unchanged from Phase 6. This evaluates whether the
 * approved Decision's ActionPlan can be dispatched RIGHT NOW: is it a
 * real, supported action, does the recommended agent actually hold
 * every capability it needs, is the Decision still fresh (not
 * expired), and does its own estimated cost already exceed this
 * project's real budget ceiling — a real, useful pre-check that avoids
 * starting a doomed run rather than discovering the same
 * BudgetExceededError deep inside step execution.
 * ================================================================== */

import type { ActionPlan } from "./action-plan"
import type { IntelligenceDecision } from "./decisions"
import { hasCapability } from "@/lib/workflow/permissions"
import { resolveBudgetPolicy } from "@/lib/workflow/budget-policy"
import { translateStatus } from "@/lib/ontology/pt-br"

export interface PolicyDecision {
  allowed: boolean
  reason: string
}

/* `reason` is real, user-facing text (rendered directly in the Action
 * UI, Fase 3 §7) — written in pt-BR. The all-caps prefixes
 * (STALE_DECISION/MISSING_CAPABILITY/BUDGET_EXCEEDED) are real internal
 * codes some tests match on (tests/integration/decision-action-bridge.test.ts)
 * and stay exactly as-is; only the natural-language explanation after
 * each one is translated. */
export async function evaluatePolicy(plan: ActionPlan, decision: IntelligenceDecision): Promise<PolicyDecision> {
  if (plan.status === "unsupported") {
    return { allowed: false, reason: plan.unsupportedReason ?? `Ainda não existe um caminho real de execução para ${plan.actionType}.` }
  }

  if (decision.status !== "approved") {
    return { allowed: false, reason: `A decisão está "${translateStatus(decision.status).toLowerCase()}", não "aprovada" — o executor de ações nunca despacha uma ação para uma decisão que um humano ainda não aprovou.` }
  }

  if (decision.expiresAt != null && decision.expiresAt < Date.now()) {
    return { allowed: false, reason: `STALE_DECISION — esta decisão expirou em ${new Date(decision.expiresAt).toLocaleString("pt-BR")}; a evidência sobre a qual foi aprovada pode não valer mais. Rode novamente a varredura de correlação/decisão para obter uma decisão atualizada.` }
  }

  // §6: fail closed. A plan naming an agent with a capability it
  // doesn't actually hold is BLOCKED, never a best-effort attempt.
  if (plan.agentType) {
    const missing = plan.requiredCapabilities.filter((cap) => !hasCapability(plan.agentType!, cap))
    if (missing.length > 0) {
      return { allowed: false, reason: `MISSING_CAPABILITY — ${plan.agentType} não possui a${missing.length === 1 ? "" : "s"} capacidade${missing.length === 1 ? "" : "s"} necessária${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.` }
    }
  } else if (plan.requiredCapabilities.length > 0) {
    return { allowed: false, reason: `MISSING_CAPABILITY — esta ação exige capacidades (${plan.requiredCapabilities.join(", ")}), mas nenhum agente está designado para executá-la.` }
  }

  // A real, useful pre-check: the Decision Engine's own estimated cost
  // (lib/intelligence/decision-engine.ts's COST_BY_ACTION) compared
  // against this project's real, resolved budget ceiling — rejecting
  // here avoids starting a real run this project's own budget would
  // guarantee fails partway through.
  if (plan.executionPolicy === "workflow") {
    const budget = await resolveBudgetPolicy(plan.orgId, plan.projectId)
    if (budget.maxSteps != null && plan.estimatedCost.agentSteps != null && plan.estimatedCost.agentSteps > budget.maxSteps) {
      return { allowed: false, reason: `BUDGET_EXCEEDED — esta ação estima ${plan.estimatedCost.agentSteps} etapas, o que já excede o teto de ${budget.maxSteps} etapas orçado para o projeto.` }
    }
    if (budget.maxTokens != null && plan.estimatedCost.tokens != null && plan.estimatedCost.tokens > budget.maxTokens) {
      return { allowed: false, reason: `BUDGET_EXCEEDED — esta ação estima ${plan.estimatedCost.tokens} tokens, o que já excede o teto de ${budget.maxTokens} tokens orçado para o projeto.` }
    }
  }

  return { allowed: true, reason: "Verificações de política aprovadas: decisão aprovada e atualizada, todas as capacidades necessárias presentes, custo estimado dentro do orçamento." }
}
