/* EXPLAINABILITY NOTE — "Leitura explicável" (RE/MAX Knowledge
 * reference, docs/remax-knowledge-design-reference.md §1.3). A score
 * or state is never shown bare — this is the shared, real, plain-
 * prose explanation block every Object UI surface (Inspector, field
 * node detail) renders right below the object's key metrics. Text
 * comes from lib/ontology/explain.ts, grounded only in real fields —
 * never a canned line. */

import { Sparkles } from "lucide-react"

export function ExplainabilityNote({ text }: { text: string | null }) {
  return (
    <div className="border-t border-border/60 px-4 py-3">
      <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
        <Sparkles className="size-3" /> Leitura explicável
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
        {text ?? "Ainda não há dados reais suficientes para uma leitura explicável deste objeto."}
      </p>
    </div>
  )
}
