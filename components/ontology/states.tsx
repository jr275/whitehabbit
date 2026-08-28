/* EmptyState / LoadingState / ErrorState — the one shared, honest
 * state-rendering convention used across the ontology surfaces.
 * Never a decorative spinner or a placeholder that looks like data. */

import { CircleAlert, Clock3, type LucideIcon } from "lucide-react"

export function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-border px-5 py-6">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

export function LoadingState({ label = "Carregando dados reais…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Clock3 className="size-4" /> {label}
    </div>
  )
}

export function ErrorState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
      <CircleAlert className="size-5 text-destructive" />
      <p className="mt-4 text-sm font-semibold">{title}</p>
      <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  )
}
