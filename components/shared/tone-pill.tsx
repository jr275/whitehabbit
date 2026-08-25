"use client"

/* Same tone->class convention as components/observatory/status-pill.tsx
 * and components/outputs/output-table.tsx's StatusPill, generalized so
 * the Workers directory/Worker Detail can render WORKER_RUNTIME_STATUS_META
 * and WORKER_HEALTH_STATE_META with the exact same visual language as
 * every other real status pill in the product. */

export function TonePill({ label, tone }: { label: string; tone: "good" | "info" | "warn" | "bad" | "muted" }) {
  const cls = tone === "good" ? "text-grow bg-grow/10" : tone === "info" ? "text-primary bg-primary/10" : tone === "warn" ? "text-warn bg-warn/10" : tone === "bad" ? "text-destructive bg-destructive/10" : "text-muted-foreground bg-secondary"
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${cls}`}>{label}</span>
}
