"use client"

/* Circular strength gauge — the Worker's overall strength as a ring. */
export function StrengthRing({
  value,
  size = 132,
  label = "Strength",
}: {
  value: number
  size?: number
  label?: string
}) {
  const stroke = size < 90 ? 6 : 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value)) / 100
  const dash = c * pct

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-white/8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#strengthGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1)" }}
        />
        <defs>
          <linearGradient id="strengthGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(226 90% 72%)" />
            <stop offset="100%" stopColor="hsl(250 85% 66%)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-white" style={{ fontSize: size < 90 ? "1.25rem" : "1.875rem" }}>
          {Math.round(value)}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">{label}</span>
      </div>
    </div>
  )
}
