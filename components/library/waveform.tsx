"use client"

/* A lightweight amplitude waveform — bars scale from a shared signal. */
export function Waveform({
  amplitudes,
  active,
  className = "",
}: {
  amplitudes: number[]
  active: boolean
  className?: string
}) {
  return (
    <div className={`flex h-full items-center justify-center gap-[3px] ${className}`} aria-hidden="true">
      {amplitudes.map((a, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full transition-[height,opacity] duration-100"
          style={{
            height: `${Math.max(6, a * 100)}%`,
            opacity: active ? 0.55 + a * 0.45 : 0.2,
            backgroundColor: active ? "var(--primary)" : "var(--muted-foreground)",
          }}
        />
      ))}
    </div>
  )
}
