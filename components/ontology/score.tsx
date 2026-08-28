/* Score / ScoreBreakdown — the one real numeric-value convention
 * (design-system-v4.md §1): font-mono tabular-nums, "—" for a real
 * null (Unavailable), never a fabricated 0. */

export function Score({ value, label }: { value: number | null; label?: string }) {
  return (
    <span className="inline-flex flex-col items-end">
      <span className="font-mono text-sm tabular-nums text-foreground">{value != null ? Math.round(value) : "—"}</span>
      {label && <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>}
    </span>
  )
}

export function ScoreBreakdown({ components }: { components: { label: string; value: number | null }[] }) {
  const known = components.filter((c) => c.value != null)
  if (known.length === 0) return <p className="text-[12.5px] text-muted-foreground">No real score components computed yet.</p>
  return (
    <div className="flex flex-col gap-2">
      {components.map((c) => (
        <div key={c.label} className="flex items-center gap-3">
          <span className="w-36 shrink-0 text-[12.5px] text-muted-foreground">{c.label}</span>
          {c.value != null ? (
            <>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Math.min(100, c.value))}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground">{Math.round(c.value)}</span>
            </>
          ) : (
            <span className="flex-1 text-[11px] text-muted-foreground">not available</span>
          )}
        </div>
      ))}
    </div>
  )
}
