/* ================================================================== *
 * EXPLAINABILITY — "Leitura explicável" (RE/MAX Knowledge reference,
 * docs/remax-knowledge-design-reference.md §1.3): a score or state is
 * never shown bare. This builds one real, plain pt-BR sentence per
 * object, grounded ONLY in fields that are already real on that
 * object's own ObjectDetail (score, confidence, relationship counts by
 * type, evidence count) — never a canned/generic template, never an
 * invented factor (no "proximidade"/"diversidade" language unless we
 * actually compute those). Returns null when there simply isn't enough
 * real data yet to say anything honest — the caller renders that as an
 * explicit empty state, never a fabricated explanation.
 * ================================================================== */

import type { ObjectDetail } from "./object-resolver"
import { translateObjectType } from "./pt-br"

export function explainObjectDetail(detail: ObjectDetail): string | null {
  const parts: string[] = []

  if (detail.score != null && detail.confidence != null) {
    parts.push(`A pontuação de ${Math.round(detail.score)} reflete ${Math.round(detail.confidence * 100)}% de confiança nos dados reais coletados até agora`)
  } else if (detail.score != null) {
    parts.push(`A pontuação de ${Math.round(detail.score)} é calculada a partir dos componentes reais listados em Propriedades`)
  } else if (detail.confidence != null) {
    parts.push(`Este objeto tem ${Math.round(detail.confidence * 100)}% de confiança real registrada`)
  }

  if (detail.relationships.length > 0) {
    const byType = new Map<string, number>()
    for (const r of detail.relationships) byType.set(r.targetType, (byType.get(r.targetType) ?? 0) + 1)
    const breakdown = [...byType.entries()].map(([type, count]) => `${count} ${translateObjectType(type)}${count === 1 ? "" : "s"}`).join(", ")
    parts.push(`${parts.length > 0 ? "e está" : "Está"} conectado a ${breakdown}`)
  }

  if (detail.evidence.length > 0) {
    parts.push(`sustentado por ${detail.evidence.length} evidência${detail.evidence.length === 1 ? "" : "s"} real${detail.evidence.length === 1 ? "" : "is"}`)
  }

  if (parts.length === 0) return null
  return `${parts.join(", ")}.`
}
